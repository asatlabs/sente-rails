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
"""Sente Rails — @sente_ops decorator for /v1/ops/* endpoints.

Parallel to @sente_api (Bearer + scope) and @sente_me (cookie OR Bearer,
no scope). This one is for the Operations Console — auth via Frappe
``sid`` session cookie set by the platform's standard login flow, with
a role gate.

  @sente_ops(roles=["Sente Rails Admin", "Sente Rails OAG"])
  def some_endpoint(...): ...

Audit semantics match the other two decorators — every call writes a
row to ``Sente API Audit Log`` via ``auth._audit`` so /ops/audit shows
the ops traffic itself.
"""

from __future__ import annotations

import functools
import time
from collections.abc import Callable, Iterable

import frappe
from frappe import _

from sente_rails.api.keys.auth import (
	_audit,
	_ensure_request_id,
	_reject,
	_safe_request_attr,
	_source_ip,
)


def sente_ops(roles: Iterable[str] | None = None) -> Callable:
	"""Decorator for /v1/ops/* endpoints — Frappe-user session + role gate.

	``roles`` is any-of. If omitted, defaults to the Sente Rails operator
	roles (Admin, Operator). Pass an explicit list to widen (e.g. to add
	Oversight Read on read-only oversight endpoints).
	"""
	required_roles: list[str]
	if roles is None:
		required_roles = ["Sente Rails Admin", "System Manager"]
	else:
		required_roles = list(roles)

	def decorator(fn: Callable) -> Callable:
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

			user = getattr(frappe.session, "user", None) or "Guest"
			if user == "Guest":
				_audit(
					{
						"event": "api.auth.denied",
						"reason": "no_session",
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
					_("Sign in to the Operations Console at /login first."),
					http_status=401,
				)

			user_roles = set(frappe.get_roles(user))
			if not (user_roles & set(required_roles)):
				_audit(
					{
						"event": "api.auth.denied",
						"reason": "insufficient_role",
						"endpoint": endpoint,
						"method": method,
						"source_ip": source_ip,
						"user_agent": user_agent,
						"request_id": request_id,
						"required_scopes": required_roles,  # reuse the field
						"granted_scopes": sorted(user_roles),
						"http_status": 403,
					}
				)
				_reject(
					"forbidden",
					_("Operations Console requires one of: {0}.").format(", ".join(required_roles)),
					http_status=403,
				)

			# Bind context for downstream code + audit.
			frappe.local.sente_ops_user = user
			frappe.local.sente_ops_roles = sorted(user_roles & set(required_roles))

			try:
				result = fn(*args, **kwargs)
			except Exception as exc:
				latency_ms = int((time.perf_counter() - started_at) * 1000)
				_audit(
					{
						"event": "api.handler.error",
						"endpoint": endpoint,
						"method": method,
						"source_ip": source_ip,
						"user_agent": user_agent,
						"request_id": request_id,
						"required_scopes": required_roles,
						"granted_scopes": sorted(user_roles & set(required_roles)),
						"latency_ms": latency_ms,
						"error_class": type(exc).__name__,
						"http_status": 500,
					}
				)
				raise

			latency_ms = int((time.perf_counter() - started_at) * 1000)
			_audit(
				{
					"event": "api.auth.granted",
					"endpoint": endpoint,
					"method": method,
					"source_ip": source_ip,
					"user_agent": user_agent,
					"request_id": request_id,
					"required_scopes": required_roles,
					"granted_scopes": sorted(user_roles & set(required_roles)),
					"latency_ms": latency_ms,
					"http_status": 200,
				}
			)
			return result

		wrapper.__sente_ops_required_roles__ = required_roles  # type: ignore[attr-defined]
		return wrapper

	return decorator
