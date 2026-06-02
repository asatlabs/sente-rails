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
"""Helpers for creating + querying Anomaly Flag rows.

System detection points (Counter Shift.close, Assessment.validate,
the velocity-spike scheduler) call create_flag(). Manual operator
filing goes through normal doc insert.
"""

from typing import Optional

import frappe
from frappe.utils import now_datetime


def create_flag(
	flag_type: str,
	reference_doctype: str,
	reference_name: str,
	severity: str = "Medium",
	detection_rule: str | None = None,
	description: str | None = None,
	signal_value: float | None = None,
	threshold: float | None = None,
	flagged_by: str | None = None,
) -> str | None:
	"""Insert an Anomaly Flag row in status=Open. Returns the new name.

	Idempotent guard: if an Open flag already exists for the same
	(flag_type, reference_doctype, reference_name, detection_rule)
	tuple, returns the existing name instead of creating a duplicate.
	Once the existing flag is Resolved/False Positive, a new flag is
	created.
	"""
	existing = frappe.db.get_value(
		"Anomaly Flag",
		{
			"flag_type": flag_type,
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"detection_rule": detection_rule or "",
			"status": ["in", ("Open", "Investigating", "Escalated")],
		},
		"name",
	)
	if existing:
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "Anomaly Flag",
			"flag_type": flag_type,
			"severity": severity,
			"status": "Open",
			"flagged_at": now_datetime(),
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"detection_rule": detection_rule or "",
			"description": description or "",
			"signal_value": signal_value,
			"threshold": threshold,
			"flagged_by": flagged_by,
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name
