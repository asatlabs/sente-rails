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
"""Sente Rails — /v1/ops/* operations console API surface.

Backs the workbench's /ops/* pages with admin-level CRUD over MDAs,
Services, Integrators, Sente API Keys, the audit log, OAG oversight
views, counter shifts, the adapter registry, and the system health
panel. Auth is by Frappe ``sid`` session cookie + role check (see
``_decorator.sente_ops``).

Three role tiers:

  Sente Rails Admin / System Manager — full read + write
  Sente Rails OAG                    — read-only oversight + audit
  (no other Sente role grants access here)

After this surface ships, day-to-day MDA / Service / Integrator / Key
administration moves off the bench (SSH) onto the public web. The
Frappe Desk surface (/app, /desk) stays blocked at the edge — this is
the operator's intended public path.
"""

from __future__ import annotations

import ipaddress
import json
import re
import subprocess
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime

from sente_rails.api.keys import utils as keys_utils
from sente_rails.api.ops._decorator import sente_ops

# Roles that may access OAG / oversight read-only surfaces.
_OVERSIGHT_ROLES = ["Sente Rails Admin", "System Manager", "Sente Rails OAG"]
_AUDIT_ROLES = _OVERSIGHT_ROLES
_ADMIN_ONLY = ["Sente Rails Admin", "System Manager"]


# ─── Helpers ─────────────────────────────────────────────────────────────


def _ops_reject(code: str, message: str, http_status: int = 422) -> None:
	"""Local helper mirroring _signup_reject (which lives in signup.py)."""
	import uuid

	request_id = getattr(frappe.local, "request_id", None) or str(uuid.uuid4())
	envelope = {"code": code, "message": message, "request_id": request_id}
	frappe.local.response.update({"http_status_code": http_status, "error": envelope})
	frappe.local._sente_error = envelope
	frappe.local._sente_error_status = http_status
	if http_status == 401:
		raise frappe.AuthenticationError(message)
	if http_status == 403:
		raise frappe.PermissionError(message)
	if http_status == 404:
		raise frappe.DoesNotExistError(message)
	if http_status == 409:
		raise frappe.DuplicateEntryError(message)
	raise frappe.ValidationError(message)


# ─── Identity ────────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
def whoami() -> dict:
	"""Frappe session probe — public on purpose.

	The workbench /ops/* surface calls this on mount to decide whether
	to render the ops UI, the "no access" page, or the login prompt.
	Returning structured access flags here means the frontend doesn't
	have to grok role lists or 403-on-everything to know who's signed
	in. Endpoints with side effects + sensitive data are still gated
	by ``@sente_ops``.
	"""
	user = getattr(frappe.session, "user", None) or "Guest"
	if user == "Guest":
		return {"authenticated": False}
	row = frappe.db.get_value(
		"User",
		user,
		["name", "full_name", "email", "enabled"],
		as_dict=True,
	) or {"name": user, "full_name": user, "email": user, "enabled": 1}
	all_roles = sorted(frappe.get_roles(user))
	return {
		"authenticated": True,
		"user": row,
		"roles": all_roles,
		"has_ops_access": bool(set(all_roles) & set(_OVERSIGHT_ROLES)),
		"can_write": bool(set(all_roles) & set(_ADMIN_ONLY)),
		"can_read_oversight": bool(set(all_roles) & set(_OVERSIGHT_ROLES)),
	}


# ─── MDAs ────────────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def list_mdas(status: str | None = None) -> list[dict]:
	"""Full MDA catalogue. Reuses /v1/mdas to keep endpoint_count enrichment
	logic in one place. Pass ``status=`` (empty) to surface Suspended /
	Onboarding rows that the public catalogue hides."""
	from sente_rails.api.v1.mdas import list_mdas as public_list_mdas

	# An empty-string status means "all"; the public endpoint defaults to
	# Active. Pass through whatever the operator selected (None => all).
	effective_status = status if status is not None else ""
	return public_list_mdas(status=effective_status, limit=500)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def get_mda(name: str) -> dict:
	"""Full MDA row."""
	if not frappe.db.exists("MDA", name):
		_ops_reject("not_found", _("No such MDA."), http_status=404)
	return frappe.get_doc("MDA", name).as_dict()


@frappe.whitelist(allow_guest=True, methods=["PATCH", "POST"])
@sente_ops(roles=_ADMIN_ONLY)
def update_mda(
	name: str = "",
	full_name: str | None = None,
	mda_type: str | None = None,
	mode: str | None = None,
	status: str | None = None,
	parent_authority: str | None = None,
	treasury_account: str | None = None,
	sector: str | None = None,
	integration_status: str | None = None,
	target_endpoint_count: int | None = None,
) -> dict:
	"""Edit a writable subset of an MDA. Field validation by the doctype's
	own controller; we just patch through."""
	if not name:
		_ops_reject("validation_failed", _("MDA name is required."))
	if not frappe.db.exists("MDA", name):
		_ops_reject("not_found", _("No such MDA."), http_status=404)
	doc = frappe.get_doc("MDA", name)
	dirty = False
	for field, value in (
		("full_name", full_name),
		("mda_type", mda_type),
		("mode", mode),
		("status", status),
		("parent_authority", parent_authority),
		("treasury_account", treasury_account),
		("sector", sector),
		("integration_status", integration_status),
	):
		if value is not None and value != (getattr(doc, field) or ""):
			setattr(doc, field, value or None)
			dirty = True
	if target_endpoint_count is not None:
		try:
			tec = int(target_endpoint_count)
		except (TypeError, ValueError):
			_ops_reject("validation_failed", _("target_endpoint_count must be an integer."))
		if tec < 0:
			_ops_reject("validation_failed", _("target_endpoint_count must be non-negative."))
		if tec != (doc.target_endpoint_count or 0):
			doc.target_endpoint_count = tec
			dirty = True
	if dirty:
		doc.save(ignore_permissions=True)
		frappe.db.commit()
	return doc.as_dict()


# ─── Services ────────────────────────────────────────────────────────────


_SERVICE_LIST_FIELDS = [
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


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def list_services(mda: str | None = None, status: str | None = None) -> list[dict]:
	filters: dict = {}
	if mda:
		filters["mda"] = mda
	if status:
		filters["status"] = status
	return frappe.db.get_all(
		"Service",
		ignore_permissions=True,
		filters=filters,
		fields=_SERVICE_LIST_FIELDS,
		order_by="mda asc, code asc",
		limit_page_length=500,
	)


@frappe.whitelist(allow_guest=True, methods=["PATCH", "POST"])
@sente_ops(roles=_ADMIN_ONLY)
def update_service(
	name: str = "",
	service_name: str | None = None,
	sector: str | None = None,
	service_family: str | None = None,
	fee_amount: float | None = None,
	fee_currency: str | None = None,
	fee_basis: str | None = None,
	efris_taxable: int | None = None,
	vat_applicable: int | None = None,
	vat_rate: float | None = None,
	status: str | None = None,
) -> dict:
	if not name:
		_ops_reject("validation_failed", _("Service name is required."))
	if not frappe.db.exists("Service", name):
		_ops_reject("not_found", _("No such service."), http_status=404)
	doc = frappe.get_doc("Service", name)
	dirty = False
	for field, value in (
		("service_name", service_name),
		("sector", sector),
		("service_family", service_family),
		("fee_currency", fee_currency),
		("fee_basis", fee_basis),
		("status", status),
	):
		if value is not None and value != (getattr(doc, field) or ""):
			setattr(doc, field, value or None)
			dirty = True
	for field, value in (
		("fee_amount", fee_amount),
		("vat_rate", vat_rate),
	):
		if value is not None:
			try:
				v = float(value)
			except (TypeError, ValueError):
				_ops_reject("validation_failed", _("{0} must be numeric.").format(field))
			if v != (getattr(doc, field) or 0):
				setattr(doc, field, v)
				dirty = True
	for field, value in (
		("efris_taxable", efris_taxable),
		("vat_applicable", vat_applicable),
	):
		if value is not None:
			v = 1 if int(value) else 0
			if v != (getattr(doc, field) or 0):
				setattr(doc, field, v)
				dirty = True
	if dirty:
		doc.save(ignore_permissions=True)
		frappe.db.commit()
	return doc.as_dict()


# ─── Integrators ─────────────────────────────────────────────────────────


_INTEGRATOR_LIST_FIELDS = [
	"name",
	"display_name",
	"type",
	"tier",
	"pricing_tier",
	"status",
	"contact_email",
	"email_verified",
	"mou_status",
	"kyc_status",
	"signup_source",
	"tos_accepted_version",
	"tos_accepted_on",
	"last_login_at",
	"anticipated_volume_daily",
	"anticipated_volume_monthly",
	"creation",
]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def list_integrators(
	status: str | None = None,
	tier: str | None = None,
	signup_source: str | None = None,
	q: str | None = None,
	limit: int = 200,
) -> list[dict]:
	filters: dict = {}
	if status:
		filters["status"] = status
	if tier:
		filters["tier"] = tier
	if signup_source:
		filters["signup_source"] = signup_source
	or_filters = None
	if q:
		needle = f"%{q}%"
		or_filters = {
			"display_name": ["like", needle],
			"contact_email": ["like", needle],
			"name": ["like", needle],
		}
	try:
		limit_int = max(1, min(int(limit or 200), 500))
	except (TypeError, ValueError):
		_ops_reject("validation_failed", _("limit must be an integer."))
	return frappe.db.get_all(
		"Integrator",
		filters=filters,
		or_filters=or_filters,
		fields=_INTEGRATOR_LIST_FIELDS,
		order_by="creation desc",
		limit_page_length=limit_int,
	)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def get_integrator(name: str) -> dict:
	if not frappe.db.exists("Integrator", name):
		_ops_reject("not_found", _("No such integrator."), http_status=404)
	doc = frappe.get_doc("Integrator", name)
	out = doc.as_dict()
	# Strip sensitive transient state from the response — admins don't
	# need the hashed magic-link / session tokens served as JSON.
	for k in ("otp_hash", "session_token_hash", "login_link_hash"):
		out.pop(k, None)
	# Add a fresh counter pair (active vs total keys).
	out["keys"] = {
		"total": frappe.db.count("Sente API Key", filters={"integrator": name}),
		"active": frappe.db.count("Sente API Key", filters={"integrator": name, "status": "active"}),
	}
	out["requests_last_7d"] = int(
		frappe.db.sql(
			"""SELECT COUNT(*) FROM `tabSente API Audit Log`
		   WHERE integrator = %s AND ts >= %s""",
			(name, add_to_date(now_datetime(), days=-7, as_datetime=True)),
		)[0][0]
		or 0
	)
	return out


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_ops(roles=_ADMIN_ONLY)
def suspend_integrator(name: str = "", reason: str = "") -> dict:
	if not name:
		_ops_reject("validation_failed", _("Integrator name is required."))
	reason_clean = (reason or "").strip()[:280]
	if not reason_clean:
		_ops_reject("validation_failed", _("Reason is required for suspension."))
	if not frappe.db.exists("Integrator", name):
		_ops_reject("not_found", _("No such integrator."), http_status=404)
	doc = frappe.get_doc("Integrator", name)
	if doc.status == "Suspended":
		_ops_reject("invalid_state", _("Already suspended."), http_status=409)
	doc.status = "Suspended"
	# Stash the reason in notes so audit trail survives.
	existing_notes = doc.notes or ""
	stamp = now_datetime().strftime("%Y-%m-%d %H:%M")
	doc.notes = (existing_notes + f"\n[{stamp}] Suspended by {frappe.session.user}: {reason_clean}").strip()
	# Invalidate any active browser session.
	doc.session_token_hash = None
	doc.session_expires_at = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"name": name, "status": "Suspended"}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_ops(roles=_ADMIN_ONLY)
def reactivate_integrator(name: str = "", reason: str = "") -> dict:
	if not name:
		_ops_reject("validation_failed", _("Integrator name is required."))
	reason_clean = (reason or "").strip()[:280]
	if not reason_clean:
		_ops_reject("validation_failed", _("Reason is required for reactivation."))
	if not frappe.db.exists("Integrator", name):
		_ops_reject("not_found", _("No such integrator."), http_status=404)
	doc = frappe.get_doc("Integrator", name)
	if doc.status == "Active":
		_ops_reject("invalid_state", _("Already active."), http_status=409)
	doc.status = "Active"
	existing_notes = doc.notes or ""
	stamp = now_datetime().strftime("%Y-%m-%d %H:%M")
	doc.notes = (existing_notes + f"\n[{stamp}] Reactivated by {frappe.session.user}: {reason_clean}").strip()
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"name": name, "status": "Active"}


# ─── Keys (operator surface — search + force-revoke) ─────────────────────


_KEY_LIST_FIELDS = [
	"name",
	"integrator",
	"prefix",
	"last4",
	"environment",
	"key_type",
	"status",
	"expires_at",
	"last_used_at",
	"last_used_ip",
	"usage_count",
	"revoked_at",
	"revoked_by",
	"revoked_reason",
	"rolling_until",
	"rolled_to",
	"description",
	"creation",
]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def list_keys(
	integrator: str | None = None,
	status: str | None = None,
	environment: str | None = None,
	q: str | None = None,
	limit: int = 200,
) -> list[dict]:
	filters: dict = {}
	if integrator:
		filters["integrator"] = integrator
	if status:
		filters["status"] = status
	if environment:
		filters["environment"] = environment
	or_filters = None
	if q:
		needle = f"%{q}%"
		or_filters = {
			"name": ["like", needle],
			"last4": ["like", needle],
			"description": ["like", needle],
		}
	try:
		limit_int = max(1, min(int(limit or 200), 500))
	except (TypeError, ValueError):
		_ops_reject("validation_failed", _("limit must be an integer."))
	return frappe.db.get_all(
		"Sente API Key",
		filters=filters,
		or_filters=or_filters,
		fields=_KEY_LIST_FIELDS,
		order_by="creation desc",
		limit_page_length=limit_int,
	)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_ops(roles=_ADMIN_ONLY)
def force_revoke_key(name: str = "", reason: str = "") -> dict:
	if not name:
		_ops_reject("validation_failed", _("Key name is required."))
	reason_clean = (reason or "").strip()[:280]
	if not reason_clean:
		_ops_reject("validation_failed", _("Reason is required."))
	if not frappe.db.exists("Sente API Key", name):
		_ops_reject("not_found", _("No such API key."), http_status=404)
	doc = frappe.get_doc("Sente API Key", name)
	if doc.status == "revoked":
		_ops_reject("invalid_state", _("Already revoked."), http_status=409)
	keys_utils.revoke_key(name=name, reason=f"[ops by {frappe.session.user}] {reason_clean}")
	return {"name": name, "status": "revoked"}


# ─── Audit log (full, unfiltered by integrator) ──────────────────────────


_AUDIT_FIELDS = [
	"name",
	"ts",
	"event",
	"request_id",
	"http_method",
	"endpoint",
	"http_status",
	"error_code",
	"integrator",
	"api_key",
	"source_ip",
	"required_scopes",
	"granted_scopes",
	"latency_ms",
]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_AUDIT_ROLES)
def list_audit(
	limit: int = 100,
	integrator: str | None = None,
	endpoint: str | None = None,
	event: str | None = None,
	min_status: int | None = None,
	since: str | None = None,
) -> list[dict]:
	"""Full audit log across all integrators. No 90-day clamp — operators
	see everything up to the 7-year purge floor."""
	try:
		limit_int = max(1, min(int(limit or 100), 500))
	except (TypeError, ValueError):
		_ops_reject("validation_failed", _("limit must be an integer."))
	filters: list = []
	if integrator:
		filters.append(["integrator", "=", integrator])
	if endpoint:
		filters.append(["endpoint", "like", f"%{endpoint}%"])
	if event:
		filters.append(["event", "=", event])
	if min_status is not None:
		try:
			filters.append(["http_status", ">=", int(min_status)])
		except (TypeError, ValueError):
			_ops_reject("validation_failed", _("min_status must be an integer."))
	if since:
		try:
			since_dt = frappe.utils.get_datetime(since)
			filters.append(["ts", ">=", since_dt])
		except Exception:
			_ops_reject("validation_failed", _("since must be an ISO datetime."))
	rows = frappe.db.get_all(
		"Sente API Audit Log",
		filters=filters,
		fields=_AUDIT_FIELDS,
		order_by="ts desc",
		limit_page_length=limit_int,
		ignore_permissions=True,
	)
	for r in rows:
		for k in ("required_scopes", "granted_scopes"):
			raw = r.get(k)
			if isinstance(raw, str) and raw.startswith("["):
				try:
					r[k] = json.loads(raw)
				except json.JSONDecodeError:
					pass
	return rows


# ─── OAG oversight (parallel to /v1/oversight/*, role-gated) ─────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def oversight_aggregates() -> dict:
	"""Revenue by MDA + by sector for the last 30 days.

	Reads from Payment Event rows (settled) joined to MDA.
	"""
	since = add_to_date(now_datetime(), days=-30, as_datetime=True)
	# Payment Event has no settled_at column — the immutable event row stamps
	# received_at (mirrors api/v1/oversight.py, which uses received_at).
	rows = (
		frappe.db.sql(
			"""
		SELECT mda, SUM(amount) AS total_amount, COUNT(*) AS event_count
		FROM `tabPayment Event`
		WHERE received_at >= %s
		GROUP BY mda ORDER BY total_amount DESC
		""",
			(since,),
			as_dict=True,
		)
		or []
	)
	totals = {
		"window_days": 30,
		"total_amount": sum((r.get("total_amount") or 0) for r in rows),
		"event_count": sum((r.get("event_count") or 0) for r in rows),
	}
	return {"by_mda": rows, "totals": totals}


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def oversight_anomaly_flags(limit: int = 100) -> list[dict]:
	try:
		limit_int = max(1, min(int(limit or 100), 500))
	except (TypeError, ValueError):
		_ops_reject("validation_failed", _("limit must be an integer."))
	return (
		frappe.db.get_all(
			"Anomaly Flag",
			# Mirror api/v1/oversight.py's verified column set. The prior list
			# (shift / clerk / mda / detected_at / detail / resolution_note)
			# named columns that don't exist on the doctype — the subject is
			# carried by reference_doctype + reference_name, the timestamp is
			# flagged_at, the body is description.
			fields=[
				"name",
				"flag_type",
				"severity",
				"status",
				"flagged_at",
				"reference_doctype",
				"reference_name",
				"detection_rule",
				"signal_value",
				"threshold",
				"description",
				"flagged_by",
				"assigned_to",
				"resolved_at",
			],
			order_by="flagged_at desc",
			limit_page_length=limit_int,
		)
		if frappe.db.exists("DocType", "Anomaly Flag")
		else []
	)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def oversight_payment_events(limit: int = 100) -> list[dict]:
	try:
		limit_int = max(1, min(int(limit or 100), 500))
	except (TypeError, ValueError):
		_ops_reject("validation_failed", _("limit must be an integer."))
	return (
		frappe.db.get_all(
			"Payment Event",
			# Payment Event is an immutable callback record — no channel/status
			# columns (channel lives on the parent Payment Intent), and the
			# stamp is received_at, not settled_at. Matches the PaymentEvent
			# schema + api/v1/oversight.py.
			fields=[
				"name",
				"payment_intent",
				"mda",
				"amount",
				"currency",
				"aggregator",
				"aggregator_txn_id",
				"destination_account",
				"received_at",
			],
			order_by="received_at desc",
			limit_page_length=limit_int,
		)
		if frappe.db.exists("DocType", "Payment Event")
		else []
	)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def oversight_citizen_consent(limit: int = 100) -> list[dict]:
	try:
		limit_int = max(1, min(int(limit or 100), 500))
	except (TypeError, ValueError):
		_ops_reject("validation_failed", _("limit must be an integer."))
	return (
		frappe.db.get_all(
			"Citizen Consent Event",
			# Real columns: purpose (not consent_type), granted_at (not ts),
			# captured_by (not actor); there is no channel column.
			fields=[
				"name",
				"citizen",
				"mda",
				"purpose",
				"granted",
				"granted_at",
				"expiry_at",
				"revoked_at",
				"evidence_type",
				"captured_by",
			],
			order_by="granted_at desc",
			limit_page_length=limit_int,
		)
		if frappe.db.exists("DocType", "Citizen Consent Event")
		else []
	)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def oversight_statistics() -> dict:
	"""Running totals across the rail."""
	stats = {}
	stats["citizens_total"] = frappe.db.count("Citizen") if frappe.db.exists("DocType", "Citizen") else 0
	stats["integrators_total"] = frappe.db.count("Integrator")
	stats["integrators_active"] = frappe.db.count("Integrator", filters={"status": "Active"})
	stats["mdas_total"] = frappe.db.count("MDA")
	stats["services_total"] = frappe.db.count("Service")
	stats["keys_active"] = frappe.db.count("Sente API Key", filters={"status": "active"})
	# Audit log totals
	stats["audit_total"] = frappe.db.count("Sente API Audit Log")
	since_7d = add_to_date(now_datetime(), days=-7, as_datetime=True)
	stats["audit_7d"] = int(
		frappe.db.sql(
			"SELECT COUNT(*) FROM `tabSente API Audit Log` WHERE ts >= %s",
			(since_7d,),
		)[0][0]
		or 0
	)
	# Anomaly + payment counts
	if frappe.db.exists("DocType", "Anomaly Flag"):
		stats["anomaly_flags_total"] = frappe.db.count("Anomaly Flag")
		stats["anomaly_flags_open"] = frappe.db.count("Anomaly Flag", filters={"status": "Open"})
	if frappe.db.exists("DocType", "Payment Event"):
		stats["payment_events_total"] = frappe.db.count("Payment Event")
	return stats


# ─── Shifts (cross-MDA view) ─────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def list_shifts(status: str | None = None, mda: str | None = None, limit: int = 100) -> list[dict]:
	if not frappe.db.exists("DocType", "Counter Shift"):
		return []
	try:
		limit_int = max(1, min(int(limit or 100), 500))
	except (TypeError, ValueError):
		_ops_reject("validation_failed", _("limit must be an integer."))
	filters: dict = {}
	if status:
		filters["status"] = status
	if mda:
		filters["mda"] = mda
	# Canonical Counter Shift columns (mirror _public_shift in api/v1/shifts.py —
	# business + settlement fields only). Earlier this listed expected_total /
	# counted_total / variance / variance_status, none of which exist on the
	# doctype — every call 500'd with "Unknown column".
	fields = [
		"name",
		"mda",
		"clerk",
		"counter_label",
		"status",
		"opened_at",
		"closed_at",
		"opening_float",
		"currency",
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
	]
	return frappe.db.get_all(
		"Counter Shift",
		ignore_permissions=True,
		filters=filters,
		fields=fields,
		order_by="opened_at desc",
		limit_page_length=limit_int,
	)


# ─── Adapter registry ────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def adapter_registry() -> dict:
	"""Adapter registry — same content as /v1/integrations but role-gated
	and grouped for the ops view.

	Calls the registry builder + shaper directly rather than the public
	``list_integrations`` endpoint: that one carries ``@sente_api`` (Bearer
	+ scope), so invoking it in-process — with only a session cookie and no
	Authorization header — tripped the token gate and 401'd this endpoint.
	"""
	from sente_rails.adapters.dispatch import list_installed_adapters
	from sente_rails.api.v1.integrations import _shape_node

	return _shape_node(list_installed_adapters())


# ─── System health ───────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_ops(roles=_OVERSIGHT_ROLES)
def system_health() -> dict:
	"""Operational health snapshot. Read-only, fast — no heavy queries."""
	out: dict = {}

	# Audit-log table state.
	audit_total = frappe.db.count("Sente API Audit Log")
	audit_oldest = frappe.db.sql("SELECT MIN(ts) FROM `tabSente API Audit Log`")[0][0]
	audit_newest = frappe.db.sql("SELECT MAX(ts) FROM `tabSente API Audit Log`")[0][0]
	out["audit_log"] = {
		"row_count": int(audit_total),
		"oldest_ts": audit_oldest,
		"newest_ts": audit_newest,
	}

	# Scheduler — last completed run for the daily key-expiry sweep.
	last_event = (
		frappe.db.sql(
			"""SELECT MAX(creation) FROM `tabScheduled Job Log`
		   WHERE scheduled_job_type IN (SELECT name FROM `tabScheduled Job Type` WHERE method LIKE %s)""",
			("%sente_rails.api.keys.endpoints.daily_expiry_sweep%",),
		)[0][0]
		if frappe.db.exists("DocType", "Scheduled Job Log")
		else None
	)
	out["scheduler"] = {
		"last_daily_expiry_sweep": last_event,
	}

	# Adapter live counts (live = non-stub for the active country).
	# Use the registry builder directly — the public list_integrations is
	# Bearer-gated (@sente_api); calling it here with only a session cookie
	# tripped the token gate and 401'd the whole endpoint.
	try:
		from sente_rails.adapters.dispatch import list_installed_adapters
		from sente_rails.api.v1.integrations import _shape_node

		reg = _shape_node(list_installed_adapters())
		live_count = 0
		stub_count = 0
		# Shaped entries carry {status: live|sandbox|unavailable}, not a raw
		# `stub` boolean — count off status so sandbox adapters aren't all
		# silently tallied as live.
		for adapters in (reg.get("UG") or {}).values():
			items = adapters if isinstance(adapters, list) else [adapters]
			for item in items:
				if not isinstance(item, dict):
					continue
				if item.get("status") == "sandbox":
					stub_count += 1
				elif item.get("status") == "live":
					live_count += 1
		out["adapters"] = {"live": live_count, "stub": stub_count}
	except Exception:
		out["adapters"] = {"live": None, "stub": None}

	# Schema counters
	out["counts"] = {
		"integrators": frappe.db.count("Integrator"),
		"mdas": frappe.db.count("MDA"),
		"services": frappe.db.count("Service"),
		"keys_active": frappe.db.count("Sente API Key", filters={"status": "active"}),
		"keys_total": frappe.db.count("Sente API Key"),
	}

	# Git head — convenience for spotting which build is live.
	try:
		head = (
			subprocess.check_output(
				["git", "rev-parse", "--short", "HEAD"],
				cwd=frappe.get_app_path("sente_rails"),
				timeout=2,
				stderr=subprocess.DEVNULL,
			)
			.decode()
			.strip()
		)
	except Exception:
		head = None
	out["build"] = {"git_head": head}

	return out
