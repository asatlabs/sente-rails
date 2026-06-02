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
"""Daily replenish job for the EFRIS PRN buffer.

For every MDA with prn_buffer_target > 0, count the Available PRNs.
If below target, call reserve_batch to top up to target.

Scheduled daily in hooks.py — runs alongside the API key expiry sweep.
"""

import frappe

from sente_rails.sente_rails.doctype.efris_prn_reservation.efris_prn_reservation import (
	reserve_batch,
)


def replenish_buffer() -> dict:
	"""Walk MDAs with a target, top up to target. Returns a summary dict."""
	mdas = frappe.db.sql(
		"""
		SELECT name AS mda, prn_buffer_target
		FROM `tabMDA`
		WHERE IFNULL(prn_buffer_target, 0) > 0
		  AND IFNULL(status, '') = 'Active'
		""",
		as_dict=True,
	)
	summary = {"scanned": len(mdas), "topped_up": 0, "minted_total": 0, "noop": 0}
	for row in mdas:
		target = int(row.prn_buffer_target)
		available = frappe.db.count(
			"EFRIS PRN Reservation",
			{"reserved_for_mda": row.mda, "status": "Available"},
		)
		deficit = target - available
		if deficit <= 0:
			summary["noop"] += 1
			continue
		minted = reserve_batch(row.mda, deficit)
		summary["topped_up"] += 1
		summary["minted_total"] += len(minted)
	return summary
