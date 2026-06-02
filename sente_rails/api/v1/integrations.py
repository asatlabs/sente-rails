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
"""Sente Rails public API v1 — Adapter / integration status."""

import frappe

from sente_rails.api.keys.auth import sente_api


def _shape_entry(entry: dict) -> dict:
	"""Public status for one adapter slot — never the internal class path.

	  unavailable = referenced in a Country Profile but not importable
	                (not yet built / MoU-pending)
	  sandbox     = adapter present, running in STUB mode (no live creds)
	  live        = adapter present, real credentials wired

	`supported_channels` (the payment channels a rail handles) is public
	and carried through as `channels`; the dotted `class_path` and any
	import-error string are dropped.
	"""
	if not entry.get("importable"):
		status = "unavailable"
	elif entry.get("stub"):
		status = "sandbox"
	else:
		status = "live"
	out = {"status": status}
	channels = entry.get("supported_channels")
	if channels:
		out["channels"] = channels
	return out


def _shape_node(node):
	"""Recursively shape the adapter registry for public consumption.

	Replaces each adapter-status leaf (``{class_path, importable, stub,
	supported_channels}``) with ``{status, channels?}`` — dropping the
	dotted class path and any import-error string. Handles the registry's
	mixed shape without assuming depth: a capability is either a single
	leaf dict (e.g. ``identity``, ``fiscal``) OR a LIST of leaf dicts
	(e.g. ``payment`` → many provider adapters).
	"""
	if isinstance(node, dict) and ("class_path" in node or "importable" in node):
		return _shape_entry(node)
	if isinstance(node, dict):
		return {k: _shape_node(v) for k, v in node.items()}
	if isinstance(node, list):
		return [_shape_node(v) for v in node]
	return node


@frappe.whitelist(allow_guest=True)
@sente_api(scope="catalogue.read")
def list_integrations():
	"""Per-country integration status (live / sandbox / unavailable).

	A discovery snapshot of which adapters back each capability per country
	— payment rails, identity, fiscal receipting, business registry, etc.
	Returns integration STATUS only; internal adapter class paths are never
	exposed.

	Auth: any integrator API key (``catalogue.read`` scope). The operator
	view with importability detail lives at ``/v1/ops/adapters``.

	Surfaces which integrations are
	real-creds-wired (`live`) vs `sandbox` vs `unavailable` (MoU-pending).
	"""
	from sente_rails.adapters.dispatch import list_installed_adapters

	return _shape_node(list_installed_adapters())
