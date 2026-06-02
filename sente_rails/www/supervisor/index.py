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
"""Sente Rails — MDA Supervisor dashboard at /supervisor.

End-of-shift command surface for an MDA supervisor. Top-row KPI tiles
(today's revenue, open shifts, closing-now, flagged variances), an
active-counters table with click-to-drill, two breakdown cards
(by-service, by-channel), and a side drawer with variance
approve / reject / escalate actions.

Auth: redirects Guest → /login. The page itself loads the first
payload server-side (so the demo is snappy on first paint); the
client-side JS handles refresh, MDA switch, date scroll, and
variance actions.
"""

import frappe

from sente_rails.api.v1.supervisor import dashboard as supervisor_dashboard

no_cache = 1
no_breadcrumbs = 1
sitemap = 0


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/supervisor"
		raise frappe.Redirect

	mda = frappe.form_dict.get("mda")
	date = frappe.form_dict.get("date")
	payload = supervisor_dashboard(mda=mda, date=date)

	context.user = frappe.session.user
	context.csrf_token = frappe.sessions.get_csrf_token()
	context.title = "Sente Rails — Supervisor"
	context.payload = payload
	context.mda_options = frappe.get_all(
		"MDA",
		filters={"status": "Active"},
		fields=["name", "short_code", "full_name"],
		order_by="short_code asc",
	)
	return context
