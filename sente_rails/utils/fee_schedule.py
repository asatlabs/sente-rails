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
"""Fee-schedule resolution helpers.

The Fee Schedule doctype stores a time-bounded history of how a Service
is priced. When an Assessment is created on a given date, the active
schedule for that (service, date) pair is the row whose date window
covers the date — there can be at most one such row.
"""

from typing import Optional

import frappe
from frappe.utils import getdate, today


def resolve_fee_for_date(service: str, on_date: str | None = None) -> str | None:
	"""Return the name of the active Fee Schedule for the given service
	on the given date, or None if no schedule covers that date.

	Active = effective_from <= on_date AND (effective_to IS NULL OR
	effective_to >= on_date).

	If multiple rows could match (shouldn't happen — controller enforces
	non-overlap, plus a unique constraint on (service, effective_from)),
	the most-recent effective_from wins.

	Args:
	    service: Service name (SVC-YYYY-NNNNNN).
	    on_date: ISO date string. Defaults to today.

	Returns:
	    Fee Schedule name, or None.
	"""
	target = getdate(on_date) if on_date else getdate(today())
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabFee Schedule`
		WHERE service = %(service)s
		  AND effective_from <= %(target)s
		  AND (effective_to IS NULL OR effective_to >= %(target)s)
		ORDER BY effective_from DESC
		LIMIT 1
		""",
		{"service": service, "target": target},
		as_dict=True,
	)
	return rows[0].name if rows else None


def get_active_schedule_doc(service: str, on_date: str | None = None):
	"""Convenience: returns the loaded Fee Schedule Document, or None."""
	name = resolve_fee_for_date(service, on_date)
	if not name:
		return None
	return frappe.get_doc("Fee Schedule", name)
