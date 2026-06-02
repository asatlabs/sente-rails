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
"""Sente Rails public API v1 — Assessments (multi-MDA transactions).

Auth (Phase 1A): Sente API Key via `X-Sente-Authorization: Bearer <key>`.
Scope mapping per docs/API_SECURITY_DESIGN.md §3.4:
    list_assessments / get_assessment    → assessments.read
    create_assessment / assess           → assessments.write
    cancel                               → assessments.cancel
"""

import frappe
from frappe import _

from sente_rails.api.keys.auth import sente_api

# Curated, integrator-facing field set for a single assessment. Excludes:
#   - framework columns (owner, modified_by, docstatus, idx, doctype, …)
#   - idempotency_key — internal, server-minted retry token; never client-facing
#   - clerk — staff user identity (PII); counter attribution stays server-side
#   - linked_journal_entry — internal accounting linkage
# Keep in sync with the Assessment doctype's integrator-relevant fields.
_PUBLIC_ASSESSMENT_FIELDS = (
	"name",
	"citizen",
	"transaction_date",
	"status",
	"currency",
	"mda_default",
	"shift",
	"gross_amount",
	"total_amount",
	"discount_amount",
	"discount_reason",
	"payment_status",
	"payment_channel",
	"payment_reference",
	"paid_at",
	"notes",
)

# Public columns of the Assessment Line child rows. Child dicts otherwise
# carry parent/parentfield/parenttype/idx/docstatus/name/owner/etc.
_PUBLIC_LINE_FIELDS = (
	"mda",
	"service",
	"service_name",
	"fee_basis",
	"quantity",
	"rate",
	"amount",
	"efris_taxable",
	"fee_schedule_ref",
	"ura_prn",
	"efris_fdn",
	"notes",
)


def _public_assessment(doc) -> dict:
	"""Shape an Assessment doc into the public API representation, including
	its (shaped) line items, excluding framework + sensitive/internal fields."""
	d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	out = {k: d.get(k) for k in _PUBLIC_ASSESSMENT_FIELDS if k in d}
	lines = d.get("assessment_lines") or []
	out["assessment_lines"] = [
		{lk: ln.get(lk) for lk in _PUBLIC_LINE_FIELDS}
		for ln in lines
		if isinstance(ln, dict)
	]
	return out


@frappe.whitelist(allow_guest=True)
@sente_api(scope="assessments.read")
def list_assessments(
	citizen: str | None = None,
	status: str | None = None,
	shift: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	start: int = 0,
	limit: int = 50,
):
	"""List / filter assessments."""
	limit = min(int(limit), 200)
	filters: dict = {}
	if citizen:
		filters["citizen"] = citizen
	if status:
		filters["status"] = status
	if shift:
		filters["shift"] = shift
	if from_date and to_date:
		filters["transaction_date"] = ["between", [from_date, to_date]]
	elif from_date:
		filters["transaction_date"] = [">=", from_date]
	elif to_date:
		filters["transaction_date"] = ["<=", to_date]
	fields = [
		"name",
		"citizen",
		"transaction_date",
		"status",
		"mda_default",
		"shift",
		"total_amount",
		"currency",
		"payment_status",
		"payment_channel",
		"payment_reference",
		"paid_at",
	]
	return frappe.get_all(
		"Assessment",
		filters=filters,
		fields=fields,
		start=int(start),
		page_length=limit,
		order_by="transaction_date desc, creation desc",
	)


@frappe.whitelist(allow_guest=True)
@sente_api(scope="assessments.read")
def get_assessment(name: str):
	"""Get a single assessment with its lines."""
	return _public_assessment(frappe.get_doc("Assessment", name))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def create_assessment(
	citizen: str,
	lines: list,
	mda_default: str | None = None,
	currency: str = "UGX",
	notes: str | None = None,
	transaction_date: str | None = None,
):
	"""Create a new Draft assessment.

	Body shape:
	  {
	    "citizen": "CITIZEN-2026-000001",
	    "mda_default": "GULU",
	    "currency": "UGX",
	    "lines": [
	      {"mda": "GULU", "service": "SVC-2026-000004", "quantity": 1, "rate": 50000},
	      {"mda": "URA",  "service": "SVC-2026-000005", "quantity": 1, "rate": 15000}
	    ],
	    "notes": "optional free-form notes"
	  }
	"""
	if isinstance(lines, str):
		import json

		lines = json.loads(lines)
	if not lines:
		frappe.throw(_("At least one line is required."))

	# Assessment Line requires `mda`. The workbench's cart sends lines as
	# ``{service, quantity}`` (no mda — the cart doesn't track per-line
	# MDA, only the shift's). Derive each missing line's mda from the
	# Service's own mda (Service.mda is a required Link). Fall back to
	# ``mda_default`` if the lookup fails (e.g. stale service reference).
	for ln in lines:
		if isinstance(ln, dict) and not ln.get("mda"):
			svc = ln.get("service")
			svc_mda = frappe.db.get_value("Service", svc, "mda") if svc else None
			ln["mda"] = svc_mda or mda_default

	doc = frappe.get_doc(
		{
			"doctype": "Assessment",
			"citizen": citizen,
			"mda_default": mda_default,
			"currency": currency,
			"notes": notes,
			"transaction_date": transaction_date or frappe.utils.today(),
			"assessment_lines": lines,
		}
	)
	doc.insert()
	return _public_assessment(doc)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def assess(name: str):
	"""Transition an Assessment from Draft → Assessed (clerk confirms)."""
	doc = frappe.get_doc("Assessment", name)
	doc.status = "Assessed"
	doc.save()
	return _public_assessment(doc)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.cancel")
def cancel(name: str, reason: str | None = None):
	"""Transition an Assessment to Cancelled (e.g. clerk error, citizen walks away)."""
	doc = frappe.get_doc("Assessment", name)
	doc.status = "Cancelled"
	if reason:
		doc.notes = (doc.notes or "") + f"\n[Cancelled] {reason}"
	doc.save()
	return _public_assessment(doc)
