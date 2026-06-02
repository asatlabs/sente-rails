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
app_name = "sente_rails"
app_title = "Sente Rails"
app_publisher = "ASAT LABS"
app_description = "Government revenue collection and orchestration rail for Uganda — Apache 2.0"
app_email = "opensource@asatlabs.org"
app_license = "apache-2.0"


# -----------------------------------------------------------------------------
# Website routing
# -----------------------------------------------------------------------------
# Map `/` to the public sandbox landing (sente_rails/www/index.html).
# Without this the platform falls back to `/me` → `/login` for guests.
home_page = "index"


# Dynamic public routes — map `/verify/<ref>` to the verify www page so
# citizens scanning a printed receipt QR land on a citizen-friendly
# verification card.
website_route_rules = [
	{"from_route": "/verify/<name>", "to_route": "verify"},
	# /docs/explorer is the canonical React-embedded Scalar reference,
	# served by the workbench. nginx routes /docs/* straight through to
	# the workbench Node process — no Frappe www mapping needed. The
	# legacy Swagger-UI page at sente_rails/www/api_explorer/ is retired;
	# /api-explorer now 301s to /docs/explorer at the nginx layer.
]


# -----------------------------------------------------------------------------
# Authentication routing
# -----------------------------------------------------------------------------
# The platform's default post-login redirect lands users at /app (the
# admin Desk). That surface is blocked at the edge — users land on the
# operator surface that matches their role. See `sente_rails/auth.py`
# for the role → route mapping.
on_login = "sente_rails.auth.on_login"
get_website_user_home_page = "sente_rails.auth.get_home_page_for_user"


# -----------------------------------------------------------------------------
# Request lifecycle
# -----------------------------------------------------------------------------
# The /v1 public API surface is exposed by:
#   1. before_request.stamp_and_capture — stamps frappe.local.request_id and
#                                         captures a Sente bearer off the
#                                         Authorization header (stripping the
#                                         header so the platform's OAuth
#                                         validator doesn't reject it with a
#                                         platform-branded AuthenticationError)
#   2. router.route_v1      — intercepts /v1/{path}, rewrites the WSGI path
#                             to dispatch the matching internal method
#   3. response_shape.reshape_v1 — strips the platform's response envelope
#                                  and replaces it with {data: ...} or
#                                  {error: {...}} for /v1 responses only

before_request = [
	"sente_rails.api.keys.before_request.stamp_and_capture",
	"sente_rails.middleware.router.route_v1",
]


# -----------------------------------------------------------------------------
# Auth hooks — Sente Bearer recognition
# -----------------------------------------------------------------------------
# The platform runs `validate_auth_via_hooks` after its built-in OAuth + token
# validators return False silently. We hook in here to recognise our own
# Bearer keys. The token has already been stripped off the Authorization
# header and stashed on `frappe.local.sente_bearer` by the
# `before_request.stamp_and_capture` step above; the auth_hook reads from
# there first, with X-Sente-Authorization (and the raw Authorization header)
# kept as fallbacks for paths where before_request didn't run (bench script,
# unit tests).
#
# Without this hook, the platform leaves Bearer-authenticated requests as
# Guest and downstream permission checks fall back to AuthenticationError
# before our `@sente_api` decorator can produce a structured rejection. See
# sente_rails/api/keys/auth.py and docs/API_SECURITY_DESIGN.md §6.1.

auth_hooks = [
	"sente_rails.api.keys.auth.authenticate_via_sente_bearer",
]

after_request = [
	"sente_rails.middleware.response_shape.reshape_v1",
]


# -----------------------------------------------------------------------------
# Scheduled jobs
# -----------------------------------------------------------------------------
# Daily sweep of API keys past their rotation grace window or hard expiry —
# see sente_rails.api.keys.utils for the state transitions and
# docs/API_SECURITY_DESIGN.md §3.5 for the rotation contract.

scheduler_events = {
	"daily": [
		"sente_rails.api.keys.endpoints.daily_expiry_sweep",
		# 7-year purge floor on the audit log — 90-day hot window is a
		# query-layer filter applied at /v1/me/logs; this DELETE bounds
		# the table's growth. See project_sente_ui_coherence Decision #2.
		"sente_rails.sente_rails.doctype.sente_api_audit_log.sente_api_audit_log.purge_old_audit_log",
		# EFRIS PRN buffer top-up — for every MDA with prn_buffer_target > 0,
		# count Available rows and reserve_batch the deficit so the clerk
		# never blocks on an empty pool mid-shift.
		"sente_rails.jobs.prn_buffer_worker.replenish_buffer",
	],
	"cron": {
		# Cross-MDA Propagation worker — drains Pending CMP rows whose
		# next_attempt_at has elapsed. Backoff schedule lives in
		# sente_rails.utils.propagation.BACKOFF_MINUTES.
		"*/5 * * * *": [
			"sente_rails.jobs.propagation_worker.process_propagation_queue",
		],
		# Velocity-spike anomaly detector — per clerk, flag hours where
		# the assessment count is > mean + 2σ of the 7-day baseline.
		"*/30 * * * *": [
			"sente_rails.jobs.anomaly_detector.detect_velocity_spikes",
		],
	},
}
