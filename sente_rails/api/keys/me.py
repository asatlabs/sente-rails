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
"""Sente Rails — /v1/me/* self-service surface.

Endpoints that act on the signed-in integrator's OWN row + own keys +
own audit log. Auth accepted via either session cookie (browser dashboard)
or Bearer key (management scripts) — see ``auth.sente_me`` for the
decorator that handles both.

Routes (wired in middleware/router.py):

  GET    /v1/me                              -> profile + counters
  PATCH  /v1/me                              {display_name?, webhook_endpoint?, ip_allowlist?}
  GET    /v1/me/keys                         -> list of this integrator's keys
  POST   /v1/me/keys/<name>:rotate           {grace_hours?}
  POST   /v1/me/keys/<name>:revoke           {reason?}
  GET    /v1/me/logs                         -> last 90 days of audit log entries

Hot-tier query window for /logs is ``LOGS_HOT_DAYS = 90``. Older rows
remain in the doctype (7-year purge floor) but the integrator-facing
endpoint clamps the visible window to 90 — see project_sente_ui_coherence
Decision #2.
"""

from __future__ import annotations

import ipaddress
import json
import re

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime

from sente_rails.api.keys import utils
from sente_rails.api.keys.auth import sente_me

LOGS_HOT_DAYS = 90
LOGS_MAX_LIMIT = 200


# ─── Profile ─────────────────────────────────────────────────────────────


def _signup_reject(code: str, message: str, http_status: int = 422) -> None:
	"""Local copy of the structured reject helper (signup.py has the
	canonical one; importing it would create a circular path through
	the auth pipeline)."""
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


def _profile_dict(integrator_code: str) -> dict:
	"""Shape the integrator's profile for the GET /v1/me response."""
	row = frappe.db.get_value(
		"Integrator",
		integrator_code,
		[
			"name",
			"display_name",
			"type",
			"tier",
			"pricing_tier",
			"status",
			"contact_email",
			"technical_lead_user",
			"webhook_endpoint",
			"mou_status",
			"kyc_status",
			"ip_allowlist",
			"tos_accepted_on",
			"tos_accepted_version",
			"signup_source",
			"email_verified",
			"last_login_at",
			"anticipated_volume_daily",
			"anticipated_volume_monthly",
		],
		as_dict=True,
	)
	if not row:
		_signup_reject("not_found", _("Integrator row missing."), http_status=404)

	# Live counters — cheap with the right indexes.
	key_count_total = frappe.db.count("Sente API Key", filters={"integrator": integrator_code})
	key_count_active = frappe.db.count(
		"Sente API Key", filters={"integrator": integrator_code, "status": "active"}
	)

	# Last-7-day request count from the audit log.
	since_7d = add_to_date(now_datetime(), days=-7, as_datetime=True)
	requests_7d = (
		frappe.db.sql(
			"""SELECT COUNT(*) FROM `tabSente API Audit Log`
		   WHERE integrator = %s AND ts >= %s AND event = 'api.auth.granted'""",
			(integrator_code, since_7d),
		)[0][0]
		or 0
	)

	row["keys"] = {"total": int(key_count_total), "active": int(key_count_active)}
	row["requests_last_7d"] = int(requests_7d)
	return dict(row)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_me
def get_me() -> dict:
	"""Return the signed-in integrator's profile + counters."""
	return _profile_dict(frappe.local.sente_integrator)


@frappe.whitelist(allow_guest=True, methods=["PATCH", "POST"])
@sente_me
def update_me(
	display_name: str | None = None,
	webhook_endpoint: str | None = None,
	ip_allowlist: str | None = None,
	anticipated_volume_daily: int | None = None,
	anticipated_volume_monthly: int | None = None,
) -> dict:
	"""Patch a writable subset of the integrator's profile.

	Email change is NOT supported here — it would invalidate the session
	cookie + require a fresh OTP round-trip. That flow is queued for a
	follow-up. For now, callers wanting to change contact_email contact
	ops.
	"""
	code = frappe.local.sente_integrator
	doc = frappe.get_doc("Integrator", code)
	dirty = False

	if display_name is not None:
		dn = (display_name or "").strip()[:140]
		if not dn:
			_signup_reject("validation_failed", _("Display name cannot be blank."))
		if dn != (doc.display_name or ""):
			doc.display_name = dn
			dirty = True

	if webhook_endpoint is not None:
		webhook = (webhook_endpoint or "").strip()
		if webhook:
			if not webhook.startswith(("http://", "https://")):
				_signup_reject(
					"validation_failed",
					_("webhook_endpoint must be a full http:// or https:// URL."),
				)
		if webhook != (doc.webhook_endpoint or ""):
			doc.webhook_endpoint = webhook or None
			dirty = True

	if ip_allowlist is not None:
		allow = (ip_allowlist or "").strip()
		if allow:
			for raw in allow.split(","):
				cidr = raw.strip()
				if not cidr:
					continue
				try:
					ipaddress.ip_network(cidr, strict=False)
				except ValueError:
					_signup_reject(
						"validation_failed",
						_("IP allowlist contains an invalid CIDR: {0}").format(cidr),
					)
		if allow != (doc.ip_allowlist or ""):
			doc.ip_allowlist = allow or None
			dirty = True

	if anticipated_volume_daily is not None:
		try:
			val = int(anticipated_volume_daily)
		except (TypeError, ValueError):
			_signup_reject("validation_failed", _("anticipated_volume_daily must be an integer."))
		if val < 0:
			_signup_reject("validation_failed", _("anticipated_volume_daily must be non-negative."))
		if val != (doc.anticipated_volume_daily or 0):
			doc.anticipated_volume_daily = val
			dirty = True

	if anticipated_volume_monthly is not None:
		try:
			val = int(anticipated_volume_monthly)
		except (TypeError, ValueError):
			_signup_reject("validation_failed", _("anticipated_volume_monthly must be an integer."))
		if val < 0:
			_signup_reject("validation_failed", _("anticipated_volume_monthly must be non-negative."))
		if val != (doc.anticipated_volume_monthly or 0):
			doc.anticipated_volume_monthly = val
			dirty = True

	if dirty:
		doc.save(ignore_permissions=True)
		frappe.db.commit()

	return _profile_dict(code)


# ─── Keys ────────────────────────────────────────────────────────────────


def _key_dict(doc) -> dict:
	"""Public-safe representation — same fields as the operator endpoint
	in endpoints.py, no plaintext, no hash."""
	return {
		"name": doc.name,
		"prefix": doc.prefix,
		"last4": doc.last4,
		"environment": doc.environment,
		"key_type": doc.key_type,
		"status": doc.status,
		"scopes": doc.scopes_list(),
		"created_at": doc.creation,
		"expires_at": doc.expires_at,
		"last_used_at": doc.last_used_at,
		"last_used_ip": doc.last_used_ip,
		"usage_count": doc.usage_count or 0,
		"revoked_at": doc.revoked_at,
		"revoked_by": doc.revoked_by,
		"revoked_reason": doc.revoked_reason,
		"rolling_until": doc.rolling_until,
		"rolled_to": doc.rolled_to,
		"description": doc.description,
	}


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_me
def list_my_keys() -> list[dict]:
	"""Return every key owned by the signed-in integrator, newest first."""
	code = frappe.local.sente_integrator
	names = frappe.db.get_all(
		"Sente API Key",
		filters={"integrator": code},
		fields=["name"],
		order_by="creation desc",
		limit_page_length=200,
	)
	return [_key_dict(frappe.get_doc("Sente API Key", n.name)) for n in names]


def _validate_owns_key(integrator_code: str, key_name: str):
	"""Look up the key and confirm it belongs to the caller. Returns the
	frappe.get_doc result on success; rejects with 404 otherwise."""
	if not frappe.db.exists("Sente API Key", key_name):
		_signup_reject("not_found", _("No such API key."), http_status=404)
	doc = frappe.get_doc("Sente API Key", key_name)
	if doc.integrator != integrator_code:
		# Treat ownership mismatch as 404 — never confirm that another
		# integrator's key exists via a 403 differential.
		_signup_reject("not_found", _("No such API key."), http_status=404)
	return doc


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_me
def rotate_my_key(name: str = "", grace_hours: int = 24) -> dict:
	"""Rotate the named key — the existing key flips to ``rolling`` for
	``grace_hours`` (default 24), and a fresh key is issued with the same
	scopes + environment. Plaintext of the new key is returned once.
	"""
	code = frappe.local.sente_integrator
	if not name:
		_signup_reject("validation_failed", _("Key name is required."))
	doc = _validate_owns_key(code, name)
	if doc.status not in ("active", "rolling"):
		_signup_reject(
			"invalid_state",
			_("Only active or rolling keys can be rotated (this key is {0}).").format(doc.status),
			http_status=409,
		)
	try:
		grace_hours_int = max(1, min(int(grace_hours or 24), 168))
	except (TypeError, ValueError):
		_signup_reject("validation_failed", _("grace_hours must be an integer 1-168."))
	# utils stamps Sente API Key.revoked_by (a User Link), but the
	# integrator code isn't a User. Default actor to frappe.session.user
	# instead — the audit trail captures the integrator separately via
	# /v1/me/logs and the api.auth logger.
	plaintext, new_doc = utils.rotate_key(
		name=doc.name,
		grace_hours=grace_hours_int,
	)
	# Reload the old key to surface the freshly-set rolling state.
	doc = frappe.get_doc("Sente API Key", doc.name)
	return {
		"old_key": {"name": doc.name, "status": doc.status, "rolling_until": doc.rolling_until},
		"new_key": _key_dict(new_doc),
		"plaintext": plaintext,
		"plaintext_warning": (
			"This is the only time the plaintext of the rotated key will be "
			"displayed. Store it securely; it cannot be recovered."
		),
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_me
def revoke_my_key(name: str = "", reason: str = "") -> dict:
	"""Revoke the named key immediately. The key cannot be unrevoked —
	to restore access, rotate a different key or contact ops for a new
	key issuance flow."""
	code = frappe.local.sente_integrator
	if not name:
		_signup_reject("validation_failed", _("Key name is required."))
	reason_clean = (reason or "").strip()[:280]
	if not reason_clean:
		_signup_reject("validation_failed", _("Reason is required."))
	doc = _validate_owns_key(code, name)
	if doc.status == "revoked":
		_signup_reject(
			"invalid_state",
			_("This key is already revoked."),
			http_status=409,
		)
	# See rotate_my_key note: actor defaults to frappe.session.user
	# because Sente API Key.revoked_by is a User Link.
	utils.revoke_key(name=doc.name, reason=reason_clean)
	# Re-read the row so we surface the freshly-set revoked_at / revoked_by.
	return _key_dict(frappe.get_doc("Sente API Key", doc.name))


# ─── Audit log ───────────────────────────────────────────────────────────


_LOGS_FIELDS = [
	"name",
	"ts",
	"event",
	"request_id",
	"http_method",
	"endpoint",
	"http_status",
	"error_code",
	"api_key",
	"source_ip",
	"required_scopes",
	"granted_scopes",
	"latency_ms",
]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_me
def list_my_logs(
	limit: int = 50,
	since: str | None = None,
	endpoint: str | None = None,
	event: str | None = None,
	min_status: int | None = None,
) -> list[dict]:
	"""Recent audit log entries for the signed-in integrator.

	Window is clamped to the last 90 days regardless of ``since`` — the
	integrator-facing surface only exposes the hot tier per Decision #2
	in ``project_sente_ui_coherence.md``. Operator surfaces (B-front-door)
	read further back.

	Filters:
	  - ``since`` (ISO datetime) — lower bound, inferred from 90 days back if absent
	  - ``endpoint`` (substring) — case-sensitive match against the endpoint column
	  - ``event`` — exact event name (api.auth.granted, api.auth.denied, ...)
	  - ``min_status`` — only rows with http_status >= N (e.g. 400 for errors)
	"""
	code = frappe.local.sente_integrator
	try:
		limit_int = max(1, min(int(limit or 50), LOGS_MAX_LIMIT))
	except (TypeError, ValueError):
		_signup_reject("validation_failed", _("limit must be an integer."))

	hot_floor = add_to_date(now_datetime(), days=-LOGS_HOT_DAYS, as_datetime=True)
	if since:
		try:
			since_dt = frappe.utils.get_datetime(since)
		except Exception:
			_signup_reject("validation_failed", _("since must be an ISO datetime."))
		if since_dt < hot_floor:
			since_dt = hot_floor
	else:
		since_dt = hot_floor

	filters: list = [
		["integrator", "=", code],
		["ts", ">=", since_dt],
	]
	if endpoint:
		filters.append(["endpoint", "like", f"%{endpoint}%"])
	if event:
		filters.append(["event", "=", event])
	if min_status is not None:
		try:
			filters.append(["http_status", ">=", int(min_status)])
		except (TypeError, ValueError):
			_signup_reject("validation_failed", _("min_status must be an integer."))

	rows = frappe.db.get_all(
		"Sente API Audit Log",
		filters=filters,
		fields=_LOGS_FIELDS,
		order_by="ts desc",
		limit_page_length=limit_int,
	)

	# Decode JSON-encoded scopes columns to lists for the client.
	for r in rows:
		for k in ("required_scopes", "granted_scopes"):
			raw = r.get(k)
			if isinstance(raw, str) and raw.startswith("["):
				try:
					r[k] = json.loads(raw)
				except json.JSONDecodeError:
					pass
	return rows
