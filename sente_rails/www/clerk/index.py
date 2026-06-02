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
"""Sente Rails — Clerk page route.

Lives at /clerk. Single-page counter app for MDA clerks: opens / closes
shift, looks up citizens (cascading local → NIRA), browses services,
assembles assessments, initiates payments via channel adapters, and
renders the printable receipt.

Auth: redirects Guest → /login. Anyone else gets the page.
"""

import frappe

no_cache = 1
no_breadcrumbs = 1
sitemap = 0


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/clerk"
		raise frappe.Redirect

	context.no_cache = 1
	context.show_sidebar = 0

	context.user = frappe.session.user
	context.user_full_name = (
		frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user
	)
	context.csrf_token = frappe.sessions.get_csrf_token()
	context.title = "Sente Rails — Clerk"

	# Pre-load the MDA list so the shift-open dropdown is hydrated
	# without an extra round-trip.
	context.mdas = frappe.get_all(
		"MDA",
		filters={"status": "Active", "mode": "A"},
		fields=["name", "short_code", "full_name", "country"],
		order_by="short_code asc",
	)

	return context
