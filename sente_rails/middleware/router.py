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
Sente Rails — public /v1 URL router.

Intercepts `/v1/{path}` requests before the platform's URL routing
fires, parses the path against a route table, promotes path params
into form_dict, and rewrites the WSGI PATH_INFO so the platform's
standard method dispatch picks up the target handler.

This is the dev-bench mirror of the production nginx rewrite. Both
serve the same canonical contract:
    /v1/{resource}  →  internal handler

The router also tags `flags.v1_routed = True` at the top of every
/v1 request so the sibling `response_shape` hook unwraps the envelope
on the way out — successes become `{data: ...}`, errors become
`{error: {code, message}}`. Errors are never rendered as HTML.
"""

import re

import frappe

# (HTTP method, URL pattern, internal target)
# Patterns are anchored full-match; named groups become kwargs to the handler.
# Order matters — first match wins, so put more specific routes before catch-alls.
ROUTE_TABLE = [
	# -------- Self-serve sandbox signup (allow_guest; OTP-gated) --------
	("POST", r"^/v1/signup$", "sente_rails.api.keys.signup.request_signup"),
	("POST", r"^/v1/signup/verify$", "sente_rails.api.keys.signup.verify_signup"),
	("POST", r"^/v1/signup/resend-otp$", "sente_rails.api.keys.signup.resend_otp"),
	("GET", r"^/v1/signup/tos$", "sente_rails.api.keys.signup.signup_tos"),
	# -------- Public OpenAPI spec (consumed by /docs/explorer) --------
	("GET", r"^/v1/openapi\.json$", "sente_rails.api.v1.openapi.get_spec"),
	("GET", r"^/v1/openapi\.postman\.json$", "sente_rails.api.v1.openapi.get_postman_collection"),
	# -------- Public service notices (operator-curated; allow_guest) --------
	("GET", r"^/v1/notices$", "sente_rails.api.v1.notices.list_notices"),
	# -------- Integrator magic-link login (allow_guest; A.2 IA coherence pass) --------
	("POST", r"^/v1/login/request$", "sente_rails.api.keys.login.request_login"),
	("GET", r"^/v1/login/consume$", "sente_rails.api.keys.login.consume_login"),
	("POST", r"^/v1/logout$", "sente_rails.api.keys.login.logout"),
	("GET", r"^/v1/session$", "sente_rails.api.keys.login.session_info"),
	# -------- /v1/me/* — integrator self-service (session OR Bearer; A.3) --------
	("GET", r"^/v1/me$", "sente_rails.api.keys.me.get_me"),
	("PATCH", r"^/v1/me$", "sente_rails.api.keys.me.update_me"),
	("POST", r"^/v1/me$", "sente_rails.api.keys.me.update_me"),
	("GET", r"^/v1/me/keys$", "sente_rails.api.keys.me.list_my_keys"),
	("POST", r"^/v1/me/keys/(?P<name>[^/]+):rotate$", "sente_rails.api.keys.me.rotate_my_key"),
	("POST", r"^/v1/me/keys/(?P<name>[^/]+):revoke$", "sente_rails.api.keys.me.revoke_my_key"),
	("GET", r"^/v1/me/logs$", "sente_rails.api.keys.me.list_my_logs"),
	# -------- /v1/work/* — Counter Stations (Frappe session + Clerk/Supervisor role; C) --------
	("GET", r"^/v1/work/whoami$", "sente_rails.api.work.endpoints.whoami"),
	("GET", r"^/v1/work/mdas$", "sente_rails.api.work.endpoints.list_mdas"),
	("GET", r"^/v1/work/services$", "sente_rails.api.work.endpoints.list_services"),
	("GET", r"^/v1/work/citizens/search$", "sente_rails.api.work.endpoints.search_citizens"),
	("POST", r"^/v1/work/citizens$", "sente_rails.api.work.endpoints.register_citizen"),
	("GET", r"^/v1/work/shift/active$", "sente_rails.api.work.endpoints.active_shift"),
	("GET", r"^/v1/work/shifts$", "sente_rails.api.work.endpoints.list_my_shifts"),
	("GET", r"^/v1/work/history$", "sente_rails.api.work.endpoints.recent_assessments"),
	("POST", r"^/v1/work/shift$", "sente_rails.api.work.endpoints.open_shift"),
	("POST", r"^/v1/work/shift/(?P<name>[^/]+):close$", "sente_rails.api.work.endpoints.close_shift"),
	("GET", r"^/v1/work/shift/(?P<name>[^/]+)/report$", "sente_rails.api.work.endpoints.shift_report"),
	("POST", r"^/v1/work/assessments$", "sente_rails.api.work.endpoints.create_assessment"),
	("POST", r"^/v1/work/assessments/(?P<name>[^/]+):assess$", "sente_rails.api.work.endpoints.assess"),
	("POST", r"^/v1/work/assessments/(?P<name>[^/]+):void$", "sente_rails.api.work.endpoints.void_assessment"),
	("POST", r"^/v1/work/assessments/(?P<name>[^/]+):waive$", "sente_rails.api.work.endpoints.apply_discount"),
	("GET", r"^/v1/work/assessments/(?P<name>[^/]+)$", "sente_rails.api.work.endpoints.get_assessment"),
	("POST", r"^/v1/work/payment-intents$", "sente_rails.api.work.endpoints.create_payment_intent"),
	(
		"POST",
		r"^/v1/work/payment-intents/(?P<name>[^/]+):initiate$",
		"sente_rails.api.work.endpoints.initiate_payment",
	),
	(
		"POST",
		r"^/v1/work/payment-intents/(?P<name>[^/]+):confirm$",
		"sente_rails.api.work.endpoints.confirm_payment",
	),
	(
		"GET",
		r"^/v1/work/payment-intents/(?P<name>[^/]+)/live-status$",
		"sente_rails.api.work.endpoints.payment_live_status",
	),
	(
		"GET",
		r"^/v1/work/payment-intents/(?P<name>[^/]+)/trace$",
		"sente_rails.api.work.endpoints.payment_trace",
	),
	(
		"GET",
		r"^/v1/work/payment-intents/(?P<name>[^/]+)/breakdown$",
		"sente_rails.api.work.endpoints.payment_breakdown",
	),
	(
		"POST",
		r"^/v1/work/payment-intents/(?P<intent>[^/]+):refund$",
		"sente_rails.api.work.endpoints.refund_payment",
	),
	("GET", r"^/v1/work/supervisor/dashboard$", "sente_rails.api.work.endpoints.supervisor_dashboard"),
	(
		"POST",
		r"^/v1/work/supervisor/shifts/(?P<name>[^/]+):approve-variance$",
		"sente_rails.api.work.endpoints.supervisor_approve_variance",
	),
	(
		"POST",
		r"^/v1/work/supervisor/shifts/(?P<name>[^/]+):reject-variance$",
		"sente_rails.api.work.endpoints.supervisor_reject_variance",
	),
	(
		"POST",
		r"^/v1/work/supervisor/shifts/(?P<name>[^/]+):escalate-variance$",
		"sente_rails.api.work.endpoints.supervisor_escalate_variance",
	),
	(
		"POST",
		r"^/v1/work/supervisor/flags/(?P<name>[^/]+):resolve$",
		"sente_rails.api.work.endpoints.supervisor_resolve_flag",
	),
	# -------- /v1/ops/* — Operations Console (Frappe session + role gate; B) --------
	("GET", r"^/v1/ops/whoami$", "sente_rails.api.ops.endpoints.whoami"),
	("GET", r"^/v1/ops/mdas$", "sente_rails.api.ops.endpoints.list_mdas"),
	("GET", r"^/v1/ops/mdas/(?P<name>[^/]+)$", "sente_rails.api.ops.endpoints.get_mda"),
	("PATCH", r"^/v1/ops/mdas/(?P<name>[^/]+)$", "sente_rails.api.ops.endpoints.update_mda"),
	("POST", r"^/v1/ops/mdas/(?P<name>[^/]+)$", "sente_rails.api.ops.endpoints.update_mda"),
	("GET", r"^/v1/ops/services$", "sente_rails.api.ops.endpoints.list_services"),
	("PATCH", r"^/v1/ops/services/(?P<name>[^/]+)$", "sente_rails.api.ops.endpoints.update_service"),
	("POST", r"^/v1/ops/services/(?P<name>[^/]+)$", "sente_rails.api.ops.endpoints.update_service"),
	("GET", r"^/v1/ops/integrators$", "sente_rails.api.ops.endpoints.list_integrators"),
	("GET", r"^/v1/ops/integrators/(?P<name>[^/]+)$", "sente_rails.api.ops.endpoints.get_integrator"),
	(
		"POST",
		r"^/v1/ops/integrators/(?P<name>[^/]+):suspend$",
		"sente_rails.api.ops.endpoints.suspend_integrator",
	),
	(
		"POST",
		r"^/v1/ops/integrators/(?P<name>[^/]+):reactivate$",
		"sente_rails.api.ops.endpoints.reactivate_integrator",
	),
	("GET", r"^/v1/ops/keys$", "sente_rails.api.ops.endpoints.list_keys"),
	("POST", r"^/v1/ops/keys/(?P<name>[^/]+):revoke$", "sente_rails.api.ops.endpoints.force_revoke_key"),
	("GET", r"^/v1/ops/audit$", "sente_rails.api.ops.endpoints.list_audit"),
	("GET", r"^/v1/ops/oversight/aggregates$", "sente_rails.api.ops.endpoints.oversight_aggregates"),
	("GET", r"^/v1/ops/oversight/anomaly-flags$", "sente_rails.api.ops.endpoints.oversight_anomaly_flags"),
	("GET", r"^/v1/ops/oversight/payment-events$", "sente_rails.api.ops.endpoints.oversight_payment_events"),
	(
		"GET",
		r"^/v1/ops/oversight/citizen-consent$",
		"sente_rails.api.ops.endpoints.oversight_citizen_consent",
	),
	("GET", r"^/v1/ops/oversight/statistics$", "sente_rails.api.ops.endpoints.oversight_statistics"),
	("GET", r"^/v1/ops/shifts$", "sente_rails.api.ops.endpoints.list_shifts"),
	("GET", r"^/v1/ops/adapters$", "sente_rails.api.ops.endpoints.adapter_registry"),
	("GET", r"^/v1/ops/system$", "sente_rails.api.ops.endpoints.system_health"),
	# -------- Identity --------
	("GET", r"^/v1/citizens$", "sente_rails.api.v1.citizens.list_citizens"),
	("POST", r"^/v1/citizens$", "sente_rails.api.v1.citizens.create_citizen"),
	("POST", r"^/v1/citizens/register$", "sente_rails.api.v1.citizens.register_citizen"),
	("GET", r"^/v1/citizens/search$", "sente_rails.api.v1.citizens.search_by_nin"),
	("GET", r"^/v1/citizens/(?P<name>[^/]+)$", "sente_rails.api.v1.citizens.get_citizen"),
	# -------- Catalog --------
	("GET", r"^/v1/mdas$", "sente_rails.api.v1.mdas.list_mdas"),
	("GET", r"^/v1/mdas/(?P<name>[^/]+)$", "sente_rails.api.v1.mdas.get_mda"),
	("GET", r"^/v1/services$", "sente_rails.api.v1.services.list_services"),
	("GET", r"^/v1/services/(?P<name>[^/]+)$", "sente_rails.api.v1.services.get_service"),
	# -------- Transactions --------
	("GET", r"^/v1/assessments$", "sente_rails.api.v1.assessments.list_assessments"),
	("POST", r"^/v1/assessments$", "sente_rails.api.v1.assessments.create_assessment"),
	("GET", r"^/v1/assessments/(?P<name>[^/]+)$", "sente_rails.api.v1.assessments.get_assessment"),
	("POST", r"^/v1/assessments/(?P<name>[^/]+):assess$", "sente_rails.api.v1.assessments.assess"),
	("POST", r"^/v1/assessments/(?P<name>[^/]+):cancel$", "sente_rails.api.v1.assessments.cancel"),
	# -------- Payments --------
	("POST", r"^/v1/payment-intents$", "sente_rails.api.v1.payments.create_intent"),
	("GET", r"^/v1/payment-intents/(?P<name>[^/]+)/trace$", "sente_rails.api.v1.payments.trace"),
	("GET", r"^/v1/payment-intents/(?P<name>[^/]+)/live-status$", "sente_rails.api.v1.payments.live_status"),
	(
		"GET",
		r"^/v1/payment-intents/(?P<name>[^/]+)/public-summary$",
		"sente_rails.api.v1.payments.public_summary",
	),
	("GET", r"^/v1/payment-intents/(?P<name>[^/]+)$", "sente_rails.api.v1.payments.get_intent"),
	("POST", r"^/v1/payment-intents/(?P<name>[^/]+):initiate$", "sente_rails.api.v1.payments.initiate"),
	("POST", r"^/v1/payment-intents/(?P<name>[^/]+):confirm$", "sente_rails.api.v1.payments.confirm"),
	("GET", r"^/v1/payment-events$", "sente_rails.api.v1.payments.list_events"),
	# -------- Settlement --------
	("POST", r"^/v1/counter-shifts$", "sente_rails.api.v1.shifts.open_shift"),
	("GET", r"^/v1/counter-shifts$", "sente_rails.api.v1.shifts.list_shifts"),
	("GET", r"^/v1/counter-shifts/active$", "sente_rails.api.v1.shifts.get_active_shift"),
	("GET", r"^/v1/counter-shifts/(?P<name>[^/]+)$", "sente_rails.api.v1.shifts.get_shift"),
	("POST", r"^/v1/counter-shifts/(?P<name>[^/]+):close$", "sente_rails.api.v1.shifts.close_shift"),
	("POST", r"^/v1/counter-shifts/(?P<name>[^/]+):refresh$", "sente_rails.api.v1.shifts.refresh_aggregates"),
	# -------- Integrations --------
	("GET", r"^/v1/integrations$", "sente_rails.api.v1.integrations.list_integrations"),
	# -------- Supervisor --------
	("GET", r"^/v1/supervisor/dashboard$", "sente_rails.api.v1.supervisor.dashboard"),
	(
		"POST",
		r"^/v1/supervisor/shifts/(?P<name>[^/]+):approve-variance$",
		"sente_rails.api.v1.supervisor.approve_variance",
	),
	(
		"POST",
		r"^/v1/supervisor/shifts/(?P<name>[^/]+):reject-variance$",
		"sente_rails.api.v1.supervisor.reject_variance",
	),
	(
		"POST",
		r"^/v1/supervisor/shifts/(?P<name>[^/]+):escalate-variance$",
		"sente_rails.api.v1.supervisor.escalate_variance",
	),
	# -------- Inbound Webhooks (provider callbacks; allow_guest) --------
	("POST", r"^/v1/webhooks/momo$", "sente_rails.api.v1.webhooks.momo_callback"),
	("POST", r"^/v1/webhooks/airtel$", "sente_rails.api.v1.webhooks.airtel_callback"),
	("POST", r"^/v1/webhooks/pesapal$", "sente_rails.api.v1.webhooks.pesapal_callback"),
	("POST", r"^/v1/webhooks/efris$", "sente_rails.api.v1.webhooks.efris_callback"),
	# -------- Oversight (OAG; oversight.read scope; read-only) --------
	("GET", r"^/v1/oversight/aggregates$", "sente_rails.api.v1.oversight.aggregates"),
	("GET", r"^/v1/oversight/audit-trail$", "sente_rails.api.v1.oversight.audit_trail"),
	("GET", r"^/v1/oversight/anomaly-flags$", "sente_rails.api.v1.oversight.anomaly_flags"),
	("GET", r"^/v1/oversight/citizen-consent$", "sente_rails.api.v1.oversight.citizen_consent"),
	("GET", r"^/v1/oversight/payment-events$", "sente_rails.api.v1.oversight.payment_events"),
	("GET", r"^/v1/oversight/statistics$", "sente_rails.api.v1.oversight.statistics"),
]

# Compile patterns once at import.
_COMPILED = [(m, re.compile(p), t) for (m, p, t) in ROUTE_TABLE]

_NOT_FOUND_HANDLER = "sente_rails.middleware.router.v1_not_found"
_METHOD_NOT_ALLOWED_HANDLER = "sente_rails.middleware.router.v1_method_not_allowed"


def route_v1():
	"""before_request hook — intercept /v1/{path} and route to the matching handler.

	Registered in hooks.py via `before_request = [...]`.
	"""
	req = getattr(frappe.local, "request", None)
	if req is None:
		return

	path = req.path
	if not path.startswith("/v1/") and path != "/v1":
		return

	# Tag the request so the response stripper reshapes the envelope on
	# the way out — even error responses get clean JSON.
	frappe.local.flags.v1_routed = True

	# Force JSON responses on the /v1 surface — even errors. The platform's
	# exception handler chooses HTML vs JSON based on Accept header + is_ajax
	# + path.startswith("/api/"). We set Accept + is_ajax so all error paths
	# return JSON regardless of how the request was framed.
	req.environ["HTTP_ACCEPT"] = "application/json"
	frappe.local.is_ajax = True

	method = (req.method or "GET").upper()
	path_matched_any_method = False

	for route_method, pattern, target in _COMPILED:
		m = pattern.match(path)
		if not m:
			continue
		path_matched_any_method = True
		if route_method != method:
			continue

		# Promote path params into form_dict so the handler receives them as kwargs.
		for key, value in m.groupdict().items():
			frappe.local.form_dict[key] = value

		# Rewrite WSGI PATH_INFO so the platform's URL router sees the
		# internal /api/method/... form and dispatches to the target.
		_rewrite_to(req, target)
		return

	# No match. Route to a fallback handler that throws a structured error,
	# so the response goes through normal dispatch (JSON, not HTML) and the
	# after_request stripper can reshape it.
	if path_matched_any_method:
		frappe.local.form_dict["_v1_attempted_method"] = method
		frappe.local.form_dict["_v1_attempted_path"] = path
		_rewrite_to(req, _METHOD_NOT_ALLOWED_HANDLER)
	else:
		frappe.local.form_dict["_v1_attempted_method"] = method
		frappe.local.form_dict["_v1_attempted_path"] = path
		_rewrite_to(req, _NOT_FOUND_HANDLER)


def _rewrite_to(req, target: str) -> None:
	"""Dispatch to `target` via the platform's cmd-based method routing.

	The platform's request handler checks `form_dict.cmd` before path-based
	routing, so setting `cmd` is sufficient — no PATH_INFO mutation needed.
	The deprecation warning the platform prints for cmd-based calls is dev-
	bench noise; production nginx rewrites collapse /v1/... → /api/method/...
	at the edge with no cmd hop.
	"""
	frappe.local.form_dict["cmd"] = target


# -----------------------------------------------------------------------------
# Fallback handlers — invoked when route_v1 finds no match.
# Both throw structured exceptions that response_shape.reshape_v1 converts to
# clean JSON error bodies.
# -----------------------------------------------------------------------------


@frappe.whitelist(allow_guest=True, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def v1_not_found():
	"""Returns 404 with a clean JSON body for unknown /v1 paths."""
	method = frappe.local.form_dict.get("_v1_attempted_method", "?")
	path = frappe.local.form_dict.get("_v1_attempted_path", "?")
	frappe.local.response.http_status_code = 404
	frappe.throw(
		f"No /v1 route registered for {method} {path}",
		exc=frappe.DoesNotExistError,
	)


@frappe.whitelist(allow_guest=True, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def v1_method_not_allowed():
	"""Returns 405 with a clean JSON body when a /v1 path exists but the verb doesn't."""
	method = frappe.local.form_dict.get("_v1_attempted_method", "?")
	path = frappe.local.form_dict.get("_v1_attempted_path", "?")
	frappe.local.response.http_status_code = 405
	frappe.throw(
		f"Method {method} not allowed on {path}",
		exc=frappe.PermissionError,
	)
