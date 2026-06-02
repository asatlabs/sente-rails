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
"""Sente Rails — /v1/work/* counter-station API surface.

Auth: Frappe ``sid`` session cookie + role check (``@sente_work``).
Audience: counter clerks + supervisors at MDA offices. Backs the
workbench's /work/* kiosk surface.

Most endpoints delegate to the underlying /v1/* implementations in
``sente_rails.api.v1.*`` — those modules carry the actual business
logic (shift lifecycle, assessment computation, payment-intent
choreography). The /v1/work/* wrappers exist for two reasons:

  1. Auth surface — /v1/* is gated by @sente_api (Bearer + scope),
     /v1/work/* is gated by @sente_work (session cookie + role).
     A clerk's browser session can't carry an API key, and we don't
     want clerks to hold Bearer credentials.

  2. Audit attribution — calls go to the audit log tagged with the
     clerk's user account, not an integrator code.

For some operations (citizen search, service list) the workbench could
in principle call /v1/* directly with a public Bearer, but mixing auth
modes inside one page is ugly. Keeping /work/* as a single coherent
surface simplifies the client.
"""

from __future__ import annotations

import frappe
from frappe import _

from sente_rails.api.work._decorator import sente_work

_SUPERVISOR_ONLY = ["Sente Rails Supervisor", "Sente Rails Admin", "System Manager"]


# ─── Helpers ─────────────────────────────────────────────────────────────


def _work_reject(code: str, message: str, http_status: int = 422) -> None:
	import uuid

	request_id = getattr(frappe.local, "request_id", None) or str(uuid.uuid4())
	envelope = {"code": code, "message": message, "request_id": request_id}
	frappe.local.response.update({"http_status_code": http_status, "error": envelope})
	frappe.local._sente_error = envelope
	frappe.local._sente_error_status = http_status
	if http_status == 401:
		raise frappe.AuthenticationError(message)
	if http_status == 403:
		raise frappe.PermissionError(message)
	if http_status == 404:
		raise frappe.DoesNotExistError(message)
	if http_status == 409:
		raise frappe.DuplicateEntryError(message)
	raise frappe.ValidationError(message)


def _unwrap(fn):
	"""Walk all @functools.wraps decorators on ``fn`` to get the raw
	function body. /v1 endpoints carry @frappe.whitelist + @sente_api
	stacked — we want to bypass BOTH to call from a session-authed
	work-surface wrapper."""
	import inspect

	return inspect.unwrap(fn)


def _verify_supervisor_pin(pin: str) -> str:
	"""Resolve the supervisor whose counter PIN this is, or reject.

	The clerk is the one logged in; a sensitive correction needs a
	supervisor's standing authorisation. The supervisor types their PIN, we
	match it against the (encrypted) ``sente_supervisor_pin`` of every enabled
	user holding an authoriser role, and return that supervisor as the named
	authoriser. Constant-time compare; never leaks which PINs exist.
	"""
	import hmac

	from frappe.utils.password import get_decrypted_password
	from frappe.utils.user import get_users_with_role

	pin = (pin or "").strip()
	if not pin:
		_work_reject("supervisor_pin_required", _("A supervisor PIN is required to authorise this correction."))

	candidates: set[str] = set()
	for role in _SUPERVISOR_ONLY:
		candidates.update(get_users_with_role(role))

	for user in candidates:
		if not frappe.db.get_value("User", user, "enabled"):
			continue
		stored = get_decrypted_password("User", user, "sente_supervisor_pin", raise_exception=False)
		if stored and hmac.compare_digest(str(stored), pin):
			return user

	_work_reject(
		"supervisor_pin_invalid",
		_("That supervisor PIN was not recognised."),
		http_status=403,
	)


# ─── Identity ────────────────────────────────────────────────────────────


def _resolve_user_clerk_mda(user: str) -> str | None:
	"""Read the operator's assigned MDA from the User custom field.

	Returns None for users without an assignment (admins, integrators,
	pre-provisioning state). Callers decide whether None is acceptable
	(admins yes, clerks no).
	"""
	if not user or user == "Guest":
		return None
	# `clerk_mda` is the custom field installed by
	# patches/install_user_mda_field.py. Use get_value rather than
	# get_doc to keep this hot path cheap.
	val = frappe.db.get_value("User", user, "clerk_mda")
	return val or None


@frappe.whitelist(allow_guest=True, methods=["GET"])
def whoami() -> dict:
	"""Public session probe — returns clerk identity + role flags + MDA
	assignment. Used by /work/* on mount to render the right surface
	(clerk vs supervisor vs no-access) and to auto-select the operator's
	MDA in the shift-open UI.

	Like /v1/ops/whoami this one is allow_guest so non-clerk users see
	a "no access" page instead of a 403.
	"""
	user = getattr(frappe.session, "user", None) or "Guest"
	if user == "Guest":
		return {"authenticated": False}
	row = frappe.db.get_value(
		"User",
		user,
		["name", "full_name", "email"],
		as_dict=True,
	) or {"name": user, "full_name": user, "email": user}
	all_roles = sorted(frappe.get_roles(user))
	is_clerk = "Sente Rails Clerk" in all_roles
	is_supervisor = "Sente Rails Supervisor" in all_roles
	is_admin = bool({"Sente Rails Admin", "System Manager"} & set(all_roles))
	clerk_mda = _resolve_user_clerk_mda(user)
	return {
		"authenticated": True,
		"user": row,
		"roles": all_roles,
		"is_clerk": is_clerk,
		"is_supervisor": is_supervisor,
		"is_admin": is_admin,
		"has_work_access": is_clerk or is_supervisor or is_admin,
		# MDA assignment: SCOPE that pairs with the CAPABILITY roles above.
		# None for admins (fleet-wide) or unassigned users.
		"clerk_mda": clerk_mda,
	}


# ─── Catalogue (delegated, role-gated) ───────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def list_mdas() -> list[dict]:
	"""MDAs the signed-in operator may transact at.

	Filtering rule:
	  • Admins (``Sente Rails Admin`` / ``System Manager``) — every
	    active MDA. They operate fleet-wide.
	  • Clerks / Supervisors with a ``clerk_mda`` assigned — only that
	    one MDA. Prevents a clerk at Gulu from opening a shift, listing
	    services, or assessing at any other MDA.
	  • Clerks / Supervisors WITHOUT a ``clerk_mda`` — empty list.
	    Their account is provisioned with a capability role but no
	    scope; Ops/Admin must assign ``clerk_mda`` before they can
	    transact.
	"""
	user = frappe.session.user
	all_roles = set(frappe.get_roles(user))
	is_admin = bool({"Sente Rails Admin", "System Manager"} & all_roles)

	filters: dict = {"status": "Active"}
	if not is_admin:
		assigned = _resolve_user_clerk_mda(user)
		if not assigned:
			return []
		filters["name"] = assigned

	return frappe.db.get_all(
		"MDA",
		filters=filters,
		fields=["name", "short_code", "full_name", "mda_type", "mode"],
		order_by="short_code asc",
		limit_page_length=500,
		ignore_permissions=True,
	)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def list_services(mda: str = "") -> list[dict]:
	"""Services available at the given MDA. Active only."""
	if not mda:
		_work_reject("validation_failed", _("mda is required."))
	return frappe.db.get_all(
		"Service",
		filters={"mda": mda, "status": "Active"},
		fields=[
			"name",
			"mda",
			"code",
			"service_name",
			"sector",
			"service_family",
			"fee_amount",
			"fee_currency",
			"fee_basis",
			"fee_schedule_ref",
			"efris_taxable",
			"vat_applicable",
			"vat_rate",
		],
		order_by="service_name asc",
		limit_page_length=500,
		ignore_permissions=True,
	)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def search_citizens(nin: str = "") -> dict:
	"""Citizen lookup by NIN. Delegates to the existing /v1 search."""
	if not nin:
		_work_reject("validation_failed", _("nin is required."))
	from sente_rails.api.v1.citizens import search_by_nin

	# Bypass @sente_api's Bearer check on the underlying /v1 impl.
	inner = _unwrap(search_by_nin)
	try:
		return inner(nin=nin)
	except frappe.DoesNotExistError:
		return {"source": "miss", "citizen": None}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def register_citizen(nin: str = "", mda: str = "") -> dict:
	"""Find-or-create a local Citizen from a NIN at the counter.

	The missing half of the counter's find-or-create flow: ``search_citizens``
	resolves a NIN but a NIRA-only hit has no local docname to anchor an
	assessment. This persists the NIRA record into the local registry (and
	captures an Identity Verification consent event), returning a usable
	citizen. Idempotent — re-registering an existing NIN returns it as-is.

	``mda`` attributes the consent event; defaults to the clerk's assigned
	MDA when the client omits it.
	"""
	if not nin:
		_work_reject("validation_failed", _("nin is required."))
	resolved_mda = mda or _resolve_user_clerk_mda(frappe.session.user)

	from sente_rails.api.v1.citizens import _register_citizen_from_nin

	try:
		return _register_citizen_from_nin(nin, resolved_mda)
	except frappe.DoesNotExistError:
		_work_reject(
			"not_found",
			_("No citizen found for NIN {0} in the local registry or NIRA.").format(nin),
			http_status=404,
		)


# ─── Shifts ──────────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def active_shift(mda: str = "") -> dict | None:
	"""Current open shift for the signed-in clerk at ``mda``, or None.

	Wraps shifts.get_active_shift but bypasses the Bearer-only @sente_api
	wrapper by calling the inner logic directly. (Frappe's whitelist
	decorator wraps the function but doesn't change call semantics —
	calling the wrapped function still goes through @sente_api which
	requires a Bearer.)
	"""
	if not mda:
		return None
	name = frappe.db.get_value(
		"Counter Shift",
		{"clerk": frappe.session.user, "mda": mda, "status": "Open"},
		"name",
	)
	if not name:
		return None
	from sente_rails.api.v1.shifts import _public_shift

	return _public_shift(frappe.get_doc("Counter Shift", name))


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def list_my_shifts(status: str | None = None, limit: int = 20) -> list[dict]:
	"""Shifts the signed-in clerk has run. Most recent first.

	The selected field names match the Counter Shift doctype exactly —
	prior copy-pasted names (``expected_total`` / ``counted_total`` /
	``variance`` / ``variance_status``) didn't exist and caused
	`get_all` to throw 500. Real fields: ``cash_expected``,
	``cash_counted``, ``cash_variance``, ``variance_reason``. Caller
	receives an alias-mapped dict so the client contract is stable.
	"""
	try:
		limit_int = max(1, min(int(limit or 20), 100))
	except (TypeError, ValueError):
		_work_reject("validation_failed", _("limit must be an integer."))
	filters: dict = {"clerk": frappe.session.user}
	if status:
		filters["status"] = status
	fields = [
		"name",
		"mda",
		"clerk",
		"status",
		"opened_at",
		"closed_at",
		"cash_expected",
		"cash_counted",
		"cash_variance",
		"variance_reason",
	]
	rows = frappe.db.get_all(
		"Counter Shift",
		filters=filters,
		fields=fields,
		order_by="opened_at desc",
		limit_page_length=limit_int,
		ignore_permissions=True,
	)
	# Alias the response keys to the names the workbench's ShiftDoc type
	# expects. Source field names stay raw for clarity in this module.
	return [
		{
			"name": r["name"],
			"mda": r["mda"],
			"clerk": r["clerk"],
			"status": r["status"],
			"opened_at": r["opened_at"],
			"closed_at": r["closed_at"],
			"expected_total": r["cash_expected"],
			"counted_total": r["cash_counted"],
			"variance": r["cash_variance"],
			"variance_status": r["variance_reason"],
		}
		for r in rows
	]


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def open_shift(mda: str = "", counter_label: str = "", opening_cash: float = 0) -> dict:
	"""Open a counter shift. Fails 409 if the clerk already has an open
	shift on the same MDA. Fails 403 if the clerk tries to open at an
	MDA they aren't assigned to (clerk_mda mismatch)."""
	if not mda:
		_work_reject("validation_failed", _("mda is required."))

	# Scope check: a non-admin clerk can only open at their assigned MDA.
	# Filtering /v1/work/mdas removes the picker option in the UI, but a
	# direct API call must also be rejected to close the bypass.
	user = frappe.session.user
	all_roles = set(frappe.get_roles(user))
	is_admin = bool({"Sente Rails Admin", "System Manager"} & all_roles)
	if not is_admin:
		assigned = _resolve_user_clerk_mda(user)
		if not assigned:
			_work_reject(
				"no_mda_assignment",
				_(
					"Your account isn't assigned to an MDA. Ask Ops/Admin to "
					"set your operator MDA before opening a shift."
				),
				http_status=403,
			)
		if assigned != mda:
			_work_reject(
				"mda_mismatch",
				_(
					"You're assigned to MDA {0}. You can't open a shift at "
					"MDA {1}."
				).format(assigned, mda),
				http_status=403,
			)

	existing = frappe.db.get_value(
		"Counter Shift",
		{"clerk": frappe.session.user, "mda": mda, "status": "Open"},
		"name",
	)
	if existing:
		_work_reject(
			"shift_already_open",
			_("You already have an open shift on this MDA: {0}.").format(existing),
			http_status=409,
		)
	try:
		opening = float(opening_cash or 0)
	except (TypeError, ValueError):
		_work_reject("validation_failed", _("opening_cash must be numeric."))
	doc = frappe.new_doc("Counter Shift")
	doc.clerk = frappe.session.user
	doc.mda = mda
	doc.counter_label = counter_label or ""
	doc.status = "Open"
	doc.opened_at = frappe.utils.now_datetime()
	# The Counter Shift field is `opening_float` (an earlier version wrote a
	# non-existent `opening_cash`, silently dropping the float and
	# understating cash_expected at close).
	doc.opening_float = opening
	doc.currency = "UGX"
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	from sente_rails.api.v1.shifts import _public_shift

	return _public_shift(doc)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def close_shift(name: str = "", cash_counted: float = 0, note: str = "") -> dict:
	"""Close the clerk's own open shift."""
	if not name:
		_work_reject("validation_failed", _("Shift name is required."))
	if not frappe.db.exists("Counter Shift", name):
		_work_reject("not_found", _("No such shift."), http_status=404)
	doc = frappe.get_doc("Counter Shift", name)
	if doc.clerk != frappe.session.user and "Sente Rails Supervisor" not in frappe.get_roles():
		_work_reject(
			"forbidden",
			_("You can only close your own shift (or supervisors close others)."),
			http_status=403,
		)
	if doc.status != "Open":
		_work_reject(
			"invalid_state",
			_("Shift is already {0}.").format(doc.status),
			http_status=409,
		)
	try:
		counted = float(cash_counted or 0)
	except (TypeError, ValueError):
		_work_reject("validation_failed", _("cash_counted must be numeric."))
	# Delegate to the Counter Shift controller's close() so reconciliation
	# runs: refresh_aggregates() recomputes per-channel totals + cash_expected,
	# the variance is computed and reason-enforced, and a large-variance
	# anomaly flag is raised. (An earlier version wrote non-existent
	# `counted_total`/`notes` fields and skipped this lifecycle entirely.)
	# The clerk's note is recorded as the variance reason (required by the
	# controller when |variance| > 0) and as the closing note.
	reason = (note or "").strip() or None
	try:
		doc.close(cash_counted=counted, variance_reason=reason, closing_notes=reason)
	except frappe.ValidationError as exc:
		# Most common cause: a non-zero cash variance closed without a reason.
		_work_reject("variance_reason_required", str(exc))
	frappe.db.commit()
	from sente_rails.api.v1.shifts import _public_shift

	return _public_shift(frappe.get_doc("Counter Shift", name))


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def recent_assessments(limit: str = "25") -> list[dict]:
	"""The clerk's recent transactions for the History view + the shift
	dashboard's recent-activity preview. Each row carries the citizen, the
	amounts (with any waiver), the payment outcome, and the latest Payment
	Intent (channel + FDN) so the row can offer a reprint.
	"""
	user = frappe.session.user
	try:
		lim = min(max(int(limit or 25), 1), 100)
	except (TypeError, ValueError):
		lim = 25
	rows = frappe.db.sql(
		"""
		SELECT a.name, a.total_amount, a.gross_amount, a.discount_amount,
		       a.status, a.payment_status, a.creation, a.paid_at, a.mda_default,
		       a.citizen, c.full_name AS citizen_name,
		       pi.name AS intent, pi.channel AS channel, pi.fdn AS fdn,
		       pi.status AS intent_status
		FROM `tabAssessment` a
		LEFT JOIN `tabCitizen` c ON c.name = a.citizen
		LEFT JOIN `tabPayment Intent` pi ON pi.name = (
			SELECT p.name FROM `tabPayment Intent` p
			WHERE p.assessment = a.name ORDER BY p.creation DESC LIMIT 1
		)
		WHERE a.clerk = %(user)s
		ORDER BY a.creation DESC
		LIMIT %(lim)s
		""",
		{"user": user, "lim": lim},
		as_dict=True,
	)
	return [
		{
			"name": r.name,
			"citizen": r.citizen,
			"citizen_name": r.citizen_name or r.citizen,
			"total_amount": float(r.total_amount or 0),
			"gross_amount": float(r.gross_amount or 0),
			"discount_amount": float(r.discount_amount or 0),
			"status": r.status,
			"payment_status": r.payment_status,
			"created": r.creation.isoformat() if r.creation else None,
			"paid_at": r.paid_at.isoformat() if r.paid_at else None,
			"mda": r.mda_default,
			"channel": r.channel,
			"intent": r.intent,
			"intent_status": r.intent_status,
			"fdn": r.fdn,
		}
		for r in rows
	]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def shift_report(name: str = "", kind: str = "X") -> dict:
	"""X / Z report read-model for a shift, for on-screen display.

	kind=X (mid-shift snapshot, live) | Z (close-out, settled). A clerk can
	pull a report for their own shift; supervisors/admins for any.
	"""
	if not name:
		_work_reject("validation_failed", _("Shift name is required."))
	if not frappe.db.exists("Counter Shift", name):
		_work_reject("shift_not_found", _("Shift {0} not found.").format(name), http_status=404)
	owner_clerk = frappe.db.get_value("Counter Shift", name, "clerk")
	roles = set(frappe.get_roles(frappe.session.user))
	is_supervisor = bool(roles & {"Sente Rails Supervisor", "Sente Rails Admin", "System Manager"})
	if not is_supervisor and owner_clerk and owner_clerk != frappe.session.user:
		_work_reject("forbidden", _("You can only view reports for your own shifts."), http_status=403)

	from sente_rails.sente_rails.doctype.counter_shift.shift_report import build_report

	return build_report(name, kind=kind)


# ─── Assessment + payment (delegated) ────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def create_assessment(
	citizen: str = "", lines: list | str = "", mda_default: str = "", notes: str = ""
) -> dict:
	"""Create an assessment with line items. ``lines`` accepts either a
	parsed list or a JSON string. Each line dict needs at least ``service``
	(and may carry quantity / explicit_amount overrides per the underlying
	implementation in api/v1/assessments.py)."""
	if not citizen:
		_work_reject("validation_failed", _("citizen is required."))
	if isinstance(lines, str):
		try:
			import json as _json

			lines = _json.loads(lines or "[]")
		except Exception:
			_work_reject("validation_failed", _("lines must be JSON-parseable."))
	if not isinstance(lines, list) or not lines:
		_work_reject("validation_failed", _("lines is required and must be a non-empty list."))
	# Defer to the existing builder. Calling the wrapped function would
	# trigger @sente_api's Bearer check; we want the body without that.
	from sente_rails.api.v1 import assessments as _ass

	# The function's body is what we want; bypass the decorators by
	# unwrapping via __wrapped__ if present.
	inner = _unwrap(_ass.create_assessment)
	return inner(citizen=citizen, lines=lines, mda_default=mda_default or None, notes=notes or None)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def assess(name: str = "") -> dict:
	"""Compute fees + lock totals on a draft assessment."""
	if not name:
		_work_reject("validation_failed", _("Assessment name is required."))
	from sente_rails.api.v1 import assessments as _ass

	inner = _unwrap(_ass.assess)
	return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def get_assessment(name: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Assessment name is required."))
	from sente_rails.api.v1 import assessments as _ass

	inner = _unwrap(_ass.get_assessment)
	return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def create_payment_intent(
	assessment: str = "",
	channel: str = "",
	citizen_msisdn: str | None = None,
	splits: list | str | None = None,
	aggregator: str | None = None,
	**_framework_kwargs,
) -> dict:
	"""Create a Payment Intent for the given assessment + channel.

	The signature explicitly enumerates the kwargs accepted by the
	underlying ``v1.payments.create_intent`` instead of forwarding
	``**kwargs`` blindly — Frappe's whitelist dispatcher injects ``cmd``
	(and at times ``_``, ``csrf_token``) into the kwargs dict, and
	forwarding them caused TypeError: got an unexpected keyword argument
	'cmd' on every channel (Cash, MoMo, Airtel, Pesapal).
	"""
	if not assessment:
		_work_reject("validation_failed", _("assessment is required."))
	if not channel:
		_work_reject("validation_failed", _("channel is required (MoMo, AirtelMoney, Pesapal, Cash, ...)"))
	from sente_rails.api.v1 import payments as _pay

	inner = _unwrap(_pay.create_intent)
	return inner(
		assessment=assessment,
		channel=channel,
		citizen_msisdn=citizen_msisdn,
		splits=splits,
		aggregator=aggregator,
	)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def initiate_payment(name: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Payment intent name is required."))
	from sente_rails.api.v1 import payments as _pay

	inner = _unwrap(_pay.initiate)
	return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def confirm_payment(name: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Payment intent name is required."))
	from sente_rails.api.v1 import payments as _pay

	inner = _unwrap(_pay.confirm)
	return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def payment_live_status(name: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Payment intent name is required."))
	from sente_rails.api.v1 import payments as _pay

	inner = _unwrap(_pay.live_status)
	return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def payment_trace(name: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Payment intent name is required."))
	from sente_rails.api.v1 import payments as _pay

	inner = _unwrap(_pay.trace)
	return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work()
def payment_breakdown(name: str = "") -> dict:
	"""Where the money went — the per-MDA settlement breakdown for a Payment
	Intent. The counter surface deliberately shows the destination treasury
	accounts (the public /v1 API hides them) so a clerk can explain, at the
	point of payment, that each MDA's share settled directly to its own
	collection account — Sente Rails never holds the funds.
	"""
	if not name:
		_work_reject("validation_failed", _("Payment intent name is required."))
	if not frappe.db.exists("Payment Intent", name):
		_work_reject("intent_not_found", _("Payment Intent {0} not found.").format(name), http_status=404)

	pi = frappe.get_doc("Payment Intent", name)
	events = {
		e.mda: e
		for e in frappe.get_all(
			"Payment Event",
			filters={"payment_intent": name},
			fields=["mda", "amount", "destination_account", "aggregator_txn_id", "received_at"],
		)
	}
	total = float(pi.amount or 0)
	splits = []
	for s in pi.split_rules:
		ev = events.get(s.mda)
		info = (
			frappe.db.get_value(
				"MDA",
				s.mda,
				["short_code", "full_name", "treasury_bank", "treasury_account_name"],
				as_dict=True,
			)
			or {}
		)
		amt = float((ev.amount if ev else s.amount) or 0)
		splits.append(
			{
				"mda": s.mda,
				"mda_code": info.get("short_code") or s.mda,
				"mda_name": info.get("full_name") or s.mda,
				"amount": amt,
				"share_pct": round(amt / total * 100, 1) if total else 0,
				"destination_account": (ev.destination_account if ev else s.destination_account) or "—",
				"account_name": info.get("treasury_account_name"),
				"bank": info.get("treasury_bank"),
				"account_type": s.destination_account_type or "Bank",
				"settled": bool(ev),
				"txn_id": (ev.aggregator_txn_id if ev else None),
				"settled_at": (ev.received_at.isoformat() if ev and ev.received_at else None),
			}
		)

	return {
		"intent": pi.name,
		"channel": pi.channel,
		"currency": pi.currency or "UGX",
		"amount": total,
		"status": pi.status,
		"aggregator": pi.aggregator,
		"fdn": pi.get("fdn"),
		"settled_total": round(sum(x["amount"] for x in splits if x["settled"]), 2),
		"splits": splits,
	}


# ─── Corrections (void / refund) ─────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def void_assessment(name: str = "", reason: str = "") -> dict:
	"""Void an UNPAID assessment (clerk error, citizen walks away).

	Clerk authority — no money has moved, so no supervisor PIN. A paid
	assessment cannot be voided; it must be refunded instead.
	"""
	if not name:
		_work_reject("validation_failed", _("Assessment name is required."))
	status = frappe.db.get_value("Assessment", name, "status")
	if status is None:
		_work_reject("assessment_not_found", _("Assessment {0} not found.").format(name), http_status=404)
	if status == "Paid":
		_work_reject("assessment_already_paid", _("This assessment is paid — use Refund, not Void."))
	if status == "Cancelled":
		_work_reject("assessment_already_cancelled", _("This assessment is already cancelled."))

	from sente_rails.api.v1 import assessments as _a

	inner = _unwrap(_a.cancel)
	return inner(name=name, reason=(reason or "").strip() or None)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def refund_payment(intent: str = "", reason: str = "", supervisor_pin: str = "") -> dict:
	"""Refund a settled payment — supervisor-PIN-gated.

	The clerk processes it; a supervisor's PIN authorises it. Both are
	recorded on the Payment Intent. Reverses every Payment Event via the
	channel adapter and cancels the parent assessment.
	"""
	if not intent:
		_work_reject("validation_failed", _("Payment intent name is required."))
	reason = (reason or "").strip()
	if not reason:
		_work_reject("refund_reason_required", _("A reason is required to refund a payment."))

	supervisor = _verify_supervisor_pin(supervisor_pin)

	from sente_rails.api.v1 import payments as _pay

	return _pay.refund(
		name=intent,
		reason=reason,
		refunded_by=frappe.session.user,
		authorized_by=supervisor,
	)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work()
def apply_discount(name: str = "", amount=0, reason: str = "", supervisor_pin: str = "") -> dict:
	"""Apply (or clear) a supervisor-authorised fee waiver on an unpaid
	assessment — PIN-gated.

	Statutory fees aren't casually discounted; a waiver is an exception a
	supervisor signs off on. Allowed only before payment (Draft / Assessed),
	never above the gross, with a mandatory reason. Pass amount=0 to lift a
	waiver. The authorising supervisor is recorded on the assessment.
	"""
	if not name:
		_work_reject("validation_failed", _("Assessment name is required."))
	try:
		amount = float(amount or 0)
	except (TypeError, ValueError):
		_work_reject("validation_failed", _("Waiver amount must be a number."))
	if amount < 0:
		_work_reject("validation_failed", _("Waiver amount cannot be negative."))
	clearing = amount == 0
	reason = (reason or "").strip()
	if not clearing and not reason:
		_work_reject("waiver_reason_required", _("A reason is required to authorise a waiver."))

	asmt = frappe.get_doc("Assessment", name)
	if asmt.status not in ("Draft", "Assessed"):
		_work_reject(
			"assessment_not_waivable",
			_("A waiver can only be applied before payment; this assessment is {0}.").format(asmt.status),
		)

	gross = round(sum(float(ln.amount or 0) for ln in asmt.assessment_lines), 4)
	if amount > gross:
		_work_reject(
			"waiver_exceeds_total",
			_("The waiver ({0}) cannot exceed the assessment total ({1}).").format(amount, gross),
		)

	supervisor = _verify_supervisor_pin(supervisor_pin)

	asmt.discount_amount = amount
	asmt.discount_reason = None if clearing else reason
	asmt.discount_authorized_by = None if clearing else supervisor
	stamp = (
		f"\n[Waiver lifted] (authorised by {supervisor})"
		if clearing
		else f"\n[Waiver {amount:g}] {reason} (authorised by {supervisor})"
	)
	asmt.notes = (asmt.notes or "") + stamp
	asmt.save()

	from sente_rails.api.v1.assessments import _public_assessment

	return _public_assessment(asmt)


# ─── Supervisor (variance approvals + dashboard) ─────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET"])
@sente_work(roles=_SUPERVISOR_ONLY)
def supervisor_dashboard(mda: str = "") -> dict:
	"""Variance-queue + at-a-glance counters for the supervisor surface."""
	from sente_rails.api.v1 import supervisor as _sup

	inner = _unwrap(_sup.dashboard)
	# Some implementations take an mda kwarg; pass through if non-empty.
	try:
		if mda:
			return inner(mda=mda)
		return inner()
	except TypeError:
		# Signature mismatch — fall back to no-args.
		return inner()


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work(roles=_SUPERVISOR_ONLY)
def supervisor_approve_variance(name: str = "", note: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Shift name is required."))
	from sente_rails.api.v1 import supervisor as _sup

	inner = _unwrap(_sup.approve_variance)
	try:
		return inner(name=name, note=note) if note else inner(name=name)
	except TypeError:
		return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work(roles=_SUPERVISOR_ONLY)
def supervisor_reject_variance(name: str = "", note: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Shift name is required."))
	from sente_rails.api.v1 import supervisor as _sup

	inner = _unwrap(_sup.reject_variance)
	try:
		return inner(name=name, note=note) if note else inner(name=name)
	except TypeError:
		return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work(roles=_SUPERVISOR_ONLY)
def supervisor_escalate_variance(name: str = "", note: str = "") -> dict:
	if not name:
		_work_reject("validation_failed", _("Shift name is required."))
	from sente_rails.api.v1 import supervisor as _sup

	inner = _unwrap(_sup.escalate_variance)
	try:
		return inner(name=name, note=note) if note else inner(name=name)
	except TypeError:
		return inner(name=name)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_work(roles=_SUPERVISOR_ONLY)
def supervisor_resolve_flag(name: str = "", status: str = "Resolved", note: str = "") -> dict:
	"""Triage an anomaly flag from the oversight cockpit."""
	if not name:
		_work_reject("validation_failed", _("Flag name is required."))
	from sente_rails.api.v1 import supervisor as _sup

	inner = _unwrap(_sup.resolve_flag)
	return inner(name=name, status=status, note=(note or "").strip() or None)
