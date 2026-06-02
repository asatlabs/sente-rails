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
"""Sente Rails public API v1 — Counter Shifts.

Auth (Phase 1A): Sente API Key via `X-Sente-Authorization: Bearer <key>`.
Counter shifts wrap assessments, so they share the assessments scope set:
    open / close / refresh                → assessments.write
    list / get / active                   → assessments.read
"""

import frappe
from frappe import _

from sente_rails.api.keys.auth import sente_api

# Curated, integrator-facing field set for a Counter Shift. Excludes only
# framework columns (owner, modified_by, docstatus, idx, doctype, …) —
# every business field on a shift is legitimate settlement/reconciliation
# data (the per-channel collection breakdown, cash variance, the clerk who
# ran it). `clerk` is kept: it is the settlement actor, and list_shifts
# already returns it. Keep in sync with the Counter Shift doctype.
_PUBLIC_SHIFT_FIELDS = (
	"name",
	"clerk",
	"mda",
	"counter_label",
	"status",
	"opened_at",
	"closed_at",
	"opening_float",
	"currency",
	"opening_notes",
	"assessment_count",
	"total_collected",
	"cash_collected",
	"momo_collected",
	"airtel_collected",
	"card_collected",
	"bank_collected",
	"voucher_collected",
	"cash_expected",
	"cash_counted",
	"cash_variance",
	"variance_reason",
	"closing_notes",
)


def _public_shift(doc) -> dict:
	"""Shape a Counter Shift into the public API representation — business +
	settlement fields only, never framework columns."""
	d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	return {k: d.get(k) for k in _PUBLIC_SHIFT_FIELDS if k in d}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def open_shift(
	mda: str,
	counter_label: str | None = None,
	opening_float: float = 0,
	currency: str = "UGX",
	opening_notes: str | None = None,
):
	"""Open a new shift at an MDA counter.

	Enforces single-open-shift-per-(clerk, mda) — caller must close any
	existing open shift before opening another.
	"""
	doc = frappe.get_doc(
		{
			"doctype": "Counter Shift",
			"mda": mda,
			"counter_label": counter_label,
			"opening_float": opening_float,
			"currency": currency,
			"opening_notes": opening_notes,
		}
	).insert()
	return _public_shift(doc)


@frappe.whitelist(allow_guest=True)
@sente_api(scope="assessments.read")
def get_shift(name: str):
	return _public_shift(frappe.get_doc("Counter Shift", name))


@frappe.whitelist(allow_guest=True)
@sente_api(scope="assessments.read")
def get_active_shift(mda: str = ""):
	"""Return the current user's open shift on the given MDA, or None.

	Used by the Clerk UI to detect whether the clerk needs to open a
	shift before they can transact. ``mda`` defaults to empty so a bare
	``GET /v1/counter-shifts/active`` doesn't 500 — the caller MUST
	supply ``?mda=...`` to get a useful answer; empty returns None.
	"""
	if not mda:
		return None
	name = frappe.db.get_value(
		"Counter Shift",
		{"clerk": frappe.session.user, "mda": mda, "status": "Open"},
		"name",
	)
	if not name:
		return None
	return _public_shift(frappe.get_doc("Counter Shift", name))


@frappe.whitelist(allow_guest=True)
@sente_api(scope="assessments.read")
def list_shifts(
	clerk: str | None = None,
	mda: str | None = None,
	status: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	start: int = 0,
	limit: int = 50,
):
	"""List shifts filtered by clerk / mda / status / date range."""
	filters: dict = {}
	if clerk:
		filters["clerk"] = clerk
	if mda:
		filters["mda"] = mda
	if status:
		filters["status"] = status
	if from_date and to_date:
		filters["opened_at"] = ["between", [from_date, to_date]]
	fields = [
		"name",
		"clerk",
		"mda",
		"counter_label",
		"status",
		"opened_at",
		"closed_at",
		"opening_float",
		"assessment_count",
		"total_collected",
		"cash_collected",
		"momo_collected",
		"airtel_collected",
		"cash_expected",
		"cash_counted",
		"cash_variance",
	]
	return frappe.get_all(
		"Counter Shift",
		filters=filters,
		fields=fields,
		start=int(start),
		page_length=min(int(limit), 200),
		order_by="opened_at desc",
	)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def close_shift(
	name: str, cash_counted: float, variance_reason: str | None = None, closing_notes: str | None = None
):
	"""Close a shift with a counted-cash value.

	Triggers refresh_aggregates() + variance computation.
	If |variance| > 0 and no variance_reason is provided, raises.
	"""
	shift = frappe.get_doc("Counter Shift", name)
	shift.close(cash_counted=cash_counted, variance_reason=variance_reason, closing_notes=closing_notes)
	return _public_shift(shift)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.read")
def refresh_aggregates(name: str):
	"""Manually recompute aggregates on an open shift (Clerk UI button)."""
	shift = frappe.get_doc("Counter Shift", name)
	shift.refresh_aggregates()
	shift.save()
	return _public_shift(shift)
