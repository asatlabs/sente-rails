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
"""Sente Rails public API v1 — Service catalog."""

import frappe

# Curated public field set for a service. allow_guest endpoint, so the
# allowlist doubles as a disclosure boundary: internal accounting/linkage
# fields (gl_account_credit, linked_item) and framework columns (owner,
# docstatus, idx, doctype, …) are never exposed. `description` + `tiers`
# are public detail surfaced by get_service; the list keeps a leaner set.
_PUBLIC_SERVICE_FIELDS = (
	"name",
	"mda",
	"code",
	"service_name",
	"status",
	"sector",
	"service_family",
	"fee_amount",
	"fee_currency",
	"fee_basis",
	"fee_schedule_ref",
	"efris_taxable",
	"vat_applicable",
	"vat_rate",
	"description",
)

# Public columns of the Service Tier child rows (tiered pricing). Child
# dicts otherwise carry parent/parentfield/parenttype/idx/docstatus/etc.
_PUBLIC_TIER_FIELDS = ("tier_label", "min_value", "max_value", "fee_amount", "per_unit", "notes")


def _public_service(doc) -> dict:
	"""Shape a Service doc into the public API representation, including the
	tiered-pricing child rows (shaped) and excluding internal + framework
	fields."""
	d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	out = {k: d.get(k) for k in _PUBLIC_SERVICE_FIELDS if k in d}
	tiers = d.get("tiers") or []
	out["tiers"] = [
		{tk: t.get(tk) for tk in _PUBLIC_TIER_FIELDS}
		for t in tiers
		if isinstance(t, dict)
	]
	return out


@frappe.whitelist(allow_guest=True)
def list_services(
	mda: str | None = None,
	sector: str | None = None,
	family: str | None = None,
	code: str | None = None,
	q: str | None = None,
	status: str | None = "Active",
	start: int = 0,
	limit: int = 100,
):
	"""List services in the catalog, scoped by MDA / sector / family."""
	limit = min(int(limit), 500)
	filters: dict = {}
	or_filters: dict = {}
	if mda:
		filters["mda"] = mda
	if sector:
		filters["sector"] = sector
	if family:
		filters["service_family"] = family
	if code:
		filters["code"] = code.upper()
	if status:
		filters["status"] = status
	if q:
		or_filters = {
			"service_name": ["like", f"%{q}%"],
			"code": ["like", f"%{q.upper()}%"],
		}
	fields = [
		"name",
		"mda",
		"code",
		"service_name",
		"sector",
		"service_family",
		"fee_amount",
		"fee_currency",
		"fee_basis",
		"fee_schedule_ref",
		"efris_taxable",
		"vat_applicable",
		"vat_rate",
		"status",
	]
	return frappe.get_all(
		"Service",
		filters=filters,
		or_filters=or_filters or None,
		fields=fields,
		start=int(start),
		page_length=limit,
		order_by="mda asc, code asc",
	)


@frappe.whitelist(allow_guest=True)
def get_service(name: str):
	"""Get a single service by docname (SVC-YYYY-######).

	Public shape — adds `description` and the tiered-pricing `tiers` rows on
	top of the list fields; excludes internal accounting (gl_account_credit,
	linked_item) and framework columns.
	"""
	return _public_service(frappe.get_doc("Service", name))
