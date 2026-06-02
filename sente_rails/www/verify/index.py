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
"""Sente Rails — public receipt verifier at /verify/{ref}.

A citizen scans the QR on their printed receipt with a phone camera.
They land here. The card confirms the receipt is on file with the MDA,
shows what was paid, and surfaces the aggregator + split chain — all
without requiring login.

Backed by `/v1/payment-intents/{ref}/public-summary` (allow_guest). Only
non-sensitive fields are shown; NIN / phone / msisdn / destination
account numbers never reach the surface.
"""

import frappe

no_cache = 1
no_breadcrumbs = 1
sitemap = 0


def get_context(context):
	ref = frappe.form_dict.get("name") or ""
	ref = ref.strip()

	context.title = "Verify Receipt — Sente Rails"
	context.reference = ref
	context.summary = None
	context.not_found = False
	context.show_form = False

	if not ref:
		# No reference yet — show the entry form so a citizen can type or
		# paste the reference from their receipt (the QR deep-link fills it
		# in automatically; a bare visit lets them enter it by hand).
		context.show_form = True
		return context

	from sente_rails.api.v1.payments import public_summary

	try:
		result = public_summary(ref)
	except frappe.DoesNotExistError:
		context.not_found = True
		context.show_form = True  # let them correct it and try again
		return context

	context.summary = result
	if result and result.get("verified"):
		context.title = f"✓ Verified · {ref} · Sente Rails"
	return context
