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
Inbound webhook handlers — /v1/webhooks/{provider}.

Item 3.1 of docs/IMPLEMENTATION_PLAN.md. Four providers: momo,
airtel, efris, pesapal. All endpoints allow_guest=True since they
receive POSTs from aggregator infrastructure that has no Sente API
key. Authentication is via per-provider signature verification —
NOT a Sente bearer.

Per-handler flow (identical across providers):
  1. Read raw body + headers.
  2. log_inbound() FIRST — captures the request verbatim before any
     signature check, so tamper attempts (bad sig / malformed body /
     replay) are still timestamped in Webhook Log.
  3. Verify signature via the provider adapter:
     - adapter.verify_signature(headers, body) when the method exists
     - else: trust the call iff adapter.STUB is True (stub fallback
       so smoke + sandbox work without per-provider signature wiring)
  4. Match the payload to an existing Payment Intent by aggregator
     reference. Unknown ref -> mark Ignored and return 200 (provider
     keeps trying to deliver until ack, so 4xx would just cause a
     retry storm).
  5. Insert a Payment Event row tied to the matched Payment Intent
     with proof_payload = the verbatim body+headers+verification result.
  6. Update Payment Intent.status -> Confirmed (success) or Failed.
  7. publish_realtime("payment_event_received", {intent, event}) so
     the Clerk UI flips the row live.
  8. mark_processed() the Webhook Log with link to Payment Event +
     processing_duration_ms.
  9. Return provider's expected ack JSON.

Failure handling: every exception inside the handler is logged
(frappe.log_error) and the Webhook Log row is marked Failed, but
the HTTP response stays a 200 with {status:'REJECTED'} so the
provider doesn't retry-storm us on a bug. Operators triage via the
Webhook Log table.
"""

import json
from typing import Any, Optional

import frappe

from sente_rails.adapters.dispatch import _country_profile
from sente_rails.sente_rails.doctype.webhook_log.webhook_log import (
	log_inbound,
	mark_processed,
)

# Provider key -> adapter dotted path. The handler instantiates the
# adapter with the UG country profile when needed.
_ADAPTER_PATHS = {
	"momo": "sente_rails.adapters.payment.uganda_momo.MoMoAdapter",
	"airtel": "sente_rails.adapters.payment.uganda_airtel.AirtelAdapter",
	"pesapal": "sente_rails.adapters.payment.uganda_pesapal.UgandaPesapalAdapter",
	"efris": "sente_rails.adapters.fiscal.uganda_efris.EFRISAdapter",
}


# Provider-specific reference fields we try (in order) to match a
# callback payload to an existing Payment Intent. The first non-empty
# value that resolves to a real Payment Intent wins.
_REF_FIELDS_BY_PROVIDER = {
	"momo": ("externalId", "external_ref", "referenceId", "reference_id", "merchant_reference"),
	"airtel": ("transaction_id", "external_id", "external_ref", "merchant_reference"),
	"pesapal": ("OrderMerchantReference", "merchant_reference", "order_tracking_id"),
	"efris": ("payment_intent", "external_ref"),
}


# Public entry points — one per provider. Each is @frappe.whitelist(allow_guest=True)
# so the framework dispatches POST /v1/webhooks/{provider} after the router rewrites.


@frappe.whitelist(allow_guest=True)
def momo_callback():
	return _handle("momo")


@frappe.whitelist(allow_guest=True)
def airtel_callback():
	return _handle("airtel")


@frappe.whitelist(allow_guest=True)
def pesapal_callback():
	return _handle("pesapal")


@frappe.whitelist(allow_guest=True)
def efris_callback():
	return _handle("efris")


# ------------------------------------------------------------ pipeline


def _handle(provider: str) -> dict:
	"""Run the 9-step pipeline for a given provider. Returns the provider's
	expected ack as a Python dict; the response_shape middleware wraps
	it into {data: ...} for /v1 callers, but providers parsing the body
	get the dict shape they expect."""
	headers = _request_headers()
	body_str = _request_body_str()
	source_ip = headers.get("X-Forwarded-For") or headers.get("X-Real-Ip") or ""
	content_type = headers.get("Content-Type") or ""

	# Step 2: log first (always, regardless of signature outcome)
	signature_header = _signature_header_for(provider, headers)
	log_name = log_inbound(
		provider=provider,
		headers=headers,
		body=body_str,
		source_ip=source_ip,
		content_type=content_type,
		signature_header=signature_header,
		signature_algorithm=_signature_algorithm_for(provider),
	)

	# Step 3: signature verification
	adapter = _instantiate_adapter(provider)
	signature_ok = _verify_signature(adapter, headers, body_str)
	if not signature_ok:
		mark_processed(
			log_name,
			signature_verified=False,
			processing_status="Failed",
			error_message="Signature verification failed",
		)
		return _rejection_ack(provider, reason="signature_invalid")

	# Step 4: parse body + match payment intent
	body_dict = _parse_body(body_str)
	pi_name = _match_payment_intent(provider, body_dict)
	if not pi_name:
		mark_processed(
			log_name,
			signature_verified=True,
			processing_status="Ignored",
			error_message="No matching Payment Intent for callback ref",
		)
		# Return success-ish so the provider doesn't retry-storm us;
		# operators triage via Webhook Log.
		return {"status": "IGNORED", "reason": "unknown_reference"}

	# Step 5 + 6 + 7: create Payment Event + flip Payment Intent + realtime
	try:
		pe_name, new_status = _ingest_callback(provider, pi_name, body_dict, body_str, headers, signature_ok)
	except Exception as e:
		frappe.log_error(
			title=f"Webhook ingest failed: {provider}",
			message=frappe.get_traceback(),
		)
		mark_processed(
			log_name,
			signature_verified=signature_ok,
			processing_status="Failed",
			payment_intent=pi_name,
			error_message=f"Ingest exception: {type(e).__name__}: {e}",
		)
		return _rejection_ack(provider, reason="internal_error")

	# Step 8: finalise Webhook Log
	mark_processed(
		log_name,
		signature_verified=signature_ok,
		payment_intent=pi_name,
		payment_event=pe_name,
		processing_status="Processed",
	)

	# Step 9: provider-specific ack
	return _accept_ack(provider, pi_name, pe_name, new_status)


# ------------------------------------------------------------ helpers


def _instantiate_adapter(provider: str):
	path = _ADAPTER_PATHS.get(provider)
	if not path:
		frappe.throw(f"Unknown webhook provider: {provider}")
	cls = frappe.get_attr(path)
	# Payment adapters take (country_profile, mda=None); fiscal takes
	# (country_profile,). We always pass UG; mda left blank for callbacks.
	cp = _country_profile("UG")
	try:
		return cls(cp)
	except TypeError:
		# Some adapters (SMS) take no args; this isn't expected for
		# webhook providers but keeps the helper robust.
		return cls()


def _verify_signature(adapter, headers: dict, body: str) -> bool:
	"""Call adapter.verify_signature if defined; otherwise default to
	adapter.STUB (stub adapters accept any callback for smoke + sandbox;
	live adapters reject unsigned callbacks)."""
	verify = getattr(adapter, "verify_signature", None)
	if callable(verify):
		try:
			return bool(verify(headers, body))
		except Exception:
			return False
	# No signature verifier shipped yet for this provider — trust iff stub
	stub_val = getattr(adapter, "STUB", True)
	if isinstance(stub_val, bool):
		return stub_val
	# STUB might be a property on a class with __init__(country_profile)
	try:
		return bool(stub_val.fget(adapter))
	except Exception:
		return True  # last-resort permissive in dev


def _parse_body(body: str) -> dict:
	"""Best-effort JSON parse. Form-encoded callbacks (Pesapal IPN) fall
	through to urllib.parse.parse_qs."""
	if not body:
		return {}
	try:
		return json.loads(body)
	except (json.JSONDecodeError, TypeError):
		from urllib.parse import parse_qs

		pairs = parse_qs(body, keep_blank_values=True)
		return {k: (v[0] if isinstance(v, list) and v else "") for k, v in pairs.items()}


def _match_payment_intent(provider: str, body: dict) -> str | None:
	"""Walk the provider's known ref field names; first one that lands
	on a real Payment Intent (either by name or by aggregator_reference)
	wins."""
	candidates = []
	for field in _REF_FIELDS_BY_PROVIDER.get(provider, ()):
		val = body.get(field)
		if val:
			candidates.append(str(val))
	for cand in candidates:
		if frappe.db.exists("Payment Intent", cand):
			return cand
		hit = frappe.db.get_value("Payment Intent", {"aggregator_reference": cand}, "name")
		if hit:
			return hit
	return None


def _ingest_callback(
	provider: str,
	pi_name: str,
	body: dict,
	body_str: str,
	headers: dict,
	signature_ok: bool,
):
	"""Build the Payment Event + flip Payment Intent + publish realtime.

	Returns (payment_event_name, new_payment_intent_status).
	"""
	pi = frappe.get_doc("Payment Intent", pi_name)
	provider_status = _provider_status(provider, body)
	# Map to Sente lifecycle
	# Each provider has its own success vocabulary:
	#   MoMo     -> SUCCESSFUL
	#   Airtel   -> SUCCESS / TS (transaction successful)
	#   Pesapal  -> COMPLETED
	#   EFRIS    -> PAID
	new_pi_status = (
		"Confirmed" if provider_status in ("SUCCESSFUL", "SUCCESS", "COMPLETED", "PAID", "TS") else "Failed"
	)

	amount = float(body.get("amount") or pi.amount or 0)
	mda_for_pe = pi.split_rules[0].mda if pi.split_rules else None
	if not mda_for_pe:
		# Fall back to Assessment.mda_default
		mda_for_pe = (
			frappe.db.get_value("Assessment", pi.assessment, "mda_default") if pi.assessment else None
		)
	if not mda_for_pe:
		frappe.throw(f"Cannot determine MDA for Payment Event from PI {pi_name}.")

	# Only create a Payment Event for successful confirmations
	pe_name = None
	if new_pi_status == "Confirmed":
		pe = frappe.get_doc(
			{
				"doctype": "Payment Event",
				"payment_intent": pi_name,
				"mda": mda_for_pe,
				"amount": amount,
				"currency": pi.currency or "UGX",
				"aggregator": provider,
				"aggregator_txn_id": str(
					body.get("financial_transaction_id")
					or body.get("transaction_id")
					or body.get("confirmation_code")
					or body.get("referenceId")
					or "UNKNOWN"
				),
				"received_at": frappe.utils.now_datetime(),
				"proof_payload": json.dumps(
					{
						"body": body,
						"headers": headers,
						"signature_verified": signature_ok,
						"provider_status": provider_status,
					},
					indent=2,
					default=str,
				),
			}
		)
		pe.insert(ignore_permissions=True)
		pe_name = pe.name

	# Flip Payment Intent
	frappe.db.set_value(
		"Payment Intent",
		pi_name,
		{
			"status": new_pi_status,
			"confirmed_at": frappe.utils.now_datetime() if new_pi_status == "Confirmed" else None,
			"failed_at": frappe.utils.now_datetime() if new_pi_status == "Failed" else None,
			"failure_reason": ""
			if new_pi_status == "Confirmed"
			else f"{provider} reported {provider_status}",
		},
		update_modified=True,
	)
	frappe.db.commit()

	# Realtime — Clerk UI flips the row live
	try:
		frappe.publish_realtime(
			event="payment_event_received",
			message={
				"payment_intent": pi_name,
				"payment_event": pe_name,
				"status": new_pi_status,
				"provider": provider,
			},
			doctype="Payment Intent",
			docname=pi_name,
			after_commit=True,
		)
	except Exception:
		# Realtime is best-effort — don't fail the webhook if Redis hiccups.
		pass

	return pe_name, new_pi_status


# ------------------------------------------------------------ request helpers


def _request_headers() -> dict:
	"""Pull headers from the current request as a flat dict. Returns
	an empty dict in non-HTTP contexts (e.g. console smoke calling
	the handler directly)."""
	req = getattr(frappe.local, "request", None)
	if not req:
		return {}
	try:
		return dict(req.headers)
	except Exception:
		return {}


def _request_body_str() -> str:
	"""Raw request body as a string. Falls back to JSON-encoded
	form_dict when there's no live request (smoke context)."""
	req = getattr(frappe.local, "request", None)
	if req:
		try:
			data = req.get_data(as_text=True)
			if data:
				return data
		except Exception:
			pass
	# Smoke / direct-call path: synthesise from form_dict so the
	# pipeline still sees something to log.
	fd = dict(frappe.local.form_dict or {})
	# Strip the framework's bookkeeping keys
	for k in ("cmd", "csrf_token"):
		fd.pop(k, None)
	return json.dumps(fd, default=str) if fd else ""


def _signature_header_for(provider: str, headers: dict) -> str:
	if provider == "momo":
		return headers.get("X-MoMo-Signature") or headers.get("Authorization") or ""
	if provider == "airtel":
		return headers.get("X-Airtel-Signature") or ""
	if provider == "pesapal":
		return headers.get("X-Pesapal-Signature") or ""
	if provider == "efris":
		return headers.get("X-Efris-Signature") or ""
	return ""


def _signature_algorithm_for(provider: str) -> str:
	# These are the documented schemes; switch as adapters land real verifiers.
	return {
		"momo": "hmac-sha256",
		"airtel": "hmac-sha256",
		"pesapal": "hmac-sha1",
		"efris": "rsa-sha256",
	}.get(provider, "")


def _provider_status(provider: str, body: dict) -> str:
	"""Extract the canonical status string from each provider's payload."""
	if provider == "momo":
		return (body.get("status") or "").upper()
	if provider == "airtel":
		return (body.get("status_message") or body.get("status") or "").upper()
	if provider == "pesapal":
		# Pesapal IPN sends OrderNotificationType + we re-query for status
		# in the live flow; for stub-mode callbacks the body carries it directly.
		return (body.get("payment_status_description") or body.get("status") or "COMPLETED").upper()
	if provider == "efris":
		return (body.get("status") or "").upper()
	return ""


def _accept_ack(provider: str, pi_name: str, pe_name: str | None, new_status: str) -> dict:
	"""Provider-shaped acceptance ack."""
	if provider == "momo":
		return {"status": "ACCEPTED", "referenceId": pi_name}
	if provider == "airtel":
		return {"status": "ACCEPTED", "transaction_id": pi_name}
	if provider == "pesapal":
		return {"status": "200", "message": "OK", "OrderMerchantReference": pi_name}
	if provider == "efris":
		return {"status": "ACCEPTED", "payment_intent": pi_name}
	return {"status": "ACCEPTED"}


def _rejection_ack(provider: str, reason: str) -> dict:
	if provider == "momo":
		return {"status": "REJECTED", "reason": reason}
	if provider == "airtel":
		return {"status": "REJECTED", "reason": reason}
	if provider == "pesapal":
		return {"status": "500", "message": reason}
	if provider == "efris":
		return {"status": "REJECTED", "reason": reason}
	return {"status": "REJECTED", "reason": reason}
