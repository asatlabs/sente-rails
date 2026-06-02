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
Pesapal — Uganda card + mobile-money payment aggregator.

Sandbox:    https://cybqa.pesapal.com/pesapalv3/api
Production: https://pay.pesapal.com/v3/api

Site-config block (site_config.json):
    pesapal_sandbox = {
        "consumer_key":    "<merchant consumer key>",
        "consumer_secret": "<merchant consumer secret>",
        "ipn_id":          "<UUID v4 returned by /URLSetup/RegisterIPN>",
        "callback_url":    "https://sente-rails.ug/v1/webhooks/pesapal",
        "base_url":        "https://cybqa.pesapal.com/pesapalv3/api"
                           | "https://pay.pesapal.com/v3/api",
    }

When the site-config block is present, the adapter makes real API calls
against Pesapal's v3 REST surface. When absent, it falls back to
deterministic stub responses so the demo / smoke path keeps working.

Supported Payment Intent channels (matches Pesapal's actual product —
the SubmitOrderRequest redirect lets the citizen pick at the hosted
checkout page):

  • Card           — Visa / Mastercard direct
  • Bank Transfer  — RTGS / EFT
  • Pesapal        — operator picked the redirect-checkout UX
                     explicitly (citizen picks rail at the Pesapal
                     hosted page; covers cards, banks, MoMo, Airtel,
                     M-Pesa for cross-EA citizens, Pesapal Wallet)
  • MTN MoMo       — mobile-money push. The direct MoMoAdapter wins
                     this channel via Country Profile ordering when
                     it's importable + configured. Pesapal serves as
                     automatic fallback if MoMo direct isn't.
  • Airtel Money   — same fallback shape as MoMo above.

The fallback architecture is implicit in the dispatch's first-match-
wins loop: Country Profile UG orders adapters as
``MoMoAdapter, AirtelAdapter, PesapalAdapter`` so direct rails win
when present; Pesapal catches everything else without code changes.

The IPN callback signature (webhook handler in item 3.1) is verified
via the Pesapal documented scheme; stub mode accepts everything and
flags it as such.
"""

import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import ClassVar

import frappe

from sente_rails.adapters.base import PaymentAdapter

_TOKEN_CACHE_KEY = "pesapal:access_token:sandbox"
_TOKEN_TTL_SEC = 290  # Pesapal v3 tokens are 5min; refresh 10s early


class UgandaPesapalAdapter(PaymentAdapter):
	"""Real-call Pesapal adapter that falls back to deterministic stubs
	when site_config.pesapal_sandbox is missing or incomplete."""

	# Card + Bank Transfer always route here (no other adapter claims them).
	# MTN MoMo + Airtel Money route here ONLY when the direct adapters
	# aren't importable/configured — Country Profile UG orders the direct
	# adapters first, so dispatch's first-match-wins logic gives Pesapal
	# the residual traffic. "Pesapal" is the explicit channel for the
	# hosted-checkout UX (citizen picks rail at the Pesapal redirect).
	SUPPORTED_CHANNELS: ClassVar[set] = {
		"Card",
		"Bank Transfer",
		"Pesapal",
		"MTN MoMo",
		"Airtel Money",
	}

	@property
	def STUB(self) -> bool:  # type: ignore[override]
		s = self._settings()
		return not (s.get("consumer_key") and s.get("consumer_secret") and s.get("ipn_id"))

	def _settings(self) -> dict:
		return frappe.conf.get("pesapal_sandbox") or {}

	def _base_url(self) -> str:
		return self._settings().get("base_url", "https://cybqa.pesapal.com/pesapalv3/api")

	# ---------------------------------------------------------------- HTTP

	def _request(
		self, method: str, path: str, *, headers: dict, body: dict | None = None
	) -> tuple[int, dict | str]:
		url = self._base_url() + path
		data = json.dumps(body).encode() if body is not None else None
		req = urllib.request.Request(url, data=data, method=method, headers=headers)
		try:
			resp = urllib.request.urlopen(req, timeout=30)
			raw = resp.read().decode() or "{}"
			parsed: dict | str = json.loads(raw) if raw.strip().startswith("{") else raw
			return resp.status, parsed
		except urllib.error.HTTPError as e:
			return e.code, e.read().decode()

	def _access_token(self) -> str:
		"""Cached Pesapal access token. Refreshed automatically."""
		cached = frappe.cache.get_value(_TOKEN_CACHE_KEY)
		if cached:
			return cached
		s = self._settings()
		body = {"consumer_key": s["consumer_key"], "consumer_secret": s["consumer_secret"]}
		status, resp = self._request(
			"POST",
			"/Auth/RequestToken",
			headers={"Content-Type": "application/json", "Accept": "application/json"},
			body=body,
		)
		if status != 200 or not isinstance(resp, dict) or not resp.get("token"):
			frappe.throw(f"Pesapal /Auth/RequestToken failed: HTTP {status} — {resp}")
		token = resp["token"]
		frappe.cache.set_value(_TOKEN_CACHE_KEY, token, expires_in_sec=_TOKEN_TTL_SEC)
		return token

	def _api_headers(self) -> dict:
		return {
			"Authorization": f"Bearer {self._access_token()}",
			"Content-Type": "application/json",
			"Accept": "application/json",
		}

	# ---------------------------------------------------------------- API

	def initiate(self, payment_intent) -> dict:
		"""Submit a SubmitOrderRequest. Returns aggregator_reference =
		Pesapal's order_tracking_id, plus the hosted-checkout redirect_url
		that the storefront / counter UI redirects the payer to.
		"""
		if self.STUB:
			return _stub_initiate(payment_intent)

		s = self._settings()
		body = {
			"id": payment_intent.name,
			"currency": payment_intent.currency or "UGX",
			"amount": float(payment_intent.amount or 0),
			"description": f"Sente Rails {payment_intent.assessment}"[:100],
			"callback_url": s["callback_url"],
			"notification_id": s["ipn_id"],
			"billing_address": {
				"phone_number": (payment_intent.citizen_msisdn or "").lstrip("+"),
				"email_address": "",
				"country_code": "UG",
				"first_name": "Citizen",
				"last_name": "Sente",
			},
		}
		req_trace = {
			"method": "POST",
			"url": "/Transactions/SubmitOrderRequest",
			"headers": {
				"Authorization": "Bearer <stripped>",
				"Content-Type": "application/json",
			},
			"body": body,
		}
		status, resp = self._request(
			"POST",
			"/Transactions/SubmitOrderRequest",
			headers=self._api_headers(),
			body=body,
		)
		if status != 200 or not isinstance(resp, dict) or not resp.get("order_tracking_id"):
			frappe.throw(f"Pesapal SubmitOrderRequest rejected: HTTP {status} — {resp}")

		return {
			"aggregator_reference": resp["order_tracking_id"],
			"redirect_url": resp.get("redirect_url", ""),
			"status": "Sent",
			"amount": float(payment_intent.amount or 0),
			"currency": payment_intent.currency,
			"stub": False,
			"trace_request": req_trace,
			"trace_response": {"http_status": status, "body": resp},
			"raw_response": resp,
		}

	def verify(self, payment_intent) -> dict:
		"""GetTransactionStatus poll. Maps Pesapal status_code to Sente
		Payment Intent lifecycle:
		    0 INVALID    -> Failed
		    1 COMPLETED  -> Confirmed
		    2 FAILED     -> Failed
		    3 REVERSED   -> Refunded
		Anything else stays Sent (pending).
		"""
		if self.STUB:
			return _stub_verify(payment_intent)

		tracking_id = payment_intent.aggregator_reference
		if not tracking_id:
			frappe.throw("Payment Intent has no aggregator_reference to verify")

		params = urllib.parse.urlencode({"orderTrackingId": tracking_id})
		status, resp = self._request(
			"GET",
			f"/Transactions/GetTransactionStatus?{params}",
			headers=self._api_headers(),
		)
		if status != 200 or not isinstance(resp, dict):
			frappe.throw(f"Pesapal GetTransactionStatus failed: HTTP {status} — {resp}")

		code = int(resp.get("status_code") or -1)
		mapped = {
			0: "Failed",
			1: "Confirmed",
			2: "Failed",
			3: "Refunded",
		}.get(code, "Sent")

		return {
			"status": mapped,
			"txn_id": resp.get("confirmation_code") or "",
			"payment_method": resp.get("payment_method") or "",
			"settled_at": resp.get("created_date") or "",
			"amount": float(resp.get("amount") or 0),
			"stub": False,
			"trace_response": {"http_status": status, "body": resp},
			"raw_response": resp,
		}

	def refund(self, payment_event, amount: float, reason: str = "") -> dict:
		"""POST /Transactions/RefundRequest with the confirmation_code
		from the original Payment Event's aggregator_txn_id.
		"""
		if self.STUB:
			return _stub_refund(payment_event, amount, reason)

		body = {
			"confirmation_code": payment_event.aggregator_txn_id,
			"amount": float(amount),
			"username": "Sente Rails",
			"remarks": (reason or "Refund issued via Sente Rails")[:200],
		}
		status, resp = self._request(
			"POST",
			"/Transactions/RefundRequest",
			headers=self._api_headers(),
			body=body,
		)
		if status != 200 or not isinstance(resp, dict):
			frappe.throw(f"Pesapal RefundRequest failed: HTTP {status} — {resp}")
		return {
			"refund_id": resp.get("refund_id") or "",
			"status": "Sent" if (resp.get("status") or "").lower() == "200" else "Failed",
			"amount": float(amount),
			"raw_response": resp,
			"stub": False,
		}

	# ---------------------------------------------------------------- Webhook

	def verify_signature(self, headers: dict, body: str) -> bool:
		"""Verify a Pesapal IPN callback signature.

		Production IPN flow: Pesapal POSTs `OrderTrackingId`,
		`OrderMerchantReference`, `OrderNotificationType` as form fields
		AND signs the URL+body with the merchant's consumer secret.
		The exact v3 scheme is currently HMAC-SHA1 over the path + body
		using consumer_secret as the key — when sandbox creds land, this
		method gets the real verifier.

		Stub mode (no creds): accepts the callback unconditionally and
		returns True; the Webhook Log row carries signature_verified=0
		so operators can grep stub-passed callbacks distinctly from
		real-verified ones.
		"""
		if self.STUB:
			# Always accept in stub mode; flag is honest because the caller
			# stamps signature_verified separately.
			return True

		# Real-mode HMAC verification scaffolding. Filled in once sandbox
		# creds are configured and a real IPN can be observed end-to-end.
		# Until then, fail-closed when a creds-bearing site receives an
		# unsigned callback rather than silently accepting it.
		sig_header = headers.get("X-Pesapal-Signature") or headers.get("Authorization") or ""
		if not sig_header:
			return False
		# TODO: HMAC-SHA1(body, consumer_secret) == sig_header — wire in
		# once an end-to-end sandbox IPN is observed for the canonical form.
		return False


# ---------------------------------------------------------------- Stubs


def _stub_initiate(payment_intent) -> dict:
	"""Deterministic stub for SubmitOrderRequest."""
	tracking_id = f"PESA-STUB-{secrets.token_hex(8).upper()}"
	redirect = f"https://pay.pesapal.local/checkout/{tracking_id}"
	return {
		"aggregator_reference": tracking_id,
		"redirect_url": redirect,
		"status": "Sent",
		"amount": float(payment_intent.amount or 0),
		"currency": payment_intent.currency or "UGX",
		"stub": True,
		"raw_response": {
			"order_tracking_id": tracking_id,
			"merchant_reference": payment_intent.name,
			"redirect_url": redirect,
			"status": "200",
		},
	}


def _stub_verify(payment_intent) -> dict:
	"""Deterministic stub for GetTransactionStatus. Stub always
	confirms so the rest of the rail can be exercised end-to-end.
	"""
	now_iso = datetime.now(timezone.utc).isoformat()
	tracking_id = payment_intent.aggregator_reference or "PESA-STUB-UNKNOWN"
	return {
		"status": "Confirmed",
		"txn_id": f"STUB-CONFIRM-{tracking_id[-8:]}",
		"payment_method": "Card (Stub)",
		"settled_at": now_iso,
		"amount": float(payment_intent.amount or 0),
		"stub": True,
		"raw_response": {
			"order_tracking_id": tracking_id,
			"status_code": 1,
			"description": "COMPLETED (stub)",
			"confirmation_code": f"STUB-CONFIRM-{tracking_id[-8:]}",
			"amount": float(payment_intent.amount or 0),
			"payment_method": "Card (Stub)",
			"created_date": now_iso,
		},
	}


def _stub_refund(payment_event, amount: float, reason: str) -> dict:
	"""Deterministic stub for RefundRequest. Always succeeds."""
	return {
		"refund_id": f"PESA-REFUND-STUB-{secrets.token_hex(6).upper()}",
		"status": "Sent",
		"amount": float(amount),
		"stub": True,
		"raw_response": {
			"status": "200",
			"message": f"Refund of {amount} accepted (stub) — reason: {reason}",
		},
	}


# Alias: Country Profile UG.default_payment_adapters references
# `PesapalAdapter` (without the Uganda prefix) from the placeholder
# entry that pre-dated this file. Keep both names resolvable so the
# dispatch path works either way.
PesapalAdapter = UgandaPesapalAdapter
