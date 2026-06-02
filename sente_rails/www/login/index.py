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
"""Sente Rails — branded login page.

Overrides the platform's default /login template. The form posts to the
platform's `/api/method/login` endpoint (CSRF + session management
stays in the framework); only the chrome changes.

If the user is already authenticated, we send them straight to the
role-appropriate operator surface via `sente_rails.auth`.
"""

import frappe

no_cache = 1
no_breadcrumbs = 1
sitemap = 0


def get_context(context):
	if frappe.session.user and frappe.session.user != "Guest":
		from sente_rails.auth import get_home_page_for_user

		target = get_home_page_for_user(frappe.session.user)
		if not target.startswith("/"):
			target = "/" + target
		frappe.local.flags.redirect_location = target
		raise frappe.Redirect

	context.title = "Sign in — Sente Rails"
	context.no_header = True
	context.no_sidebar = True
	# Where to send the user on a successful login when no ?redirect-to was
	# provided. The JS handler reads this from the page.
	context.default_home = "/"
	return context
