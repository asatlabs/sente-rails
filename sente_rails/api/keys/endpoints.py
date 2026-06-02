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
"""Sente Rails — API key admin endpoints.

Operator-only CRUD over `Sente API Key` records. Phase 1A surface; the
self-serve sandbox dashboard (Phase 1B) and Tier 3 issuance workflows
(Phase 3) call into these utilities later, with additional gating.

All endpoints require a logged-in user holding either System Manager
or Sente Rails Admin role. Non-operators cannot reach this surface;
sandbox integrators receive their first key via the Phase 1B signup
landing, not via these endpoints.

The plaintext key is returned in the response of `create_key` and
`rotate_key` exactly once. Callers must store it; there is no
"retrieve plaintext" endpoint by design.
"""

from __future__ import annotations

import json

import frappe
from frappe import _

from sente_rails.api.keys import utils

_OPERATOR_ROLES = {"System Manager", "Sente Rails Admin"}


def _guard_operator() -> None:
	if frappe.session.user == "Guest":
		frappe.throw(_("Authentication required."), frappe.AuthenticationError)
	roles = set(frappe.get_roles(frappe.session.user))
	if not roles & _OPERATOR_ROLES:
		frappe.throw(
			_("API key administration requires System Manager or Sente Rails Admin role."),
			frappe.PermissionError,
		)


def _serialise(doc) -> dict:
	"""Public-safe representation of an API Key (no plaintext, no hash)."""
	return {
		"name": doc.name,
		"prefix": doc.prefix,
		"last4": doc.last4,
		"integrator": doc.integrator,
		"environment": doc.environment,
		"key_type": doc.key_type,
		"status": doc.status,
		"scopes": doc.scopes_list(),
		"created_at": doc.creation,
		"expires_at": doc.expires_at,
		"last_used_at": doc.last_used_at,
		"last_used_ip": doc.last_used_ip,
		"usage_count": doc.usage_count or 0,
		"revoked_at": doc.revoked_at,
		"revoked_by": doc.revoked_by,
		"revoked_reason": doc.revoked_reason,
		"rolling_until": doc.rolling_until,
		"rolled_to": doc.rolled_to,
		"description": doc.description,
	}


@frappe.whitelist()
def list_keys(
	integrator: str | None = None,
	environment: str | None = None,
	status: str | None = None,
	limit: int = 50,
	start: int = 0,
) -> list[dict]:
	"""List API keys with optional filters. Plaintext never exposed."""
	_guard_operator()
	filters: dict = {}
	if integrator:
		filters["integrator"] = integrator
	if environment:
		filters["environment"] = environment
	if status:
		filters["status"] = status

	rows = frappe.db.get_all(
		"Sente API Key",
		filters=filters,
		fields=["name"],
		start=int(start),
		page_length=min(int(limit), 200),
		order_by="creation desc",
	)
	return [_serialise(frappe.get_doc("Sente API Key", r.name)) for r in rows]


@frappe.whitelist()
def get_key(name: str) -> dict:
	"""Return one key's public metadata (no plaintext, no hash)."""
	_guard_operator()
	doc = frappe.get_doc("Sente API Key", name)
	return _serialise(doc)


@frappe.whitelist()
def create_key(
	integrator: str,
	environment: str = "sandbox",
	key_type: str = "sk",
	scopes: str | list[str] | None = None,
	description: str | None = None,
	ttl_days: int | None = None,
) -> dict:
	"""Mint a new API key. Plaintext returned exactly once in `plaintext`.

	Operators MUST surface this to the integrator immediately and then
	discard it. There is no recovery path.
	"""
	_guard_operator()
	if not integrator or not frappe.db.exists("Integrator", integrator):
		frappe.throw(_("Integrator {0} does not exist.").format(integrator))

	parsed_scopes: list[str] | None
	if scopes is None or scopes == "":
		parsed_scopes = None
	elif isinstance(scopes, str):
		try:
			parsed_scopes = json.loads(scopes)
			if not isinstance(parsed_scopes, list):
				raise ValueError("scopes JSON must decode to a list")
		except (TypeError, ValueError):
			# Allow comma-separated for convenience in the bench shell:
			parsed_scopes = [s.strip() for s in scopes.split(",") if s.strip()]
	else:
		parsed_scopes = list(scopes)

	plaintext, doc = utils.issue_key(
		integrator=integrator,
		key_type=key_type,
		environment=environment,
		scopes=parsed_scopes,
		description=description,
		ttl_days=int(ttl_days) if ttl_days else None,
	)

	frappe.logger("api.auth").info(
		json.dumps(
			{
				"event": "api.key.issued",
				"key": doc.name,
				"integrator": integrator,
				"environment": environment,
				"key_type": key_type,
				"scopes": doc.scopes_list(),
				"issued_by": frappe.session.user,
			}
		)
	)

	payload = _serialise(doc)
	payload["plaintext"] = plaintext
	payload["plaintext_warning"] = (
		"This is the only time the plaintext key will be displayed. "
		"Store it securely; it cannot be recovered."
	)
	return payload


@frappe.whitelist()
def revoke_key(name: str, reason: str) -> dict:
	"""Revoke an existing key. Idempotent on already-revoked keys."""
	_guard_operator()
	if not reason or not reason.strip():
		frappe.throw(_("Revocation requires a reason."))
	if not frappe.db.exists("Sente API Key", name):
		frappe.throw(_("API Key {0} does not exist.").format(name))
	utils.revoke_key(name, reason=reason.strip(), actor=frappe.session.user)
	frappe.logger("api.auth").info(
		json.dumps(
			{
				"event": "api.key.revoked",
				"key": name,
				"reason": reason.strip(),
				"revoked_by": frappe.session.user,
			}
		)
	)
	return _serialise(frappe.get_doc("Sente API Key", name))


@frappe.whitelist()
def rotate_key(name: str, grace_hours: int = 24) -> dict:
	"""Roll a key — issue a successor, keep the old one usable for the grace window."""
	_guard_operator()
	if not frappe.db.exists("Sente API Key", name):
		frappe.throw(_("API Key {0} does not exist.").format(name))
	plaintext, new_doc = utils.rotate_key(name, grace_hours=int(grace_hours), actor=frappe.session.user)
	frappe.logger("api.auth").info(
		json.dumps(
			{
				"event": "api.key.rotated",
				"old_key": name,
				"new_key": new_doc.name,
				"grace_hours": int(grace_hours),
				"rotated_by": frappe.session.user,
			}
		)
	)
	payload = _serialise(new_doc)
	payload["plaintext"] = plaintext
	payload["plaintext_warning"] = (
		"This is the only time the plaintext key will be displayed. "
		"Store it securely; it cannot be recovered."
	)
	payload["old_key"] = name
	payload["grace_hours"] = int(grace_hours)
	return payload


# ─── Public sandbox signup ───────────────────────────────────────────────


# Bumped whenever the sandbox Terms of Service document materially changes.
# Integrators are required to re-accept on the next dashboard visit.
SANDBOX_TOS_VERSION = "sandbox-tos-v1-2026-05-25"


_EMAIL_RE = __import__("re").compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_CODE_SAFE_RE = __import__("re").compile(r"[^A-Z0-9]+")


def _derive_integrator_code(email: str) -> str:
	"""Derive a unique code from an email — uppercase the local part, sanitise
	to A-Z + 0-9 + hyphen, truncate to 24 chars, then append a 6-char random
	suffix if the base collides with an existing Integrator."""
	import secrets

	local = email.split("@", 1)[0]
	base = _CODE_SAFE_RE.sub("-", local.upper()).strip("-")[:24]
	if not base:
		base = "DEV"
	# Always suffix with random to avoid leaking the integrator's identity
	# via guessable codes (e.g. JOHN-MUKASA vs an opaque code).
	suffix = "".join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789") for _ in range(6))
	code = f"{base}-{suffix}"
	# Defensive: bail with retry if somehow we collide (extremely unlikely).
	while frappe.db.exists("Integrator", code):
		suffix = "".join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789") for _ in range(6))
		code = f"{base}-{suffix}"
	return code


@frappe.whitelist(allow_guest=True, methods=["POST"])
def signup_sandbox(
	full_name: str,
	email: str,
	organisation: str = "",
	tos_accepted_version: str = "",
) -> dict:
	"""Self-serve sandbox-tier signup.

	Public endpoint. Anyone can call. Creates an `Integrator` record at
	tier=Registered + pricing_tier=Free + status=Active, marks the
	signup_source=sandbox-signup, stamps the ToS acceptance, then issues
	the integrator's first sandbox API key with the default scope set
	(see docs/API_SECURITY_DESIGN.md §4.1.3).

	Returns the integrator code + the **plaintext** of the first key
	exactly once. The caller MUST surface the plaintext to the end-user
	and discard it; there is no recovery path.

	Phase 1B v0 — email is captured but not yet OTP-verified (the
	email_verified flag stays False). Phase 4 wires an OTP round-trip
	before key issuance. Rate-limiting + abuse protection is queued as
	a follow-up; for now the endpoint is open and audit-logged.
	"""
	# Input validation.
	full_name = (full_name or "").strip()
	email = (email or "").strip().lower()
	organisation = (organisation or "").strip()
	tos_version = (tos_accepted_version or "").strip()

	if not full_name:
		frappe.throw(_("Full name is required."))
	if not email or not _EMAIL_RE.match(email):
		frappe.throw(_("Valid email address is required."))
	if tos_version != SANDBOX_TOS_VERSION:
		frappe.throw(
			_(
				"You must accept the current Sandbox Terms of Service " "(version {0}) to receive an API key."
			).format(SANDBOX_TOS_VERSION)
		)

	# Reject if this email already has an Integrator — re-issuance flows
	# (rotation, re-sending verification email) live on the dashboard.
	existing = frappe.db.get_value("Integrator", {"contact_email": email}, "name")
	if existing:
		frappe.local.response["http_status_code"] = 409
		frappe.throw(
			_(
				"An integrator is already registered for {0}. "
				"Sign in to your existing dashboard to manage keys."
			).format(email)
		)

	# Create the Integrator.
	code = _derive_integrator_code(email)
	display = (organisation or full_name).strip()[:140]
	integrator = frappe.new_doc("Integrator")
	integrator.code = code
	integrator.display_name = display
	integrator.type = "Developer"
	integrator.tier = "Registered"
	integrator.pricing_tier = "Free"
	integrator.status = "Active"
	integrator.contact_email = email
	integrator.mou_status = "Not Required"
	integrator.kyc_status = "Not Started"
	integrator.tos_accepted_on = frappe.utils.now_datetime()
	integrator.tos_accepted_version = tos_version
	integrator.signup_source = "sandbox-signup"
	integrator.email_verified = 0
	integrator.notes = f"Self-serve signup. Full name on file: {full_name[:100]}"
	integrator.insert(ignore_permissions=True)
	frappe.db.commit()

	# Issue the first sandbox key. Default scope set per §4.1.3.
	plaintext, key_doc = utils.issue_key(
		integrator=code,
		environment="sandbox",
		key_type="sk",
		scopes=None,  # falls back to the default sandbox set
		description=f"First sandbox key — issued at signup for {email}",
	)

	frappe.logger("api.auth").info(
		json.dumps(
			{
				"event": "api.signup.sandbox",
				"integrator": code,
				"email": email,
				"key": key_doc.name,
				"tos_version": tos_version,
			}
		)
	)

	return {
		"integrator": {
			"code": code,
			"display_name": display,
			"contact_email": email,
			"tier": "Registered",
			"pricing_tier": "Free",
			"email_verified": False,
		},
		"key": {
			"name": key_doc.name,
			"prefix": key_doc.prefix,
			"last4": key_doc.last4,
			"scopes": key_doc.scopes_list(),
			"expires_at": key_doc.expires_at,
		},
		"plaintext": plaintext,
		"plaintext_warning": (
			"This is the only time the plaintext key will be displayed. "
			"Store it securely; it cannot be recovered. Use it as a Bearer "
			"token in the X-Sente-Authorization header on every API call."
		),
		"next_steps": [
			"Copy the plaintext into your secrets store now.",
			"Read /docs/quick-start for the five-step end-to-end walkthrough.",
			"For production access, see /docs/security §5 — Live key issuance.",
		],
	}


@frappe.whitelist(allow_guest=True)
def signup_tos() -> dict:
	"""Return the current Sandbox ToS version + a short summary.

	The signup form fetches this to render the ToS checkbox label
	dynamically — when the ToS version bumps the field reflects it
	without a frontend redeploy.
	"""
	return {
		"version": SANDBOX_TOS_VERSION,
		"summary": (
			"The Sandbox Terms of Service cover the obligations of a "
			"developer using sandbox keys: data handling expectations even "
			"in sandbox, no production traffic without the live-key gate, "
			"and the rail's right to revoke abused keys."
		),
		"document_url": "https://github.com/asatlabs/sente-rails/blob/main/docs/legal/SANDBOX_TOS.md",
	}


# ─── Scheduler hooks (auto-expire) ───────────────────────────────────────


def daily_expiry_sweep() -> None:
	"""Scheduled job — flips rolling and past-due keys to `expired`."""
	rolled = utils.expire_rolling_keys()
	past_due = utils.expire_past_keys()
	if rolled or past_due:
		frappe.logger("api.auth").info(
			json.dumps(
				{
					"event": "api.key.expiry_sweep",
					"rolled_expired": rolled,
					"past_due_expired": past_due,
				}
			)
		)
