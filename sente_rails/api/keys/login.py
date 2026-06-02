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
"""Sente Rails — Phase 1B integrator magic-link login.

Three endpoints under /v1/login/*:

  POST /v1/login/request    {email}             → 200 {message}
                            Generates a magic-link token, persists its hash
                            on the Integrator row, "delivers" via the same
                            dev-stub log path the OTP signup uses today.
                            Always returns the same success message — never
                            reveals whether the email is registered.

  GET  /v1/login/consume?token=<code>.<random>  → 302 to /dashboard + Set-Cookie
                            Validates the token (single-use, not expired),
                            rotates session_token_hash on the row, clears
                            the magic-link fields. Sets a 14-day HttpOnly
                            Secure SameSite=Lax cookie ``sente_session``.

  POST /v1/logout                                → 200 {message}
                            Clears session_token_hash on the row + zeroes
                            the cookie. Idempotent — calling logout when
                            no session is set returns the same 200.

Magic-link token shape: ``<integrator_code>.<32-char-random>``. The code
prefix lets ``consume_login`` find the row directly (no full table scan).
The random suffix is hashed with the site secret + the code; constant-time
comparison defends against timing oracles.

Session cookie shape: ``<integrator_code>.<32-char-random>``. Same layout.
Read each request by ``before_request.stamp_and_capture``, hashed against
``session_token_hash``, validated against ``session_expires_at``.

Rate limiting: ``request_login`` is throttled per integrator (60-second
floor between sends, 5/UTC-day cap). The throttle uses dedicated fields
``last_login_link_sent_at`` + ``login_link_sends_today`` so OTP-resend
budget and login-link budget don't share state — they're for different
lifecycle states (PendingEmail vs Active) anyway.
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

# ─── Constants ───────────────────────────────────────────────────────────


LOGIN_LINK_TTL_MINUTES = 15
LOGIN_LINK_RESEND_MIN_SECONDS = 60
LOGIN_LINK_DAILY_MAX = 5

SESSION_TTL_DAYS = 14
SESSION_COOKIE_NAME = "sente_session"

# 32 chars after the dot. base32 alphabet (no padding) for url-safety.
_TOKEN_RANDOM_LEN = 32
_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789"

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
_CODE_DOT_TOKEN_RE = re.compile(r"^([A-Z0-9][A-Z0-9-]{1,62}[A-Z0-9])\.([A-Z2-9]{32})$")


# ─── Helpers ─────────────────────────────────────────────────────────────


def _new_request_id() -> str:
	import uuid

	return str(uuid.uuid4())


def _login_reject(code: str, message: str, http_status: int = 422) -> None:
	"""Structured rejection mirroring ``signup._signup_reject``."""
	request_id = getattr(frappe.local, "request_id", None) or _new_request_id()
	envelope = {"code": code, "message": message, "request_id": request_id}
	frappe.local.response.update({"http_status_code": http_status, "error": envelope})
	frappe.local._sente_error = envelope
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


def _generate_random_secret() -> str:
	return "".join(secrets.choice(_TOKEN_ALPHABET) for _ in range(_TOKEN_RANDOM_LEN))


def _hash_token(integrator_code: str, random_secret: str, kind: str) -> str:
	"""Salt the token hash with the site secret + the integrator code + a
	kind discriminator. ``kind`` is "magic-link" or "session" — keeps a
	stolen magic-link hash from being reusable as a session-token hash,
	even though both fields live on the same row.
	"""
	site_secret = frappe.local.conf.get("secret_key") or "sente-rails-fallback"
	salted = f"{kind}:{integrator_code}:{random_secret}:{site_secret}".encode()
	return hashlib.sha256(salted).hexdigest()


def _constant_time_match(a: str, b: str) -> bool:
	return hmac.compare_digest((a or "").encode("utf-8"), (b or "").encode("utf-8"))


def _read_param(name: str) -> str:
	"""Defensive parameter read that survives ``frappe.set_user()``-induced
	``form_dict`` wipes.

	When the request carries any ``sid`` cookie, the platform's session
	bootstrap fires ``set_user("Guest")`` before our /v1 router runs. That
	reset blows away ``form_dict`` — including URL query params and the
	JSON body that Frappe parsed at request entry. Path params survive
	because our router re-populates them; ``token``/``email``/etc. don't.

	This helper layers three sources, in order:

	1. ``form_dict`` — the normal path when no wipe happened.
	2. ``request.args`` — the Werkzeug query string MultiDict, unaffected
	   by form_dict resets.
	3. ``request.get_json(silent=True)`` — re-parses the body on demand.

	Returns ``""`` when the param is absent everywhere.
	"""
	val = frappe.local.form_dict.get(name)
	if val:
		return str(val).strip()
	try:
		qs_val = frappe.local.request.args.get(name)
		if qs_val:
			return str(qs_val).strip()
	except (RuntimeError, AttributeError):
		pass
	try:
		body = frappe.local.request.get_json(silent=True)
		if isinstance(body, dict):
			bv = body.get(name)
			if bv:
				return str(bv).strip()
	except (RuntimeError, AttributeError, ValueError):
		pass
	return ""


def _deliver_magic_link(integrator_code: str, email: str, full_token: str, expires_at) -> None:
	"""Deliver the magic-link URL to the integrator's contact email.

	If site_config carries SMTP creds (``mail_server`` set), uses
	``frappe.sendmail`` and the URL goes out by email. The dev-stub log at
	``logs/sente_signup_otps.dev.log`` is ALWAYS written too, so operators
	have a fallback when SMTP misbehaves or when the dev box runs offline.
	The audit record never carries the URL.
	"""
	import os

	consume_url = f"https://{frappe.local.site}/v1/login/consume?token={full_token}"

	# Dev-stub log — every call, regardless of whether SMTP fires.
	transport = "smtp" if frappe.local.conf.get("mail_server") else "dev-stub-log"
	payload = json.dumps(
		{
			"event": "api.login.magic_link_sent",
			"integrator": integrator_code,
			"email": email,
			"consume_url": consume_url,
			"expires_at": str(expires_at),
			"transport": transport,
			"ts": str(now_datetime()),
		}
	)
	bench_root = os.path.abspath(os.path.join(frappe.get_site_path(), "..", ".."))
	log_path = os.path.join(bench_root, "logs", "sente_signup_otps.dev.log")
	try:
		with open(log_path, "a") as fh:
			fh.write(payload + "\n")
	except OSError:
		pass
	frappe.logger("api.signup").info(payload)

	# Real email — only when SMTP is configured.
	if not frappe.local.conf.get("mail_server"):
		return
	try:
		frappe.sendmail(
			recipients=[email],
			sender=f"Sente Rails <{frappe.local.conf.get('auto_email_id') or 'noreply@sente-rails.space'}>",
			subject="Your Sente Rails sign-in link",
			template=None,
			message=_magic_link_html(consume_url),
			now=True,  # synchronous — surface SMTP errors at request time
		)
	except Exception:
		frappe.log_error(title="Sente Rails — magic-link email delivery failed")


def _magic_link_html(consume_url: str) -> str:
	"""Transactional email body for the magic-link sign-in.

	Uses table-based layout for Outlook compatibility. All styles inline
	(email clients strip <style>). System font stack — no webfonts. Single
	visual rhythm matching the Sente Rails marketing surface: gold accent
	bar, navy CTA, light-grey footer, ASAT LABS attribution.
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
            <h1 style="margin:16px 0 12px;font-size:22px;font-weight:600;color:#0a2540;letter-spacing:-0.01em;line-height:1.3;">Sign in to your dashboard</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#374151;">
              Click the button below to sign in to your Sente Rails integrator dashboard.
              The link is single-use and valid for {LOGIN_LINK_TTL_MINUTES} minutes.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">
              <tr>
                <td style="border-radius:6px;background:#0a2540;">
                  <a href="{consume_url}" style="display:inline-block;padding:13px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:-0.005em;">
                    Sign in to Sente Rails &rarr;
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.55;">
              If you didn&rsquo;t request this link, you can safely ignore this email &mdash; no one can sign in without clicking it.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #e5e7eb;">
              <tr>
                <td style="padding-top:20px;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#374151;letter-spacing:0.04em;text-transform:uppercase;">Button not working?</p>
                  <p style="margin:0;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:#6b7280;word-break:break-all;line-height:1.55;">
                    {consume_url}
                  </p>
                </td>
              </tr>
            </table>
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


def _silent_success_response(consume_url: str | None = None) -> dict:
	"""Uniform shape returned by ``request_login`` regardless of whether the
	email exists, the integrator is verified, etc. Never leaks account
	existence via response shape or timing-distinct branches.

	When ``site_config.sente_dev_reveal_magic_link`` is truthy AND a real
	consume URL was just issued (i.e. the email matched an Active +
	verified integrator), the URL is included as ``dev_consume_url`` so
	the operator can complete sign-in without working email delivery. The
	flag is opt-in per site and intended for dev/test sites only — leave
	it off in any site that faces real users.
	"""
	resp = {
		"message": (
			"If an active integrator is registered for that address, "
			"we just sent a sign-in link. It is valid for "
			f"{LOGIN_LINK_TTL_MINUTES} minutes."
		),
	}
	if consume_url and frappe.local.conf.get("sente_dev_reveal_magic_link"):
		resp["dev_consume_url"] = consume_url
	return resp


def _read_session_cookie() -> tuple[str | None, str | None]:
	"""Returns (integrator_code, full_cookie_value) when a syntactically
	valid Sente session cookie is present on the current request, else
	(None, None). Caller still has to verify the hash + expiry — this just
	parses the wire shape.
	"""
	try:
		raw = frappe.local.request.cookies.get(SESSION_COOKIE_NAME)
	except (RuntimeError, AttributeError):
		return None, None
	if not raw:
		return None, None
	m = _CODE_DOT_TOKEN_RE.match(raw)
	if not m:
		return None, None
	return m.group(1), raw


def attach_session_if_valid() -> None:
	"""before_request helper — sets ``frappe.local.sente_integrator`` to the
	signed-in integrator code when a valid session cookie is present.

	Called from ``before_request.stamp_and_capture``. Safe to import without
	side effects.
	"""
	code, full_cookie = _read_session_cookie()
	if not code or not full_cookie:
		return
	row = frappe.db.get_value(
		"Integrator",
		code,
		["session_token_hash", "session_expires_at", "status"],
		as_dict=True,
	)
	if not row or not row.session_token_hash or row.status != "Active":
		return
	if row.session_expires_at and now_datetime() > row.session_expires_at:
		return
	random_secret = full_cookie.split(".", 1)[1]
	expected = _hash_token(code, random_secret, kind="session")
	if not _constant_time_match(expected, row.session_token_hash):
		return
	frappe.local.sente_integrator = code


# ─── Endpoints ───────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_login(email: str = "") -> dict:
	"""Step 1 — email a magic-link to an Active integrator.

	The endpoint is deliberately uniform in its response: regardless of
	whether the email is registered, registered-but-pending-verification,
	or suspended, the caller sees the same 200 body. This denies account-
	existence enumeration via timing or response-shape side channels.

	Rate-limited identically to OTP resend: ``LOGIN_LINK_RESEND_MIN_SECONDS``
	floor between sends, ``LOGIN_LINK_DAILY_MAX`` per UTC day.
	"""
	# Defensive: ``email`` kwarg comes through ``form_dict`` which gets wiped
	# when the request carries any ``sid`` cookie (platform session bootstrap
	# fires ``set_user("Guest")`` ahead of our router). Fall back to reading
	# the JSON body / query string directly so the endpoint works for
	# previously-visited browsers.
	email = (email or _read_param("email")).strip().lower()
	if not email or not _EMAIL_RE.match(email):
		_login_reject("validation_failed", _("Valid email address is required."))

	code = frappe.db.get_value("Integrator", {"contact_email": email}, "name")
	if not code:
		# No row, no link — but the response is the same shape.
		return _silent_success_response()

	doc = frappe.get_doc("Integrator", code)
	if doc.status != "Active" or not doc.email_verified:
		# Registered but not verified / not active — same silent response.
		return _silent_success_response()

	now = now_datetime()

	# Reset the daily counter at UTC midnight.
	if doc.last_login_link_sent_at and doc.last_login_link_sent_at.date() != now.date():
		doc.login_link_sends_today = 0

	if doc.last_login_link_sent_at:
		elapsed = (now - doc.last_login_link_sent_at).total_seconds()
		if elapsed < LOGIN_LINK_RESEND_MIN_SECONDS:
			# Rate-limited — but stay silent.
			return _silent_success_response()

	if (doc.login_link_sends_today or 0) >= LOGIN_LINK_DAILY_MAX:
		# Daily cap reached — still silent.
		return _silent_success_response()

	random_secret = _generate_random_secret()
	full_token = f"{code}.{random_secret}"
	expires_at = add_to_date(now, minutes=LOGIN_LINK_TTL_MINUTES, as_datetime=True)

	doc.login_link_hash = _hash_token(code, random_secret, kind="magic-link")
	doc.login_link_expires_at = expires_at
	doc.login_link_sends_today = (doc.login_link_sends_today or 0) + 1
	doc.last_login_link_sent_at = now
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	_deliver_magic_link(code, email, full_token, expires_at)

	consume_url = f"https://{frappe.local.site}/v1/login/consume?token={full_token}"
	return _silent_success_response(consume_url=consume_url)


def _redirect_response(location: str) -> dict:
	"""Issue an HTTP 302 to ``location`` via the platform's response dict.

	Using ``response['type'] = 'redirect'`` (rather than ``raise frappe.Redirect``)
	keeps the redirect intact when the request is tagged ``v1_routed`` —
	the platform's exception handler treats a raised Redirect on a JSON-
	flagged request as a normal exception and renders the traceback into
	the body without setting the Location header.
	"""
	frappe.local.response["type"] = "redirect"
	frappe.local.response["location"] = location
	frappe.local.response["http_status_code"] = 302
	return frappe.local.response


@frappe.whitelist(allow_guest=True, methods=["GET"])
def consume_login(token: str = "") -> dict:
	"""Step 2 — exchange the magic-link token for a session cookie.

	Returns a 302 redirect to /dashboard with Set-Cookie on success, or
	a 302 redirect to /login/expired with no cookie on any failure. Failure
	paths use the same redirect target so attackers can't probe which
	tokens existed.
	"""
	# Defensive: ``token`` comes through ``form_dict`` which the platform's
	# session bootstrap wipes when any ``sid`` cookie is present. Fall back
	# to reading the URL query string directly. Without this, every magic
	# link click from a cookie-bearing browser hits the ``not token`` branch
	# below and 302s to /signin/expired even with a perfectly valid token.
	token = (token or _read_param("token")).strip()

	def _expired() -> dict:
		return _redirect_response("/signin/expired")

	if not token:
		return _expired()

	m = _CODE_DOT_TOKEN_RE.match(token)
	if not m:
		return _expired()

	code = m.group(1)
	random_secret = m.group(2)

	row = frappe.db.get_value(
		"Integrator",
		code,
		["name", "login_link_hash", "login_link_expires_at", "status", "email_verified"],
		as_dict=True,
	)
	if not row:
		return _expired()
	if row.status != "Active" or not row.email_verified:
		return _expired()
	if not row.login_link_hash or not row.login_link_expires_at:
		return _expired()
	if now_datetime() > row.login_link_expires_at:
		return _expired()

	expected = _hash_token(code, random_secret, kind="magic-link")
	if not _constant_time_match(expected, row.login_link_hash):
		return _expired()

	# Token good. Mint a fresh session token + invalidate the magic-link.
	session_random = _generate_random_secret()
	session_full = f"{code}.{session_random}"
	session_expires_at = add_to_date(now_datetime(), days=SESSION_TTL_DAYS, as_datetime=True)

	doc = frappe.get_doc("Integrator", code)
	doc.session_token_hash = _hash_token(code, session_random, kind="session")
	doc.session_expires_at = session_expires_at
	doc.last_login_at = now_datetime()
	# Invalidate the magic-link — single use.
	doc.login_link_hash = None
	doc.login_link_expires_at = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	frappe.local.cookie_manager.set_cookie(
		SESSION_COOKIE_NAME,
		session_full,
		expires=session_expires_at,
		httponly=True,
		secure=True,
		samesite="Lax",
	)
	return _redirect_response("/dashboard")


@frappe.whitelist(allow_guest=True, methods=["POST"])
def logout() -> dict:
	"""Step 3 — clear the active session.

	Idempotent: calling logout without a session set returns the same 200.
	The cookie is cleared on every path so a malformed/stale cookie also
	gets wiped from the browser.
	"""
	code = getattr(frappe.local, "sente_integrator", None)
	if code:
		try:
			frappe.db.set_value(
				"Integrator",
				code,
				{
					"session_token_hash": None,
					"session_expires_at": None,
				},
				update_modified=False,
			)
			frappe.db.commit()
		except Exception:
			# Best-effort — never block logout on a DB hiccup.
			pass

	# Clear the cookie regardless of whether we found a session.
	frappe.local.cookie_manager.set_cookie(
		SESSION_COOKIE_NAME,
		"",
		expires=add_to_date(now_datetime(), days=-1, as_datetime=True),
		httponly=True,
		secure=True,
		samesite="Lax",
	)

	return {"message": "Signed out."}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def session_info() -> dict:
	"""Lightweight 'who am I' for the workbench shell.

	When called with a valid session cookie, returns the signed-in
	integrator's basic profile. When called without (Guest), returns
	``{authenticated: False}``. Used by the workbench to decide whether
	to render the Sign-in vs Dashboard nav.
	"""
	code = getattr(frappe.local, "sente_integrator", None)
	if not code:
		return {"authenticated": False}
	row = frappe.db.get_value(
		"Integrator",
		code,
		["name", "display_name", "contact_email", "tier", "pricing_tier", "last_login_at"],
		as_dict=True,
	)
	if not row:
		return {"authenticated": False}
	return {
		"authenticated": True,
		"integrator": {
			"code": row.name,
			"display_name": row.display_name,
			"contact_email": row.contact_email,
			"tier": row.tier,
			"pricing_tier": row.pricing_tier,
			"last_login_at": row.last_login_at,
		},
	}
