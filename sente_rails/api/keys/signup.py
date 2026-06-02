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
"""Sente Rails — Phase 1B self-serve sandbox signup with email OTP.

Two-step flow:

  1. ``POST /v1/signup`` — caller submits email + organisation + ToS
     acceptance. Creates Integrator at ``status=PendingEmail``, generates
     a 6-digit OTP (15-min TTL), persists ``otp_hash`` + ``otp_expires_at``,
     and "sends" the OTP. Returns ``{integrator_id, message}`` — no key.

  2. ``POST /v1/signup/verify`` — caller submits the OTP. On match (not
     expired, hash matches), flips Integrator to ``status=Active`` +
     ``email_verified=1``, issues the first sandbox API key, and returns
     the plaintext key exactly once.

  3. ``POST /v1/signup/resend-otp`` — rate-limited regeneration of the
     OTP. Caps: at most one send per 60 seconds; at most 5 sends per
     integrator per UTC day. Resets the 15-min TTL.

Email delivery (dev stub). With no SMTP configured on the bench, this
module writes the OTP to the ``api.signup`` logger in bench logs. The
operator tails ``logs/web.log`` (or ``logs/worker.log``) to retrieve the
code during testing. When real SMTP creds land in ``site_config.json``
plus an ``Email Account``, swap ``_deliver_otp`` for ``frappe.sendmail``
— the rest of the flow is unchanged. The dev stub is the ONLY place that
references the plaintext OTP outside the verify-time hash comparison.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_to_date, now_datetime

from sente_rails.api.keys import utils

# ─── Constants ───────────────────────────────────────────────────────────


# Bumped whenever the sandbox Terms of Service document materially changes.
# Integrators are required to re-accept on the next dashboard visit.
SANDBOX_TOS_VERSION = "sandbox-tos-v1-2026-05-25"

OTP_TTL_MINUTES = 15
OTP_RESEND_MIN_SECONDS = 60
OTP_DAILY_MAX = 5

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_CODE_SAFE_RE = re.compile(r"[^A-Z0-9]+")


# ─── Helpers ─────────────────────────────────────────────────────────────


def _new_request_id() -> str:
	import uuid

	return str(uuid.uuid4())


def _signup_reject(code: str, message: str, http_status: int = 422) -> None:
	"""Structured rejection for /v1/signup* paths.

	Mirrors ``auth._reject`` but lives here so signup doesn't import an
	auth-specific helper. Sets the response status + stashes the envelope
	on ``frappe.local._sente_error`` (read by reshape_v1) + raises an
	exception class whose platform-default status matches ``http_status``.

	  - 401 → AuthenticationError
	  - 403 → PermissionError
	  - 409 → DuplicateEntryError
	  - 429 → ValidationError (with http_status_code preset; the platform
	          honours the response dict's override)
	  - other → ValidationError (preset)
	"""
	request_id = getattr(frappe.local, "request_id", None) or _new_request_id()
	envelope = {"code": code, "message": message, "request_id": request_id}
	frappe.local.response.update({"http_status_code": http_status, "error": envelope})
	frappe.local._sente_error = envelope
	# Pair the envelope with an explicit status override. Several Sente
	# error codes (validation_failed=422, not_found=404, resend_too_soon=
	# 429) don't map to a native platform exception class, so we'd
	# otherwise fall back to ValidationError -> 417. response_shape
	# reads this to apply the right status on the way out.
	frappe.local._sente_error_status = http_status
	if http_status == 401:
		raise frappe.AuthenticationError(message)
	if http_status == 403:
		raise frappe.PermissionError(message)
	if http_status == 409:
		raise frappe.DuplicateEntryError(message)
	if http_status == 404:
		raise frappe.DoesNotExistError(message)
	raise frappe.ValidationError(message)


def _derive_integrator_code(email: str) -> str:
	"""Derive a unique code from an email — uppercase the local part, sanitise
	to A-Z + 0-9 + hyphen, truncate to 24 chars, then append a 6-char random
	suffix. Always suffixes so the code doesn't leak the integrator identity
	via guessable patterns (e.g. JOHN-MUKASA).
	"""
	local = email.split("@", 1)[0]
	base = _CODE_SAFE_RE.sub("-", local.upper()).strip("-")[:24]
	if not base:
		base = "DEV"
	suffix = "".join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789") for _ in range(6))
	code = f"{base}-{suffix}"
	while frappe.db.exists("Integrator", code):
		suffix = "".join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789") for _ in range(6))
		code = f"{base}-{suffix}"
	return code


def _generate_otp() -> str:
	"""Cryptographically-secure 6-digit code, leading zeros preserved."""
	return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp(otp: str, integrator_code: str) -> str:
	"""Hash the OTP for storage. Site secret + integrator code keep
	rainbow tables useless across integrators / installs."""
	secret = frappe.local.conf.get("secret_key") or "sente-rails-fallback"
	salted = f"{integrator_code}:{otp}:{secret}".encode()
	return hashlib.sha256(salted).hexdigest()


def _constant_time_match(a: str, b: str) -> bool:
	"""Side-channel-safe string compare."""
	return hmac.compare_digest((a or "").encode("utf-8"), (b or "").encode("utf-8"))


def _deliver_otp(integrator_code: str, email: str, otp: str, expires_at) -> None:
	"""Deliver the signup OTP to the integrator's contact email.

	When ``mail_server`` is set in site_config, sends via ``frappe.sendmail``
	with the branded transactional template. The dev-stub log line is
	written too so operators always have a fallback (when SMTP flakes,
	when running offline, when debugging delivery).

	The log line carries the OTP plaintext on dev for that fallback path;
	flip ``sente_dev_reveal_otp_in_log: 0`` in site_config on hardened
	deployments to drop the plaintext.
	"""
	import os

	transport = "smtp" if frappe.local.conf.get("mail_server") else "dev-stub-log"
	include_otp = frappe.local.conf.get("sente_dev_reveal_otp_in_log") != 0  # default ON for dev
	payload_d = {
		"event": "api.signup.otp_sent",
		"integrator": integrator_code,
		"email": email,
		"expires_at": str(expires_at),
		"transport": transport,
		"ts": str(now_datetime()),
	}
	if include_otp:
		payload_d["otp"] = otp
	payload = json.dumps(payload_d)
	bench_root = os.path.abspath(os.path.join(frappe.get_site_path(), "..", ".."))
	log_path = os.path.join(bench_root, "logs", "sente_signup_otps.dev.log")
	try:
		with open(log_path, "a") as fh:
			fh.write(payload + "\n")
	except OSError:
		pass
	frappe.logger("api.signup").info(payload)

	if not frappe.local.conf.get("mail_server"):
		return
	try:
		frappe.sendmail(
			recipients=[email],
			sender=f"Sente Rails <{frappe.local.conf.get('auto_email_id') or 'noreply@sente-rails.space'}>",
			subject="Your Sente Rails verification code",
			template=None,
			message=_signup_otp_html(otp),
			now=True,
		)
	except Exception:
		frappe.log_error(title="Sente Rails — signup OTP email delivery failed")


def _signup_otp_html(otp: str) -> str:
	"""Branded OTP email body — matches the magic-link template structure.

	Big monospaced OTP block, single CTA back to /signup. Same tricolor
	accent strip + ASAT LABS footer as the login email.
	"""
	return f"""\
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fa;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="font-size:0;line-height:0;padding:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td width="33%" height="4" style="background:#1a1d29;height:4px;font-size:0;line-height:0;">&nbsp;</td>
                <td width="34%" height="4" style="background:#fcdc04;height:4px;font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" height="4" style="background:#d90000;height:4px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:12px;">
                  <span style="display:inline-block;font-size:18px;font-weight:700;color:#0a2540;letter-spacing:-0.01em;">Sente Rails</span>
                </td>
                <td valign="middle">
                  <span style="display:inline-block;font-size:10px;font-weight:600;color:#9ca3af;letter-spacing:0.1em;text-transform:uppercase;">Republic of Uganda</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 8px;">
            <h1 style="margin:16px 0 12px;font-size:22px;font-weight:600;color:#0a2540;letter-spacing:-0.01em;line-height:1.3;">Verify your email</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#374151;">
              Enter this 6-digit code on the signup page to verify your email address and finish creating your integrator account.
            </p>
            <div style="margin:24px 0;padding:18px 24px;background:#f5f7fa;border:1px solid #e5e7eb;border-radius:8px;text-align:center;">
              <span style="font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:600;color:#0a2540;letter-spacing:0.25em;">{otp}</span>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.55;">
              The code expires in {OTP_TTL_MINUTES} minutes. If you didn&rsquo;t start a signup, you can ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 22px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.55;">
              Sente Rails is open infrastructure for Uganda&rsquo;s government revenue rail.
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;line-height:1.55;">
              Built by <a href="https://asatlabs.org" style="color:#6b7280;text-decoration:none;font-weight:600;">ASAT LABS</a>
              <span style="color:#d1d5db;">&nbsp;&middot;&nbsp;</span>
              Apache 2.0
              <span style="color:#d1d5db;">&nbsp;&middot;&nbsp;</span>
              <a href="https://sente-rails.space" style="color:#6b7280;text-decoration:none;">sente-rails.space</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
"""


# ─── Endpoints ───────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_signup(
	full_name: str = "",
	email: str = "",
	organisation: str = "",
	tos_accepted_version: str = "",
	intended_use: str = "",
) -> dict:
	"""Step 1 — submit signup details, receive an OTP by email.

	Creates an Integrator in ``status=PendingEmail`` with
	``email_verified=0``. No API key is issued at this step — the caller
	must complete ``POST /v1/signup/verify`` with the OTP to receive one.

	Returns ``{integrator_id, message, expires_at_iso}``.
	"""
	full_name = (full_name or "").strip()
	email = (email or "").strip().lower()
	organisation = (organisation or "").strip()
	tos_version = (tos_accepted_version or "").strip()
	intended_use = (intended_use or "").strip()

	if not full_name:
		_signup_reject("validation_failed", _("Full name is required."))
	if not email or not _EMAIL_RE.match(email):
		_signup_reject("validation_failed", _("Valid email address is required."))
	if tos_version != SANDBOX_TOS_VERSION:
		_signup_reject(
			"validation_failed",
			_(
				"You must accept the current Sandbox Terms of Service " "(version {0}) to request an API key."
			).format(SANDBOX_TOS_VERSION),
		)

	existing = frappe.db.get_value("Integrator", {"contact_email": email}, "name")
	if existing:
		_signup_reject(
			"duplicate_email",
			_(
				"An integrator is already registered for {0}. "
				"Sign in to your existing dashboard to manage keys."
			).format(email),
			http_status=409,
		)

	code = _derive_integrator_code(email)
	display = (organisation or full_name).strip()[:140]
	otp = _generate_otp()
	expires_at = add_to_date(now_datetime(), minutes=OTP_TTL_MINUTES, as_datetime=True)

	integrator = frappe.new_doc("Integrator")
	integrator.code = code
	integrator.display_name = display
	integrator.type = "Developer"
	integrator.tier = "Registered"
	integrator.pricing_tier = "Free"
	integrator.status = "PendingEmail"
	integrator.contact_email = email
	integrator.mou_status = "Not Required"
	integrator.kyc_status = "Not Started"
	integrator.tos_accepted_on = now_datetime()
	integrator.tos_accepted_version = tos_version
	integrator.signup_source = "sandbox-signup"
	integrator.email_verified = 0
	integrator.otp_hash = _hash_otp(otp, code)
	integrator.otp_expires_at = expires_at
	integrator.otp_attempts_today = 1
	integrator.last_otp_sent_at = now_datetime()
	notes_extra = f" intended_use={intended_use[:200]}" if intended_use else ""
	integrator.notes = f"Self-serve signup. Full name on file: {full_name[:100]}.{notes_extra}"
	integrator.insert(ignore_permissions=True)
	frappe.db.commit()

	_deliver_otp(code, email, otp, expires_at)

	return {
		"integrator_id": code,
		"email": email,
		"message": (
			"Check your email. We sent a 6-digit code that expires in " f"{OTP_TTL_MINUTES} minutes."
		),
		"expires_at_iso": expires_at.isoformat() if hasattr(expires_at, "isoformat") else str(expires_at),
		"tos_version": tos_version,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_signup(integrator_id: str = "", otp: str = "") -> dict:
	"""Step 2 — submit the OTP, receive the sandbox API key plaintext.

	On success: Integrator flips to ``status=Active`` + ``email_verified=1``,
	OTP fields cleared, first sandbox key issued. Returns the plaintext
	key exactly once.
	"""
	integrator_id = (integrator_id or "").strip()
	otp = (otp or "").strip()
	if not integrator_id or not otp:
		_signup_reject("validation_failed", _("integrator_id and otp are both required."))
	if not re.fullmatch(r"\d{6}", otp):
		_signup_reject("validation_failed", _("OTP must be 6 digits."))

	if not frappe.db.exists("Integrator", integrator_id):
		_signup_reject("not_found", _("No signup in progress for that integrator id."), http_status=404)

	doc = frappe.get_doc("Integrator", integrator_id)

	if doc.status == "Active" and doc.email_verified:
		_signup_reject(
			"already_verified",
			_("This integrator has already been verified — sign in to your dashboard."),
			http_status=409,
		)
	if doc.status != "PendingEmail":
		_signup_reject(
			"invalid_state",
			_("This integrator is not awaiting verification (status={0}).").format(doc.status),
			http_status=409,
		)

	if not doc.otp_hash or not doc.otp_expires_at:
		_signup_reject("otp_not_issued", _("No OTP is on file — request a new one."), http_status=409)
	if now_datetime() > doc.otp_expires_at:
		_signup_reject(
			"otp_expired",
			_("That code has expired — request a new one via /v1/signup/resend-otp."),
			http_status=401,
		)

	submitted_hash = _hash_otp(otp, integrator_id)
	if not _constant_time_match(submitted_hash, doc.otp_hash):
		_signup_reject("otp_invalid", _("That code is not correct."), http_status=401)

	doc.status = "Active"
	doc.email_verified = 1
	doc.otp_hash = None
	doc.otp_expires_at = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	plaintext, key_doc = utils.issue_key(
		integrator=integrator_id,
		environment="sandbox",
		key_type="sk",
		scopes=None,
		description=f"First sandbox key — issued at signup-verify for {doc.contact_email}",
	)

	frappe.logger("api.signup").info(
		json.dumps(
			{
				"event": "api.signup.verified",
				"integrator": integrator_id,
				"email": doc.contact_email,
				"key": key_doc.name,
			}
		)
	)

	return {
		"integrator": {
			"code": integrator_id,
			"display_name": doc.display_name,
			"contact_email": doc.contact_email,
			"tier": "Registered",
			"pricing_tier": "Free",
			"email_verified": True,
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
			"token in the Authorization header on every API call."
		),
		"next_steps": [
			"Copy the plaintext into your secrets store now.",
			"Read /docs/quick-start for the five-step end-to-end walkthrough.",
			"For production access, see /docs/security §5 — Live key issuance.",
		],
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def resend_otp(integrator_id: str = "") -> dict:
	"""Step 1.5 — re-issue an OTP for a PendingEmail integrator.

	Rate-limited: at most one send per ``OTP_RESEND_MIN_SECONDS`` seconds,
	at most ``OTP_DAILY_MAX`` sends per UTC day across initial signup +
	resends. Each call resets the 15-minute TTL.
	"""
	integrator_id = (integrator_id or "").strip()
	if not integrator_id:
		_signup_reject("validation_failed", _("integrator_id is required."))
	if not frappe.db.exists("Integrator", integrator_id):
		_signup_reject("not_found", _("No signup in progress for that integrator id."), http_status=404)

	doc = frappe.get_doc("Integrator", integrator_id)

	if doc.status != "PendingEmail":
		_signup_reject(
			"invalid_state",
			_("This integrator is not awaiting verification (status={0}).").format(doc.status),
			http_status=409,
		)

	now = now_datetime()

	# Reset the daily counter at UTC midnight.
	if doc.last_otp_sent_at and doc.last_otp_sent_at.date() != now.date():
		doc.otp_attempts_today = 0

	if doc.last_otp_sent_at:
		elapsed = (now - doc.last_otp_sent_at).total_seconds()
		if elapsed < OTP_RESEND_MIN_SECONDS:
			retry_after = int(OTP_RESEND_MIN_SECONDS - elapsed)
			_signup_reject(
				"resend_too_soon",
				_("Try again in {0} seconds.").format(retry_after),
				http_status=429,
			)

	if (doc.otp_attempts_today or 0) >= OTP_DAILY_MAX:
		_signup_reject(
			"resend_daily_cap",
			_(
				"You have reached the maximum of {0} OTP sends for today. "
				"Please try again tomorrow or contact support."
			).format(OTP_DAILY_MAX),
			http_status=429,
		)

	otp = _generate_otp()
	expires_at = add_to_date(now, minutes=OTP_TTL_MINUTES, as_datetime=True)
	doc.otp_hash = _hash_otp(otp, integrator_id)
	doc.otp_expires_at = expires_at
	doc.otp_attempts_today = (doc.otp_attempts_today or 0) + 1
	doc.last_otp_sent_at = now
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	_deliver_otp(integrator_id, doc.contact_email, otp, expires_at)

	return {
		"integrator_id": integrator_id,
		"message": (f"New 6-digit code sent. It expires in {OTP_TTL_MINUTES} minutes."),
		"expires_at_iso": expires_at.isoformat() if hasattr(expires_at, "isoformat") else str(expires_at),
		"sends_remaining_today": max(0, OTP_DAILY_MAX - (doc.otp_attempts_today or 0)),
	}


@frappe.whitelist(allow_guest=True, methods=["GET"])
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
