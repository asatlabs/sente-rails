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
Africa's Talking SMS gateway — commercial, multi-country.

Sandbox: https://api.sandbox.africastalking.com/version1/messaging
Production: https://api.africastalking.com/version1/messaging

Site-config block (site_config.json):
    africastalking_sms = {
        "username":  "<AT account username, 'sandbox' for sandbox creds>",
        "api_key":   "<32-char hex>",
        "sender_id": "SENTE",   # optional, falls back to AT default
        "base_url":  "https://api.sandbox.africastalking.com"
                     | "https://api.africastalking.com",
    }

Real-call when the site-config block is present; otherwise falls back
to deterministic stubs.
"""

import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Optional

import frappe

from sente_rails.adapters.base import SMSAdapter

_STUB_DELIVERIES: dict = {}


class AfricasTalkingAdapter(SMSAdapter):
	"""Africa's Talking SMS adapter. Real-call against AT's REST surface
	when site_config.africastalking_sms is populated; stub fallback
	otherwise.
	"""

	@property
	def STUB(self) -> bool:  # type: ignore[override]
		s = self._settings()
		return not (s.get("username") and s.get("api_key"))

	def _settings(self) -> dict:
		return frappe.conf.get("africastalking_sms") or {}

	def _base_url(self) -> str:
		return self._settings().get("base_url", "https://api.sandbox.africastalking.com")

	def send(self, msisdn: str, message: str, sender_id: str | None = None) -> dict:
		if not msisdn:
			frappe.throw("msisdn is required for SMS send.")
		if not message:
			frappe.throw("message is required for SMS send.")
		if self.STUB:
			return _stub_send(msisdn, message, sender_id, adapter="africastalking")

		s = self._settings()
		body = {
			"username": s["username"],
			"to": msisdn if msisdn.startswith("+") else f"+{msisdn}",
			"message": message,
		}
		if sender_id or s.get("sender_id"):
			body["from"] = sender_id or s.get("sender_id")
		url = self._base_url() + "/version1/messaging"
		req = urllib.request.Request(
			url,
			data=urllib.parse.urlencode(body).encode(),
			method="POST",
			headers={
				"apiKey": s["api_key"],
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept": "application/json",
			},
		)
		try:
			resp = urllib.request.urlopen(req, timeout=30)
			raw = resp.read().decode() or "{}"
			parsed = json.loads(raw)
		except urllib.error.HTTPError as e:
			frappe.throw(f"Africa's Talking send failed: HTTP {e.code} — {e.read().decode()}")
		except urllib.error.URLError as e:
			frappe.throw(f"Africa's Talking send unreachable: {e.reason}")

		recipients = (parsed.get("SMSMessageData", {}) or {}).get("Recipients", [])
		if not recipients:
			frappe.throw(f"Africa's Talking accepted-but-empty: {parsed}")
		r = recipients[0]
		return {
			"delivery_id": r.get("messageId", ""),
			"accepted_at": datetime.now(timezone.utc).isoformat(),
			"adapter": "africastalking",
			"cost": r.get("cost", ""),
			"status": r.get("status", ""),
			"raw_response": parsed,
			"stub": False,
		}

	def delivery_status(self, delivery_id: str) -> dict:
		"""Africa's Talking exposes Delivery Reports via webhook callbacks
		rather than a polling endpoint, so synchronous status lookup is
		only meaningful in stub mode. In live mode, the caller subscribes
		to AT's Delivery Notification URL and updates the Webhook Log
		row, then queries Webhook Log to learn the outcome.
		"""
		if self.STUB:
			row = _STUB_DELIVERIES.get(delivery_id)
			if not row:
				return {"status": "Unknown", "delivered_at": None, "stub": True}
			if not row.get("delivered_at"):
				row["delivered_at"] = datetime.now(timezone.utc).isoformat()
				row["status"] = "Delivered"
			return {
				"status": row["status"],
				"delivered_at": row["delivered_at"],
				"msisdn": row["msisdn"],
				"stub": True,
			}
		return {
			"status": "PollNotSupported",
			"delivered_at": None,
			"reason": "Africa's Talking delivery status is reported via webhook; query the Webhook Log row instead.",
			"stub": False,
		}


def _stub_send(msisdn: str, message: str, sender_id: str | None, *, adapter: str) -> dict:
	now = datetime.now(timezone.utc).isoformat()
	delivery_id = f"AT-STUB-{secrets.token_hex(8).upper()}"
	_STUB_DELIVERIES[delivery_id] = {
		"status": "Accepted",
		"accepted_at": now,
		"delivered_at": None,
		"msisdn": msisdn,
		"sender_id": sender_id or "SENTE",
		"adapter": adapter,
	}
	return {
		"delivery_id": delivery_id,
		"accepted_at": now,
		"adapter": adapter,
		"stub": True,
	}
