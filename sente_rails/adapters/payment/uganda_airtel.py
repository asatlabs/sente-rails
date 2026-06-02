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
Airtel Money — Uganda.

Sandbox application: developers.airtel.africa.

Site config keys:
    airtel_sandbox = {
        "client_id": "...",
        "client_secret": "...",
        "callback_url": "https://sente-rails.ug/v1/webhooks/airtel",
        "environment": "sandbox" | "production"
    }
"""

import secrets
from datetime import datetime
from typing import ClassVar

import frappe

from sente_rails.adapters.base import PaymentAdapter


class AirtelAdapter(PaymentAdapter):
	STUB: bool = True
	SUPPORTED_CHANNELS: ClassVar[set] = {"Airtel Money"}

	def _settings(self) -> dict:
		return frappe.conf.get("airtel_sandbox") or {}

	def initiate(self, payment_intent) -> dict:
		if self.STUB:
			ref = "AIR-SBX-" + secrets.token_hex(6).upper()
			frappe.cache.set_value(f"airtel:stub:{ref}", "Confirmed", expires_in_sec=3600)
			return {
				"aggregator_reference": ref,
				"status": "Sent",
				"msisdn": payment_intent.citizen_msisdn,
				"amount": float(payment_intent.amount or 0),
				"currency": payment_intent.currency,
				"stub": True,
				"raw_response": {
					"status": {"success": True, "code": "200", "message": "Push sent (stub)"},
					"data": {"transaction": {"id": ref, "status": "SENT"}},
				},
			}
		raise NotImplementedError

	def verify(self, payment_intent) -> dict:
		if self.STUB:
			ref = payment_intent.aggregator_reference
			status = frappe.cache.get_value(f"airtel:stub:{ref}") or "Confirmed"
			return {
				"status": status,
				"txn_id": f"{ref}-TXN" if status == "Confirmed" else None,
				"amount": float(payment_intent.amount or 0),
				"currency": payment_intent.currency,
				"settled_at": datetime.now().isoformat() if status == "Confirmed" else None,
				"stub": True,
				"raw_response": {"data": {"transaction": {"id": ref, "status": status.upper()}}},
			}
		raise NotImplementedError

	def refund(self, payment_event, amount: float, reason: str = "") -> dict:
		if self.STUB:
			refund_id = "AIR-REF-" + secrets.token_hex(6).upper()
			return {
				"refund_id": refund_id,
				"status": "Refunded",
				"amount": amount,
				"reason": reason,
				"stub": True,
			}
		raise NotImplementedError
