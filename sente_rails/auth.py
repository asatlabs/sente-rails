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
"""Sente Rails — post-login role-based routing.

After a successful login, the platform's default behaviour is to send
the user to /app (the admin Desk). On Sente Rails the Desk is blocked
at the edge — users land on the surface that matches their role:

  Clerk           → /clerk
  Supervisor      → /supervisor          (P0.5, not yet built)
  Treasurer       → /treasury            (P1, planned)
  Admin / Sys Mgr → /clerk               (until /admin lands)
  Citizen         → /portal              (P1, planned)
  OAG Auditor     → /oversight           (P1, planned)
  Everyone else   → / (public landing)
"""

import frappe

# Ordered most-specific to least so that, when a user holds multiple
# roles (Admin who is also a Clerk, etc.), the operationally narrowest
# surface wins.
ROLE_ROUTES: list[tuple[str, str]] = [
	# Counter Stations (Front Door C). Clerks open shifts + transact;
	# supervisors approve variances. Both surfaces live under /work/* in
	# the workbench; /clerk and /supervisor remain available as the
	# transitional pre-workbench routes during the parallel-build window.
	("Sente Rails Clerk", "/work/shift"),
	("Sente Rails Supervisor", "/work/supervisor"),
	("Sente Rails Treasurer", "/treasury"),
	# OAG and Admin / System Manager both land on the Operations Console
	# (Front Door B). OAG sees a read-only subset (oversight + audit);
	# Admin/SysMgr see write surfaces too. Role-gating happens inside
	# /v1/ops/* via @sente_ops.
	("Sente Rails OAG", "/ops"),
	("Sente Rails Admin", "/ops"),
	("System Manager", "/ops"),
	("Sente Rails Citizen", "/portal"),
]

FALLBACK_ROUTE = "index"  # bare route — the framework adds the leading slash


def get_home_page_for_user(user: str | None = None) -> str:
	"""Resolve the post-login destination for a given user, by role.

	Frappe calls this via the `get_website_user_home_page` hook. The
	hook contract returns a bare route (no leading slash) — the
	framework prepends `/` when redirecting.
	"""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return FALLBACK_ROUTE

	try:
		roles = set(frappe.get_roles(user))
	except Exception:
		return FALLBACK_ROUTE

	for role, route in ROLE_ROUTES:
		if role in roles:
			return route.lstrip("/")

	return FALLBACK_ROUTE


def on_login(login_manager) -> None:
	"""`on_login` hook — set the response redirect target by role.

	NOTE: the platform's `LoginManager.post_login()` calls our `on_login`
	first, then runs several internal steps, and finally calls
	`set_user_info()` which UNCONDITIONALLY overwrites
	`frappe.local.response["home_page"]` with `/app` (or `/app/home`)
	for System Users. So setting the response here is a no-op on the
	System User path in modern platform versions.

	We keep the override as a defensive layer — it still works for
	Website User logins (set_user_info sets `/me` not `/app` for them,
	and we want to override that too) and for any platform version that
	doesn't clobber. But the durable fix for the System User path lives
	in ``get_post_login_route`` (called by the /login form JS after
	auth succeeds).
	"""
	target = get_home_page_for_user(login_manager.user)
	if not target.startswith("/"):
		target = "/" + target
	frappe.local.response["home_page"] = target


@frappe.whitelist()
def get_post_login_route() -> dict:
	"""Post-login redirect lookup for the /login form's JS.

	The platform's ``/api/method/login`` overwrites our role-based
	``home_page`` after ``on_login`` fires (see the note in
	``on_login``). The /login form's JS calls THIS endpoint after a
	successful login — the session cookie is already set, so we look
	up the route from the active session user's roles.

	Returns: ``{"route": "/ops"}`` (or whichever role-appropriate
	surface). Always returns a leading-slash path the JS can
	``window.location.href`` directly.
	"""
	user = frappe.session.user if frappe.session else None
	if not user or user == "Guest":
		return {"route": "/login"}
	target = get_home_page_for_user(user)
	if not target.startswith("/"):
		target = "/" + target
	return {"route": target}
