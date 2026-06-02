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
"""
Sente Rails — /v1 response envelope stripper.

The platform's default response shape wraps every body in
    {"message": <body>}
plus a handful of bookkeeping keys. For the public /v1 surface we
publish a clean wire format:

    success: { "data": <body> }
    error:   { "error": { "code": "...", "message": "..." } }

This stripper runs as an `after_request` hook. It only acts on
requests the router tagged as `v1_routed=True`; non-/v1 requests pass
through untouched.

Hook signature is fixed by the framework:
    def hook(response, request)
where `response` is a Werkzeug Response object whose JSON body has
already been serialised. We re-serialise after reshape.
"""

import json

import frappe


def reshape_v1(response=None, request=None):
	"""after_request hook — unwrap envelope on /v1 responses only."""
	flags = getattr(frappe.local, "flags", None)
	if not flags or not flags.get("v1_routed"):
		return

	if response is None:
		return

	status = response.status_code or 200

	# Redirect intent set by an endpoint via ``frappe.local.response['type'] =
	# 'redirect'`` — the platform's /api/method/ pipeline hardcodes
	# ``build_response('json')`` so it never invokes the redirect builder.
	# We pick it up here, set the proper Location header + 302 status, and
	# drop the body. Cookies set via cookie_manager are already on the
	# response object at this point.
	resp_dict = getattr(frappe.local, "response", None) or {}
	if resp_dict.get("type") == "redirect" and resp_dict.get("location"):
		response.status_code = int(resp_dict.get("http_status_code") or 302)
		response.headers["Location"] = resp_dict["location"]
		response.set_data(b"")
		response.mimetype = "text/plain"
		return

	# Leave other 3xx alone — preserves whatever the upstream set.
	if 300 <= status < 400:
		return

	# Parse the current body
	try:
		raw = response.get_data(as_text=True)
		body = json.loads(raw) if raw else {}
	except (ValueError, TypeError):
		return

	if not isinstance(body, dict):
		return

	# Error path: framework set exc_type / _server_messages
	if body.get("exc_type") or body.get("_server_messages") or status >= 400:
		# Honour a pre-existing structured Sente envelope when set by
		# `_reject` (sente_rails.api.keys.auth) — preserves the precise
		# error.code + request_id rather than reclassifying off the
		# platform's exc_type. We check body["error"] first (set via
		# frappe.local.response.update), then fall back to a stash on
		# frappe.local (set defensively in case the platform's exception
		# handler doesn't propagate frappe.local.response into the body).
		stashed = _stashed_sente_error(body)
		if stashed is not None:
			new_body = {"error": stashed}
		else:
			new_body = {
				"error": {
					"code": _classify(body, status),
					"message": _extract_error_message(body),
				}
			}
		# Honour an explicit status override stashed on frappe.local
		# (set by helpers like _signup_reject for codes that don't have
		# a native platform exception — e.g. 422 validation_failed,
		# 429 resend_too_soon). Falls back to whatever Werkzeug derived
		# from the raised exception class.
		stashed_status = getattr(frappe.local, "_sente_error_status", None)
		if isinstance(stashed_status, int) and 400 <= stashed_status < 600:
			new_status = stashed_status
		else:
			new_status = status if status >= 400 else 500
	else:
		# Success path: framework put the handler's return value in "message".
		# Move it to "data".
		#
		# Opt-out for endpoints that need to serve a raw third-party format
		# (e.g. a Postman Collection v2.1 JSON, which has its own top-level
		# `{info, item, ...}` shape — wrapping it in `{data: ...}` makes it
		# fail Postman's format check). Such endpoints set
		# `frappe.local.flags.v1_raw_json = True`; we then unwrap from
		# `{message: ...}` straight to the raw value with no Sente envelope.
		raw_passthrough = flags.get("v1_raw_json")
		if raw_passthrough:
			new_body = body.get("message")
		else:
			new_body = {"data": body.get("message")}
		new_status = status

	response.set_data(json.dumps(new_body, separators=(",", ":"), default=str))
	response.status_code = new_status
	response.mimetype = "application/json"


# -------- helpers --------


def _stashed_sente_error(body: dict) -> dict | None:
	"""Return the structured Sente error envelope if one was stashed.

	Two sources, in order of trust:
	  1. ``body["error"]`` — set when frappe.local.response["error"] was
	     propagated into the response body by the platform's exception
	     handler (the common case).
	  2. ``frappe.local._sente_error`` — defensive backup stash set by
	     `_reject` directly on frappe.local, in case the platform's
	     exception handler reset frappe.local.response before serialising.
	An envelope is recognised only if it has string ``code`` and
	``message`` keys.
	"""
	candidates = (body.get("error"), getattr(frappe.local, "_sente_error", None))
	for candidate in candidates:
		if (
			isinstance(candidate, dict)
			and isinstance(candidate.get("code"), str)
			and isinstance(candidate.get("message"), str)
		):
			return candidate
	return None


def _extract_error_message(body: dict) -> str:
	"""Pull a user-friendly message out of the framework error envelope."""
	sm = body.get("_server_messages")
	if sm:
		try:
			arr = json.loads(sm) if isinstance(sm, str) else sm
			if arr:
				first = arr[0]
				if isinstance(first, str):
					first = json.loads(first)
				if isinstance(first, dict) and first.get("message"):
					return first["message"]
		except (json.JSONDecodeError, KeyError, TypeError, IndexError):
			pass
	if body.get("exception"):
		ex = body["exception"]
		if ": " in ex:
			ex = ex.split(": ", 1)[1]
		return ex
	if body.get("message"):
		return str(body["message"])
	return "Server error"


def _classify(body: dict, status: int) -> str:
	"""Map platform exception types + HTTP status to stable error codes."""
	exc_type = (body.get("exc_type") or "").lower()
	if "validation" in exc_type:
		return "validation_failed"
	if "permission" in exc_type or "notpermitted" in exc_type:
		return "forbidden"
	if "doesnotexist" in exc_type or "notfound" in exc_type:
		return "not_found"
	if "duplicate" in exc_type or "unique" in exc_type:
		return "conflict"
	if status >= 500:
		return "internal_error"
	if status == 404:
		return "not_found"
	if status == 403:
		return "forbidden"
	if status == 422:
		return "validation_failed"
	if status == 405:
		return "method_not_allowed"
	return "error"
