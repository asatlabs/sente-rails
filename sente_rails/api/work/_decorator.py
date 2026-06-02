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
"""Sente Rails — @sente_work decorator for /v1/work/* counter-station endpoints.

Parallel to @sente_ops (Frappe session + admin/oversight roles), but
role-gated to clerk + supervisor — the staff who actually run counter
shifts. Same audit semantics: every call writes a row to
``Sente API Audit Log`` via ``auth._audit``.

  @sente_work(roles=["Sente Rails Clerk", "Sente Rails Supervisor"])
  def some_endpoint(...): ...

Or default (clerks + supervisors + admins):

  @sente_work()
  def some_endpoint(...): ...

Supervisor-only endpoints (variance approval) override the roles list to
exclude clerks.
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

# Default role tier for counter-station endpoints. Admin is included so
# operators can pinch-hit at a real counter without having to assume a
# clerk role temporarily.
_DEFAULT_WORK_ROLES = [
	"Sente Rails Clerk",
	"Sente Rails Supervisor",
	"Sente Rails Admin",
	"System Manager",
]


def sente_work(roles: Iterable[str] | None = None) -> Callable:
	required_roles: list[str]
	if roles is None:
		required_roles = list(_DEFAULT_WORK_ROLES)
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
					_("Sign in at /login to access the counter station."),
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
						"required_scopes": required_roles,
						"granted_scopes": sorted(user_roles),
						"http_status": 403,
					}
				)
				_reject(
					"forbidden",
					_("Counter station access requires one of: {0}.").format(", ".join(required_roles)),
					http_status=403,
				)

			frappe.local.sente_work_user = user
			granted_work_roles = sorted(user_roles & set(required_roles))
			frappe.local.sente_work_roles = granted_work_roles

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
						"granted_scopes": granted_work_roles,
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
					"granted_scopes": granted_work_roles,
					"latency_ms": latency_ms,
					"http_status": 200,
				}
			)
			return result

		wrapper.__sente_work_required_roles__ = required_roles  # type: ignore[attr-defined]
		return wrapper

	return decorator
