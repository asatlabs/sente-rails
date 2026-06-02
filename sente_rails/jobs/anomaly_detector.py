# ─────────────────────────────────────────────────────────────────────────────
# Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
# Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>
#
# CONFIDENTIAL AND PROPRIETARY
#
# This source file is the original work of Geoffrey Oketwangwu and contains
# confidential, proprietary information protected under copyright and trade-
# secret law. No part may be reproduced, distributed, modified, reverse-
# engineered, or used — in source or compiled form — without the prior
# written permission of the author.
#
# All rights reserved.
"""Scheduled anomaly detectors.

Runs every 30 minutes per hooks.py cron. The only detector here
today is detect_velocity_spikes; new rules slot in as additional
module-level functions plus a new entry in hooks.py.
"""

import math
from collections import defaultdict
from datetime import timedelta

import frappe
from frappe.utils import now_datetime

from sente_rails.utils.anomaly import create_flag

# A clerk-hour is flagged when its count is > BASELINE_MEAN +
# (VELOCITY_SIGMA_FACTOR * BASELINE_STDDEV). Also requires at least
# MIN_BASELINE_HOURS of historical data to avoid flagging on a
# brand-new clerk.
VELOCITY_SIGMA_FACTOR = 2.0
MIN_BASELINE_HOURS = 24  # need at least a day's worth of history
BASELINE_DAYS = 7
LOOKBACK_HOURS = 24


def detect_velocity_spikes() -> dict:
	"""For every clerk active in the last 24h, compare each hour's
	assessment count to the clerk's 7-day baseline. Hours whose count
	is > mean + 2σ trigger a Velocity Spike Anomaly Flag.

	Returns a summary dict for the scheduler log.
	"""
	now = now_datetime()
	lookback_start = now - timedelta(hours=LOOKBACK_HOURS)
	baseline_start = now - timedelta(days=BASELINE_DAYS)

	# Recent rows: candidate clerk-hour spikes
	recent = frappe.db.sql(
		"""
		SELECT
		    clerk,
		    DATE_FORMAT(transaction_date, '%%Y-%%m-%%d') AS day_key,
		    DATE_FORMAT(creation, '%%Y-%%m-%%d %%H:00:00') AS hour_key,
		    COUNT(*) AS cnt
		FROM `tabAssessment`
		WHERE creation >= %(start)s AND clerk IS NOT NULL
		GROUP BY clerk, hour_key
		""",
		{"start": lookback_start},
		as_dict=True,
	)

	# Baseline: 7-day per-clerk hourly counts (excludes the lookback window)
	baseline = frappe.db.sql(
		"""
		SELECT
		    clerk,
		    DATE_FORMAT(creation, '%%Y-%%m-%%d %%H:00:00') AS hour_key,
		    COUNT(*) AS cnt
		FROM `tabAssessment`
		WHERE creation >= %(baseline_start)s
		  AND creation < %(lookback_start)s
		  AND clerk IS NOT NULL
		GROUP BY clerk, hour_key
		""",
		{"baseline_start": baseline_start, "lookback_start": lookback_start},
		as_dict=True,
	)

	# Build per-clerk baseline arrays
	baseline_by_clerk = defaultdict(list)
	for row in baseline:
		baseline_by_clerk[row.clerk].append(int(row.cnt))

	summary = {"clerks_checked": 0, "spikes_flagged": 0, "no_baseline": 0}
	for row in recent:
		clerk = row.clerk
		recent_count = int(row.cnt)
		baseline_counts = baseline_by_clerk.get(clerk, [])
		if len(baseline_counts) < MIN_BASELINE_HOURS:
			summary["no_baseline"] += 1
			continue
		mean = sum(baseline_counts) / len(baseline_counts)
		stddev = _stddev(baseline_counts, mean)
		threshold = mean + (VELOCITY_SIGMA_FACTOR * stddev)
		summary["clerks_checked"] += 1
		if recent_count <= max(threshold, mean + 1):
			# require both: above mean+2σ AND at least 1 above mean (so a
			# baseline of all-zeros doesn't trigger on the first txn).
			continue
		create_flag(
			flag_type="Velocity Spike",
			severity="Medium",
			reference_doctype="User",
			reference_name=clerk,
			detection_rule=f"velocity_spike_2sigma:{row.hour_key}",
			description=(
				f"Clerk {clerk} processed {recent_count} assessments in the "
				f"hour {row.hour_key}, above the 2σ threshold ({threshold:.1f}) "
				f"of their 7-day baseline (mean={mean:.1f}, stddev={stddev:.2f})."
			),
			signal_value=float(recent_count),
			threshold=float(threshold),
		)
		summary["spikes_flagged"] += 1

	return summary


def _stddev(values, mean):
	if not values:
		return 0.0
	variance = sum((v - mean) ** 2 for v in values) / len(values)
	return math.sqrt(variance)
