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
MTN Mobile Money — Uganda.

Sandbox: https://sandbox.momodeveloper.mtn.com (provisioned via the
Collections product subscription on momodeveloper.mtn.com).

Site-config block (site_config.json):
    momo_sandbox = {
        "subscription_key_primary":   "<32-char hex>",
        "subscription_key_secondary": "<32-char hex>",   # backup
        "api_user_id":                "<UUID v4>",
        "api_key":                    "<32-char hex>",
        "callback_host":              "sente-rails.ug",
        "target_environment":         "sandbox"  | "mtnuganda",
        "base_url":                   "https://sandbox.momodeveloper.mtn.com"
                                      | "https://proxy.momoapi.mtn.com",
        "mode":                       "stub" | "live",   # optional
    }

When the site-config block is present (and mode != "stub"), the adapter makes
real API calls. When absent — or when mode="stub" — it uses deterministic stub
responses that faithfully replay the documented sandbox MSISDNs, so the demo /
smoke-test path works reliably without depending on MTN's (flaky) sandbox.

Sandbox test MSISDNs (from MTN documentation):
    46733123450 — auto-approve
    46733123451 — pending then approve
    46733123452 — pending then reject
    46733123453 — timeout
"""

import base64
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta
from typing import ClassVar

import frappe

from sente_rails.adapters.base import PaymentAdapter

_ACCESS_TOKEN_CACHE_KEY = "momo:access_token:sandbox"
_ACCESS_TOKEN_TTL_SEC = 3500  # tokens expire in 3600s; refresh 100s early


class MoMoAdapter(PaymentAdapter):
	"""Real-call MoMo adapter that falls back to deterministic stubs when
	site_config.momo_sandbox is missing or incomplete."""

	SUPPORTED_CHANNELS: ClassVar[set] = {"MTN MoMo"}

	@property
	def STUB(self) -> bool:  # type: ignore[override]
		s = self._settings()
		# Force the deterministic stub even when real creds are on file. The MTN
		# sandbox is flaky (it returns INTERNAL_PROCESSING_ERROR for valid test
		# numbers), so demos run on the faithful stub. Set mode="live" to use the
		# real sandbox.
		if str(s.get("mode", "")).lower() == "stub":
			return True
		return not (s.get("subscription_key_primary") and s.get("api_user_id") and s.get("api_key"))

	def _settings(self) -> dict:
		return frappe.conf.get("momo_sandbox") or {}

	# ---------------------------------------------------------------- HTTP

	def _request(
		self, method: str, path: str, *, headers: dict, body: dict | None = None
	) -> tuple[int, dict | str]:
		s = self._settings()
		url = s.get("base_url", "https://sandbox.momodeveloper.mtn.com") + path
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
		"""Cached MoMo access token. Refreshed automatically."""
		cached = frappe.cache.get_value(_ACCESS_TOKEN_CACHE_KEY)
		if cached:
			return cached

		s = self._settings()
		auth = base64.b64encode(f"{s['api_user_id']}:{s['api_key']}".encode()).decode()
		status, body = self._request(
			"POST",
			"/collection/token/",
			headers={
				"Authorization": f"Basic {auth}",
				"Ocp-Apim-Subscription-Key": s["subscription_key_primary"],
			},
		)
		if status != 200 or not isinstance(body, dict):
			frappe.throw(f"MoMo /collection/token/ failed: {status} {body}")
		token = body["access_token"]
		frappe.cache.set_value(_ACCESS_TOKEN_CACHE_KEY, token, expires_in_sec=_ACCESS_TOKEN_TTL_SEC)
		return token

	def _api_headers(self, ref_id: str) -> dict:
		s = self._settings()
		return {
			"Authorization": f"Bearer {self._access_token()}",
			"X-Reference-Id": ref_id,
			"X-Target-Environment": s.get("target_environment", "sandbox"),
			"Ocp-Apim-Subscription-Key": s["subscription_key_primary"],
			"Content-Type": "application/json",
		}

	# ---------------------------------------------------------------- API

	def initiate(self, payment_intent) -> dict:
		if self.STUB:
			return _stub_initiate(payment_intent)

		ref_id = str(uuid.uuid4())
		msisdn = (payment_intent.citizen_msisdn or "").lstrip("+")
		body = {
			"amount": str(int(float(payment_intent.amount or 0))),
			"currency": "EUR"
			if self._settings().get("target_environment") == "sandbox"
			else (payment_intent.currency or "UGX"),
			# Sandbox only accepts EUR. Live UG production uses UGX.
			"externalId": payment_intent.name,
			"payer": {"partyIdType": "MSISDN", "partyId": msisdn},
			# Keep ASCII only — MTN's sandbox validator rejects requests with
			# JSON \uXXXX escape sequences (e.g. em-dash).
			"payerMessage": f"Sente Rails {payment_intent.assessment}"[:160],
			"payeeNote": payment_intent.name,
		}
		# Trace-friendly request snapshot — captured BEFORE the call so we
		# have something even if the call fails. AUDIT-OK: Bearer token
		# stripped; subscription key truncated.
		req_trace = {
			"method": "POST",
			"url": "/collection/v1_0/requesttopay",
			"headers": {
				"X-Reference-Id": ref_id,
				"X-Target-Environment": self._settings().get("target_environment", "sandbox"),
				"Content-Type": "application/json",
				"Authorization": "Bearer <stripped>",
				"Ocp-Apim-Subscription-Key": f"{self._settings().get('subscription_key_primary', '')[:8]}…",
			},
			"body": body,
		}
		status, resp = self._request(
			"POST",
			"/collection/v1_0/requesttopay",
			headers=self._api_headers(ref_id),
			body=body,
		)
		if status != 202:
			frappe.throw(f"MoMo requesttopay rejected: HTTP {status} — {resp}")

		return {
			"aggregator_reference": ref_id,
			"status": "Sent",
			"msisdn": msisdn,
			"amount": float(payment_intent.amount or 0),
			"currency": payment_intent.currency,
			"stub": False,
			# Trace bundle — req + resp + http status. payments.py persists
			# this to PaymentIntent.initiate_request_payload / _response_payload.
			"trace_request": req_trace,
			"trace_response": {
				"http_status": status,
				# MTN returns 202 Accepted with an empty body for requesttopay;
				# the reference ID we sent in X-Reference-Id is the handle.
				"body": resp if resp else "",
				"reference_id": ref_id,
			},
			"raw_response": {"referenceId": ref_id, "http_status": status},
		}

	def verify(self, payment_intent) -> dict:
		if self.STUB:
			return _stub_verify(payment_intent)

		ref_id = payment_intent.aggregator_reference
		if not ref_id:
			frappe.throw("Payment Intent has no aggregator_reference to verify")

		req_trace = {
			"method": "GET",
			"url": f"/collection/v1_0/requesttopay/{ref_id}",
			"headers": {
				"X-Target-Environment": self._settings().get("target_environment", "sandbox"),
				"Authorization": "Bearer <stripped>",
				"Ocp-Apim-Subscription-Key": f"{self._settings().get('subscription_key_primary', '')[:8]}…",
			},
		}
		status, resp = self._request(
			"GET",
			f"/collection/v1_0/requesttopay/{ref_id}",
			headers=self._api_headers(ref_id),
		)
		if status != 200 or not isinstance(resp, dict):
			frappe.throw(f"MoMo requesttopay status query failed: HTTP {status} — {resp}")

		# Map MoMo lifecycle to our Payment Intent lifecycle.
		momo_status = (resp.get("status") or "").upper()
		mapped = {
			"PENDING": "Sent",
			"SUCCESSFUL": "Confirmed",
			"FAILED": "Failed",
		}.get(momo_status, "Sent")

		return {
			"status": mapped,
			"txn_id": resp.get("financialTransactionId") or ref_id,
			"amount": float(resp.get("amount") or payment_intent.amount or 0),
			"currency": resp.get("currency") or payment_intent.currency,
			"settled_at": datetime.now().isoformat() if mapped == "Confirmed" else None,
			"stub": False,
			"trace_request": req_trace,
			"trace_response": {"http_status": status, "body": resp},
			"raw_response": resp,
		}

	def refund(self, payment_event, amount: float, reason: str = "") -> dict:
		if self.STUB:
			return _stub_refund(amount, reason)
		# Live refunds require Disbursements product + KYB — out of scope for v0.
		raise NotImplementedError(
			"Live MoMo refunds require Disbursements product credentials. " "v0 supports stub refunds only."
		)


# ---------------------------------------------------------------- stubs


# MTN sandbox test MSISDNs → outcome. Unknown numbers auto-approve so the demo
# stays forgiving. Mirrors the documented sandbox behaviour the UI advertises.
_SANDBOX_SCENARIOS = {
	"46733123450": "approve",   # auto-approve
	"46733123451": "delayed",   # pending, then approve
	"46733123452": "reject",    # pending, then reject
	"46733123453": "timeout",   # stays pending forever
}


def _scenario_for(msisdn: str | None) -> str:
	return _SANDBOX_SCENARIOS.get((msisdn or "").lstrip("+").strip(), "approve")


def _stub_initiate(payment_intent) -> dict:
	ref = "MM-SBX-" + secrets.token_hex(6).upper()
	# Stash the scenario + push time so the status poll plays it out over a few
	# seconds — like a real STK push the citizen approves on their phone.
	frappe.cache.set_value(
		f"momo:stub:{ref}",
		json.dumps({"s": _scenario_for(payment_intent.citizen_msisdn), "t": datetime.now().timestamp()}),
		expires_in_sec=3600,
	)
	body = {
		"amount": str(int(float(payment_intent.amount or 0))),
		"currency": "EUR",
		"externalId": payment_intent.name,
		"payer": {"partyIdType": "MSISDN", "partyId": (payment_intent.citizen_msisdn or "").lstrip("+")},
		"payerMessage": f"Sente Rails {payment_intent.assessment}",
		"payeeNote": payment_intent.name,
	}
	return {
		"aggregator_reference": ref,
		"status": "Sent",
		"msisdn": payment_intent.citizen_msisdn,
		"amount": float(payment_intent.amount or 0),
		"currency": payment_intent.currency,
		"stub": True,
		"trace_request": {"method": "POST", "url": "/collection/v1_0/requesttopay [STUB]", "body": body},
		"trace_response": {"http_status": 202, "body": "", "reference_id": ref, "stub": True},
		"raw_response": {"referenceId": ref, "status": "PENDING"},
	}


def _stub_verify(payment_intent) -> dict:
	ref = payment_intent.aggregator_reference
	raw = frappe.cache.get_value(f"momo:stub:{ref}")
	scenario, started = "approve", 0.0
	if raw:
		try:
			data = json.loads(raw)
			scenario = data.get("s", "approve")
			started = float(data.get("t", 0) or 0)
		except (ValueError, TypeError):
			scenario = "approve"  # legacy cache (bare status string)
	elapsed = (datetime.now().timestamp() - started) if started else 999.0

	if scenario == "reject":
		status = "Failed" if elapsed >= 5 else "Sent"
	elif scenario == "timeout":
		status = "Sent"  # never confirms — the counter times out the wait
	elif scenario == "delayed":
		status = "Confirmed" if elapsed >= 8 else "Sent"
	else:  # approve
		status = "Confirmed"

	momo_status = {"Confirmed": "SUCCESSFUL", "Failed": "FAILED", "Sent": "PENDING"}[status]
	txn = f"{ref}-TXN" if status == "Confirmed" else None
	stub_resp = {"referenceId": ref, "status": momo_status, "financialTransactionId": txn}
	return {
		"status": status,
		"txn_id": txn,
		"amount": float(payment_intent.amount or 0),
		"currency": payment_intent.currency,
		"settled_at": datetime.now().isoformat() if status == "Confirmed" else None,
		"stub": True,
		"trace_request": {"method": "GET", "url": f"/collection/v1_0/requesttopay/{ref} [STUB]"},
		"trace_response": {"http_status": 200, "body": stub_resp, "stub": True},
		"raw_response": stub_resp,
	}


def _stub_refund(amount: float, reason: str) -> dict:
	rid = "MM-REF-" + secrets.token_hex(6).upper()
	return {
		"refund_id": rid,
		"status": "Refunded",
		"amount": amount,
		"reason": reason,
		"stub": True,
		"raw_response": {"referenceId": rid, "status": "SUCCESSFUL"},
	}
