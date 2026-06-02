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
"""Sente Rails — before_request hook.

Runs ahead of the platform's built-in OAuth/API-key validators on every
HTTP request. Three responsibilities:

1. Per-request id. Stamps ``frappe.local.request_id`` (UUID4 unless the
   caller sent ``X-Request-Id``), so audit log entries and structured
   error envelopes from ``_reject`` can quote the same id even when
   auth fails before the endpoint decorator runs.

2. Sente-bearer capture. If the Authorization header carries one of
   our prefixed tokens (sk_sandbox_/sk_live_/rk_/pk_/whsec_), stash the
   token on ``frappe.local.sente_bearer`` and DELETE the Authorization
   header from the request environ. This stops the platform's
   OAuth-Bearer validator from raising its generic AuthenticationError
   (which would leak the platform's own exception class into the
   integrator's error envelope) before our ``auth_hook`` and
   ``@sente_api`` decorator get a chance to produce the structured
   Sente envelope via ``_reject``.

3. Integrator session cookie. If a valid ``sente_session`` cookie is
   present, set ``frappe.local.sente_integrator`` so /v1/me/* endpoints
   (and the workbench session_info probe) know who's signed in.

Non-Sente bearers (anything not matching the prefix list) are left
untouched on the Authorization header — the platform's own validators
continue to handle those.
"""

from __future__ import annotations

import uuid

import frappe

_SENTE_BEARER_PREFIXES = ("sk_sandbox_", "sk_live_", "rk_", "pk_", "whsec_")


def stamp_and_capture() -> None:
	"""before_request entry point — wired in hooks.py."""
	try:
		request = frappe.local.request
	except (RuntimeError, AttributeError):
		return  # No HTTP context (bench script, scheduler tick, etc.).

	if not getattr(frappe.local, "request_id", None):
		incoming = request.headers.get("X-Request-Id")
		frappe.local.request_id = incoming or str(uuid.uuid4())

	# (1) + (2) Bearer capture off Authorization.
	auth = request.headers.get("Authorization") or ""
	if auth.startswith("Bearer "):
		token = auth[7:].strip()
		if any(token.startswith(p) for p in _SENTE_BEARER_PREFIXES):
			frappe.local.sente_bearer = token
			request.environ.pop("HTTP_AUTHORIZATION", None)

	# (3) Integrator session cookie -> frappe.local.sente_integrator.
	# Imported lazily so a missing/renamed login module doesn't break the
	# bearer path that pre-dates it.
	try:
		from sente_rails.api.keys.login import attach_session_if_valid

		attach_session_if_valid()
	except Exception:
		pass
