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
"""Sente Rails — public landing page at `/`.

Single-page visitor-facing landing that sets the credibility frame
before a visitor clicks into the Clerk app or the API docs. Pulls a
small handful of live numbers from the OpenAPI spec and the
integrations registry so the page reflects build state, not a stale
brochure.

Public (`allow_guest`) so visitors can browse without a login.
"""

from pathlib import Path

import frappe
import yaml

no_cache = 1
no_breadcrumbs = 1
sitemap = 0


def get_context(context):
	spec_path = Path(frappe.get_app_path("sente_rails", "api", "v1", "openapi.yaml"))
	try:
		spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
	except Exception:
		spec = {}

	context.endpoint_count = len(spec.get("paths", {})) or 22
	context.schema_count = len((spec.get("components") or {}).get("schemas") or {}) or 19
	context.spec_version = (spec.get("info") or {}).get("version", "1.0.0")

	context.integrations = _live_integrations()
	context.title = "Sente Rails — Government Revenue Rail for Uganda"
	return context


def _live_integrations():
	"""Flatten the UG country profile's adapter rows for the landing.

	Returns a list of {name, label, live} dicts. Non-fatal on any error
	— the landing degrades to a static integration count.
	"""
	try:
		from sente_rails.adapters.dispatch import list_installed_adapters

		raw = list_installed_adapters() or {}
		ug = raw.get("UG") or {}
		rows = []
		if ug.get("identity"):
			rows.append(_row("Identity", ug["identity"]))
		if ug.get("fiscal"):
			rows.append(_row("Fiscal", ug["fiscal"]))
		for p in ug.get("payment") or []:
			rows.append(_row("Payment", p))
		return [r for r in rows if r]
	except Exception:
		return []


def _row(kind, adapter):
	if not adapter or not adapter.get("class_path"):
		return None
	label = adapter["class_path"].rsplit(".", 1)[-1].replace("Adapter", "")
	stub = adapter.get("stub")
	importable = bool(adapter.get("importable"))
	return {
		"kind": kind,
		"label": label,
		"live": importable and stub is False,
		"importable": importable,
	}
