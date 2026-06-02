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
"""Sente Rails — API key bearer-auth decorator.

Wraps any /v1 endpoint to enforce: token present → token hashed and
matched → key status active/rolling → not past expiry → required scope
present → integrator status active. Updates last_used_at and writes a
structured audit log entry. Rejects with stable error codes (see
docs/API_SECURITY_DESIGN.md §3.6 and docs/api-standards in the live
workbench).

Usage:

    from sente_rails.api.keys.auth import sente_api

    @frappe.whitelist(allow_guest=True)
    @sente_api(scope="citizens.read")
    def search_by_nin(nin: str):
        ...

The `allow_guest=True` at the Frappe layer lets the request reach the
inner decorator; the Sente decorator does the real authorisation. Once
auth succeeds, the inner function may read `frappe.local.sente_api_key`
and `frappe.local.sente_integrator` for downstream attribution and
audit.
"""

from __future__ import annotations

import functools
import json
import time
from collections.abc import Callable

import frappe
from frappe import _
from frappe.utils import now_datetime

from sente_rails.api.keys.utils import lookup_by_token

# ─── Error envelope ──────────────────────────────────────────────────────


def _reject(code: str, message: str, http_status: int = 401) -> None:
	"""Throw a structured rejection with the spec error envelope.

	Sets response status code + payload so the integrator sees the
	`error.code` documented in /docs/api-standards.

	Exception class matches the target HTTP status:
	  - 401 (unauthorized, key_revoked, key_expired) →
	    frappe.AuthenticationError, which the framework maps to 401
	  - 403 (forbidden, key_integrator_suspended) →
	    frappe.PermissionError, which the framework maps to 403
	This keeps the status code aligned with the error.code in the body.
	"""
	request_id = frappe.local.request_id if hasattr(frappe.local, "request_id") else _new_request_id()
	envelope = {
		"code": code,
		"message": message,
		"request_id": request_id,
	}
	frappe.local.response.update(
		{
			"http_status_code": http_status,
			"error": envelope,
		}
	)
	# Defensive backup — the platform's exception handler may rebuild
	# frappe.local.response before serialisation, dropping our envelope.
	# response_shape.reshape_v1 reads this stash as a fallback so the
	# structured Sente error reaches the wire regardless.
	frappe.local._sente_error = envelope
	# Branch the exception class so the platform maps to the correct
	# HTTP status: AuthenticationError -> 401, PermissionError -> 403.
	# The structured envelope (code/message/request_id) survives either
	# path because response_shape.reshape_v1 reads from the defensive
	# `frappe.local._sente_error` stash, not from frappe.local.response
	# (which the platform's AuthenticationError handler rebuilds).
	if http_status == 401:
		raise frappe.AuthenticationError(message)
	raise frappe.PermissionError(message)


def _new_request_id() -> str:
	return f"req_{frappe.generate_hash(length=20)}"


# ─── Request-context helpers ─────────────────────────────────────────────


def _safe_request_attr(attr: str, default=""):
	"""Read a request attribute defensively.

	`frappe.local.request` is a Werkzeug LocalProxy — even `hasattr()`
	can return True while attribute access raises RuntimeError("object
	is not bound") when there's no active request context (e.g. when
	the decorator is invoked from a bench script). This wrapper swallows
	that and returns a safe default.
	"""
	try:
		return getattr(frappe.local.request, attr, default)
	except (RuntimeError, AttributeError):
		return default


def _source_ip() -> str:
	# X-Forwarded-For is set by our nginx; first entry is the real client.
	try:
		fwd = frappe.get_request_header("X-Forwarded-For") or ""
	except (RuntimeError, AttributeError):
		fwd = ""
	if fwd:
		return fwd.split(",")[0].strip()
	# Fallback to REMOTE_ADDR (direct dev runs without nginx).
	environ = _safe_request_attr("environ", {})
	if isinstance(environ, dict):
		return environ.get("REMOTE_ADDR", "")
	return ""


def _audit_trace(payload: dict) -> None:
	"""Tracer for the auth_hook path — silent if logger init fails."""
	try:
		frappe.logger("api.auth").info(__import__("json").dumps(payload, default=str))
	except Exception:
		pass


def authenticate_via_sente_bearer() -> None:
	"""auth_hook — recognise our Bearer tokens on the Authorization header.

	The framework's OAuth + token-style validators both return False
	silently on unrecognised credentials (they don't throw); the framework
	then runs `validate_auth_via_hooks` to give app-level auth hooks a
	chance. This is that hook.

	If the Authorization header carries one of our keys (sk_/rk_/pk_/whsec_),
	we hash + look up the row, validate status, and set the session user to
	Administrator so the wrapped function can hit permission-gated Frappe
	operations. The scope check still happens in the `@sente_api` decorator
	on the endpoint — this hook is only responsible for "is this a key we
	recognise as a usable credential". Without it, the framework leaves
	the user as Guest and downstream code may raise AuthenticationError
	before reaching our decorator.

	Wired via `auth_hooks` in hooks.py. Companion to `@sente_api`, not a
	replacement — the decorator is still where scope authorisation happens.
	"""
	_audit_trace({"event": "auth_hook.enter"})

	# The before_request hook (sente_rails.api.keys.before_request) captures
	# our bearers off Authorization into frappe.local.sente_bearer and strips
	# the header so the platform's OAuth validator doesn't reject our keys
	# before we get here. Prefer that captured value; fall back to
	# X-Sente-Authorization (always-on parallel channel) and then the raw
	# Authorization header for paths where before_request didn't run (bench
	# scripts, unit tests).
	captured = getattr(frappe.local, "sente_bearer", None)
	if captured:
		token = captured
	else:
		try:
			auth = (
				frappe.get_request_header("X-Sente-Authorization")
				or frappe.get_request_header("Authorization")
				or ""
			)
		except (RuntimeError, AttributeError) as exc:
			_audit_trace({"event": "auth_hook.no_request", "error": str(exc)})
			return
		if not auth.startswith("Bearer "):
			_audit_trace({"event": "auth_hook.skip_no_bearer", "auth_len": len(auth)})
			return
		token = auth[7:].strip()
	if not any(token.startswith(p) for p in ("sk_", "rk_", "pk_", "whsec_")):
		_audit_trace({"event": "auth_hook.skip_foreign_format", "head": token[:6]})
		return

	key_doc = lookup_by_token(token)
	if key_doc is None:
		_audit_trace({"event": "auth_hook.lookup_miss", "prefix": token.split("_", 3)[:3]})
		return

	usable, code = key_doc.is_usable_now()
	if not usable:
		_audit_trace({"event": "auth_hook.unusable", "key": key_doc.name, "code": code})
		return

	# Authenticate as Administrator for the rest of the request. The
	# integrator + key attribution is preserved on frappe.local for audit.
	# Phase 3 will swap Administrator for a synthetic per-integrator User
	# with role-scoped Frappe perms.
	#
	# IMPORTANT: frappe.set_user() resets frappe.local.form_dict to an empty
	# _dict() (see frappe/__init__.py::set_user). The framework's own
	# `validate_oauth` and `validate_auth_via_api_keys` handle this by
	# snapshotting + restoring form_dict around set_user. We do the same
	# pattern here so the URL query params (e.g. `?nin=...`) survive into
	# the wrapped endpoint kwargs.
	saved_form_dict = frappe.local.form_dict
	frappe.set_user("Administrator")
	frappe.local.form_dict = saved_form_dict
	frappe.local.sente_api_key = key_doc
	frappe.local.sente_integrator = key_doc.integrator
	_audit_trace(
		{
			"event": "auth_hook.authenticated",
			"key": key_doc.name,
			"integrator": key_doc.integrator,
			"session_user_now": frappe.session.user,
		}
	)


def _ensure_request_id() -> str:
	if getattr(frappe.local, "request_id", None):
		return frappe.local.request_id
	try:
		incoming = frappe.get_request_header("X-Request-Id")
	except (RuntimeError, AttributeError):
		incoming = None
	frappe.local.request_id = incoming or _new_request_id()
	return frappe.local.request_id


# ─── Audit log ───────────────────────────────────────────────────────────


_audit_logger = None


def _audit(payload: dict) -> None:
	"""Emit a structured audit entry — to the api.auth logger AND to the
	``Sente API Audit Log`` doctype.

	Both writes are best-effort. The doctype write powers the integrator
	dashboard's /v1/me/logs surface (90-day hot, 7-year purge floor — see
	project_sente_ui_coherence Decision #2); the logger write remains for
	greppability from a shell on the bench host.

	Audit must never break the request path — both branches swallow.
	"""
	global _audit_logger
	if _audit_logger is None:
		_audit_logger = frappe.logger("api.auth", with_more_info=False)
	try:
		_audit_logger.info(json.dumps(payload, default=str, ensure_ascii=False))
	except Exception:
		pass
	try:
		_audit_to_doctype(payload)
	except Exception:
		# Doctype write fault must NEVER block API handling. The logger
		# already has the same payload for forensic recovery.
		pass


def _audit_to_doctype(payload: dict) -> None:
	"""Insert one row into ``Sente API Audit Log``.

	Direct SQL — bypasses the doctype controller / hooks / permissions
	machinery for speed on the hot path. The doctype has ``in_create=1``
	(no UI inserts) and no controller validators, so we're not skipping
	any business logic. autoname=hash means we generate the name ourselves.
	"""
	# Resolve the api_key link only if we have a key_doc on the payload;
	# `_audit` is called both before and after the lookup happens, so the
	# field can legitimately be empty.
	api_key_name = payload.get("key") or None
	integrator = payload.get("integrator") or None
	required = payload.get("required_scopes") or []
	granted = payload.get("granted_scopes") or []
	frappe.db.sql(
		"""
		INSERT INTO `tabSente API Audit Log`
			(name, creation, modified, modified_by, owner, docstatus, idx,
			 ts, event, request_id, http_method, endpoint, http_status,
			 error_code, integrator, api_key, source_ip, user_agent,
			 required_scopes, granted_scopes, latency_ms)
		VALUES
			(%(name)s, %(ts)s, %(ts)s, 'Administrator', 'Administrator', 0, 0,
			 %(ts)s, %(event)s, %(request_id)s, %(http_method)s, %(endpoint)s,
			 %(http_status)s, %(error_code)s, %(integrator)s, %(api_key)s,
			 %(source_ip)s, %(user_agent)s,
			 %(required_scopes)s, %(granted_scopes)s, %(latency_ms)s)
		""",
		{
			"name": frappe.generate_hash(length=10),
			"ts": frappe.utils.now_datetime(),
			"event": payload.get("event") or "api.audit.unknown",
			"request_id": payload.get("request_id"),
			"http_method": payload.get("method"),
			"endpoint": payload.get("endpoint"),
			"http_status": int(payload.get("http_status") or 0),
			"error_code": payload.get("reason") if payload.get("event", "").endswith("denied") else None,
			"integrator": integrator,
			"api_key": api_key_name,
			"source_ip": payload.get("source_ip"),
			"user_agent": payload.get("user_agent"),
			"required_scopes": json.dumps(required) if required else None,
			"granted_scopes": json.dumps(granted) if granted else None,
			# Int columns on the doctype are NOT NULL with default 0 — denied-path
			# audits don't carry latency (the handler never ran) so coerce None to 0.
			"latency_ms": int(payload.get("latency_ms") or 0),
		},
	)
	# The platform rolls back DB writes at the end of GET requests by
	# default — audit-log inserts MUST survive that. Force the commit
	# inline. The audit row stands even if the wrapped handler later
	# raises; we explicitly want that behaviour for forensic completeness.
	frappe.db.commit()


# ─── The decorator ───────────────────────────────────────────────────────


def sente_api(scope: str | list[str] | None = None) -> Callable:
	"""Bearer-auth + scope-check decorator for /v1 endpoints.

	scope: a single scope string, a list of scopes (any-of semantics),
	       or None (auth required but no specific scope check beyond
	       implicit `catalogue.read`). For per-MDA delegation in Phase 3,
	       scopes will become callable predicates that receive the
	       request context; today they are static strings.
	"""
	required_scopes: list[str]
	if scope is None:
		required_scopes = []
	elif isinstance(scope, str):
		required_scopes = [scope]
	else:
		required_scopes = list(scope)

	def decorator(fn: Callable) -> Callable:
		@functools.wraps(fn)
		def wrapper(*args, **kwargs):
			request_id = _ensure_request_id()
			started_at = time.perf_counter()
			source_ip = _source_ip()
			endpoint = _safe_request_attr("path", fn.__name__)
			method = _safe_request_attr("method", "?")

			# 1. Extract Bearer token. Prefer the before_request-captured
			# value (frappe.local.sente_bearer — set by
			# sente_rails.api.keys.before_request, which also strips the
			# Authorization header before the platform's OAuth validator
			# can reject our keys). Fall back to X-Sente-Authorization
			# (always-on parallel channel) and then the raw Authorization
			# header for paths where before_request didn't run (bench
			# scripts, unit tests).
			captured = getattr(frappe.local, "sente_bearer", None)
			if captured:
				token = captured
			else:
				try:
					auth_header = (
						frappe.get_request_header("X-Sente-Authorization")
						or frappe.get_request_header("Authorization")
						or ""
					)
				except (RuntimeError, AttributeError):
					auth_header = ""
				if not auth_header.startswith("Bearer "):
					_audit(
						{
							"event": "api.auth.denied",
							"reason": "no_bearer_header",
							"endpoint": endpoint,
							"method": method,
							"source_ip": source_ip,
							"request_id": request_id,
							"required_scopes": required_scopes,
							"http_status": 401,
						}
					)
					_reject(
						"unauthorized", _("Missing Bearer token in Authorization header."), http_status=401
					)
				token = auth_header[7:].strip()

			# 2. Hash + lookup.
			key_doc = lookup_by_token(token)
			if key_doc is None:
				_audit(
					{
						"event": "api.auth.denied",
						"reason": "key_not_found",
						"endpoint": endpoint,
						"method": method,
						"source_ip": source_ip,
						"request_id": request_id,
						"required_scopes": required_scopes,
						"http_status": 401,
					}
				)
				_reject("unauthorized", _("Invalid API key."), http_status=401)

			# 3. Status + expiry check.
			usable, error_code = key_doc.is_usable_now()
			if not usable:
				_audit(
					{
						"event": "api.auth.denied",
						"reason": error_code,
						"key": key_doc.name,
						"integrator": key_doc.integrator,
						"endpoint": endpoint,
						"method": method,
						"source_ip": source_ip,
						"request_id": request_id,
						"http_status": 401,
					}
				)
				_reject(
					error_code or "unauthorized",
					_("API key is not usable: {0}.").format(error_code),
					http_status=401,
				)

			# 4. Integrator must be Active.
			integrator_status = frappe.db.get_value("Integrator", key_doc.integrator, "status")
			if integrator_status != "Active":
				_audit(
					{
						"event": "api.auth.denied",
						"reason": "integrator_suspended",
						"key": key_doc.name,
						"integrator": key_doc.integrator,
						"integrator_status": integrator_status,
						"endpoint": endpoint,
						"method": method,
						"source_ip": source_ip,
						"request_id": request_id,
						"http_status": 403,
					}
				)
				_reject(
					"key_integrator_suspended",
					_("The integrator owning this key is currently suspended."),
					http_status=403,
				)

			# 5. Scope check.
			granted_scopes = set(key_doc.scopes_list())
			missing = [s for s in required_scopes if s not in granted_scopes]
			if missing:
				_audit(
					{
						"event": "api.auth.denied",
						"reason": "insufficient_scope",
						"key": key_doc.name,
						"integrator": key_doc.integrator,
						"endpoint": endpoint,
						"method": method,
						"source_ip": source_ip,
						"request_id": request_id,
						"required_scopes": required_scopes,
						"granted_scopes": sorted(granted_scopes),
						"missing": missing,
						"http_status": 403,
					}
				)
				_reject(
					"forbidden",
					_("API key is missing required scope(s): {0}.").format(", ".join(missing)),
					http_status=403,
				)

			# 6. Auth succeeded — bind to request context.
			frappe.local.sente_api_key = key_doc
			frappe.local.sente_integrator = key_doc.integrator

			# 6b. Elevate to Administrator so the wrapped function can hit
			# permission-gated Frappe operations (Citizen reads, etc.). The
			# integrator + key are tracked separately on frappe.local for
			# audit attribution — frappe.session.user is just the operator
			# identity under which the wrapped function runs. Phase 3 swaps
			# this for a synthetic per-integrator User with role-scoped
			# Frappe perms; for Phase 1A v0, Administrator gets us moving.
			#
			# frappe.set_user() resets form_dict; snapshot + restore so any
			# downstream code that reads form_dict (e.g. handlers that
			# re-inspect query params) still sees the original values.
			try:
				saved_fd = frappe.local.form_dict
				frappe.set_user("Administrator")
				frappe.local.form_dict = saved_fd
			except Exception:
				# Outside an HTTP request context (rare), skip — the wrapped
				# function will use whatever user is already bound.
				pass

			# 7. Bump usage counters via direct SQL (no validate hook for hot path).
			try:
				frappe.db.set_value(
					"Sente API Key",
					key_doc.name,
					{
						"last_used_at": now_datetime(),
						"last_used_ip": source_ip[:140],
						"usage_count": (key_doc.usage_count or 0) + 1,
					},
					update_modified=False,
				)
			except Exception as exc:
				# Usage tracking is best-effort; never block the API call.
				_audit(
					{
						"event": "api.auth.usage_track_failed",
						"key": key_doc.name,
						"error": str(exc),
					}
				)

			# 8. Invoke the wrapped endpoint.
			try:
				result = fn(*args, **kwargs)
			except Exception as exc:
				latency_ms = int((time.perf_counter() - started_at) * 1000)
				_audit(
					{
						"event": "api.handler.error",
						"key": key_doc.name,
						"integrator": key_doc.integrator,
						"endpoint": endpoint,
						"method": method,
						"source_ip": source_ip,
						"request_id": request_id,
						"required_scopes": required_scopes,
						"granted_scopes": sorted(granted_scopes),
						"latency_ms": latency_ms,
						"error_class": type(exc).__name__,
						"http_status": 500,
					}
				)
				raise

			# 9. Audit success.
			latency_ms = int((time.perf_counter() - started_at) * 1000)
			_audit(
				{
					"event": "api.auth.granted",
					"key": key_doc.name,
					"integrator": key_doc.integrator,
					"endpoint": endpoint,
					"method": method,
					"source_ip": source_ip,
					"request_id": request_id,
					"required_scopes": required_scopes,
					"granted_scopes": sorted(granted_scopes),
					"latency_ms": latency_ms,
					"http_status": 200,
				}
			)
			return result

		# Expose the required scopes on the function for introspection
		# (used by the workbench to surface "this endpoint requires X").
		wrapper.__sente_required_scopes__ = required_scopes  # type: ignore[attr-defined]
		return wrapper

	return decorator


# ─── /v1/me/* decorator — accepts session OR bearer ──────────────────────


def sente_me(fn: Callable) -> Callable:
	"""Self-service decorator for /v1/me/* endpoints.

	Accepts either auth method, in order of preference:

	  1. ``frappe.local.sente_integrator`` set by
	     ``before_request.stamp_and_capture`` from a valid session cookie
	     (browser dashboard).
	  2. ``frappe.local.sente_bearer`` set by the same hook from an
	     Authorization: Bearer header (management scripts holding their
	     own API key). The bearer is hashed + looked up, validated for
	     usability + integrator-Active status, and the integrator code
	     is attached to frappe.local.

	No scope check — by definition /v1/me/* operates on the caller's own
	row, not on cross-integrator data. Every call is audited the same way
	as @sente_api so /dashboard/logs picks up self-service traffic too.
	"""

	@functools.wraps(fn)
	def wrapper(*args, **kwargs):
		request_id = _ensure_request_id()
		started_at = time.perf_counter()
		source_ip = _source_ip()
		endpoint = _safe_request_attr("path", fn.__name__)
		method = _safe_request_attr("method", "?")
		try:
			user_agent = frappe.get_request_header("User-Agent") or ""
		except (RuntimeError, AttributeError):
			user_agent = ""

		# 1. Already authenticated via session cookie?
		integrator_code = getattr(frappe.local, "sente_integrator", None)
		key_doc = None

		# 2. Fall back to Bearer key.
		if not integrator_code:
			captured = getattr(frappe.local, "sente_bearer", None)
			if captured:
				key_doc = lookup_by_token(captured)
				if key_doc is not None:
					usable, code = key_doc.is_usable_now()
					if usable:
						status = frappe.db.get_value("Integrator", key_doc.integrator, "status")
						if status == "Active":
							integrator_code = key_doc.integrator
							frappe.local.sente_integrator = integrator_code
							frappe.local.sente_api_key = key_doc

		if not integrator_code:
			_audit(
				{
					"event": "api.auth.denied",
					"reason": "no_session_or_key",
					"endpoint": endpoint,
					"method": method,
					"source_ip": source_ip,
					"user_agent": user_agent,
					"request_id": request_id,
					"http_status": 401,
				}
			)
			_reject(
				"unauthorized",
				_("Sign in via /signin or provide a valid API key in the Authorization header."),
				http_status=401,
			)

		# 3. Bind for the wrapped function — endpoints read frappe.local.sente_integrator
		# to scope their queries.
		try:
			result = fn(*args, **kwargs)
		except Exception as exc:
			latency_ms = int((time.perf_counter() - started_at) * 1000)
			_audit(
				{
					"event": "api.handler.error",
					"integrator": integrator_code,
					"key": key_doc.name if key_doc else None,
					"endpoint": endpoint,
					"method": method,
					"source_ip": source_ip,
					"user_agent": user_agent,
					"request_id": request_id,
					"latency_ms": latency_ms,
					"http_status": 500,
					"error_class": type(exc).__name__,
				}
			)
			raise

		latency_ms = int((time.perf_counter() - started_at) * 1000)
		_audit(
			{
				"event": "api.auth.granted",
				"integrator": integrator_code,
				"key": key_doc.name if key_doc else None,
				"endpoint": endpoint,
				"method": method,
				"source_ip": source_ip,
				"user_agent": user_agent,
				"request_id": request_id,
				"latency_ms": latency_ms,
				"http_status": 200,
			}
		)
		return result

	wrapper.__sente_me__ = True  # type: ignore[attr-defined]
	return wrapper
