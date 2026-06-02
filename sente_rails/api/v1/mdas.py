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
"""Sente Rails public API v1 — MDAs (Ministries / Departments / Agencies / LGs)."""

import frappe

# Curated, integrator-facing field set for an MDA. This endpoint is
# allow_guest (the public landing renders the agency directory
# unauthenticated), so the allowlist is also a disclosure boundary:
# operational + financial-routing fields (treasury_account,
# integration_endpoint, push_webhook_url, api_credentials_ref,
# oversight_scopes, prn_buffer_target, propagation_rules) and framework
# columns (owner, docstatus, idx, doctype, …) are NEVER exposed here.
# Those live on the role-gated /v1/ops/* surface. Keep in sync with the
# MDA doctype's public business fields.
_PUBLIC_MDA_FIELDS = (
	"name",
	"short_code",
	"full_name",
	"mda_type",
	"country",
	"mode",
	"status",
	"sector",
	"integration_status",
	"target_endpoint_count",
	"parent_authority",
	"requires_explicit_consent",
	"contact_email",
	"contact_phone",
)


def _public_mda(doc) -> dict:
	"""Shape an MDA doc/dict into the public API representation — business
	fields only, never operational/financial-routing or framework columns."""
	d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	return {k: d.get(k) for k in _PUBLIC_MDA_FIELDS if k in d}


def _endpoint_count(mda_name: str) -> int:
	"""Active Service rows registered for this MDA — the real endpoint count."""
	return frappe.db.count("Service", {"mda": mda_name, "status": "Active"})


@frappe.whitelist(allow_guest=True)
def list_mdas(
	mode: str | None = None,
	country: str | None = None,
	mda_type: str | None = None,
	status: str | None = "Active",
	start: int = 0,
	limit: int = 100,
):
	"""List MDAs.

	Public read — the workbench landing at https://sente-rails.space/ shows the
	connected-agency directory unauthenticated. Nothing here is sensitive (no
	credentials, no integration secrets — those live on URA-EFRIS-style Mode B
	records but stay server-side).

	Query params:
		mode      — filter by interaction mode (A / B / C)
		country   — filter by Country Profile code (UG, KE, …)
		mda_type  — filter by entity type (City Authority, Ministry, …)
		status    — default 'Active'; pass empty string to get all
		start     — pagination offset
		limit     — page size (default 100, max 500)

	Returns each MDA augmented with `endpoint_count`: the number of Service
	rows where service.mda == this MDA. The workbench renders that count in
	the "Connected agencies" panel under each agency row.
	"""
	limit = min(int(limit), 500)
	filters: dict = {}
	if mode:
		filters["mode"] = mode
	if country:
		filters["country"] = country.upper()
	if mda_type:
		filters["mda_type"] = mda_type
	if status:
		filters["status"] = status
	rows = frappe.get_all(
		"MDA",
		filters=filters,
		fields=list(_PUBLIC_MDA_FIELDS),
		start=int(start),
		page_length=limit,
		order_by="short_code asc",
	)

	# Service-count enrichment: single grouped query, indexed lookup.
	# Real `endpoint_count` is the Service rows registered for this MDA today.
	# `target_endpoint_count` is the operator-curated estimate for Planned /
	# Inquiry MDAs — shown in the workbench so the catalogue doesn't render
	# as empty for not-yet-built MDAs.
	counts_raw = frappe.db.sql(
		"SELECT mda, COUNT(*) AS n FROM `tabService` WHERE status='Active' GROUP BY mda",
		as_dict=True,
	)
	counts = {r.mda: int(r.n) for r in counts_raw}
	for row in rows:
		actual = counts.get(row["name"], 0)
		row["endpoint_count"] = actual
		# `display_endpoint_count` is what the workbench should render:
		# the actual count if any services exist, else the target.
		row["display_endpoint_count"] = actual or (row.get("target_endpoint_count") or 0)

	return rows


@frappe.whitelist(allow_guest=True)
def get_mda(name: str):
	"""Get a single MDA by short_code.

	Public shape only (same allowlist as the list endpoint) plus the live
	`endpoint_count` / `display_endpoint_count` enrichment so a single-MDA
	fetch matches the directory rows exactly. Operational + framework fields
	are never exposed here.
	"""
	mda = _public_mda(frappe.get_doc("MDA", name))
	actual = _endpoint_count(mda["name"])
	mda["endpoint_count"] = actual
	mda["display_endpoint_count"] = actual or (mda.get("target_endpoint_count") or 0)
	return mda
