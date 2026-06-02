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
Uganda Revenue Authority — EFRIS (e-Fiscal Receipting and Invoicing System).

Sandbox application: efris.ura.go.ug developer portal.
Production: legally required for VAT-registered taxpayers per the
Tax Procedures Code Act 2014 §§73A–73B.

Site config keys (under common_site_config.json):
    efris_sandbox = {
        "client_id": "...",
        "client_secret": "...",
        "tin": "...",
        "device_no": "...",
        "environment": "sandbox" | "production"
    }

While STUB=True, this adapter returns realistically-shaped responses
without touching URA infrastructure. Flip STUB=False once sandbox
creds are wired and the live request implementation is filled in.
"""

import secrets
from datetime import datetime, timedelta

import frappe

from sente_rails.adapters.base import FiscalAdapter


class EFRISAdapter(FiscalAdapter):
	STUB: bool = True

	def _settings(self) -> dict:
		return frappe.conf.get("efris_sandbox") or {}

	# -------- PRN reservation --------

	def generate_prn(self, assessment, line) -> dict:
		if self.STUB:
			prn = "5500" + secrets.token_hex(8).upper()[:14]
			return {
				"prn": prn,
				"expires_at": (datetime.now() + timedelta(days=3)).isoformat(),
				"amount": float(line.amount or 0),
				"currency": assessment.currency,
				"stub": True,
				"raw_response": {
					"responseCode": "00",
					"responseDesc": "PRN generated successfully (stub)",
					"data": {
						"prn": prn,
						"qrCode": f"https://efris.ura.go.ug/verify/{prn}",
					},
				},
			}
		raise NotImplementedError(
			"Live EFRIS PRN generation not yet wired. Apply for sandbox creds and "
			"populate site_config.efris_sandbox before flipping STUB to False."
		)

	# -------- Fiscalisation --------

	def fiscalise(self, assessment, payment_intent) -> dict:
		if self.STUB:
			fdn = "EFRIS" + datetime.now().strftime("%Y%m%d") + secrets.token_hex(4).upper()
			verification = secrets.token_hex(3).upper()
			return {
				"fdn": fdn,
				"verification_code": verification,
				"qr_payload": f"https://efris.ura.go.ug/verify/{fdn}/{verification}",
				"issued_at": datetime.now().isoformat(),
				"stub": True,
				"raw_response": {
					"responseCode": "00",
					"responseDesc": "Receipt fiscalised (stub)",
					"data": {"fdn": fdn, "verificationCode": verification},
				},
			}
		raise NotImplementedError

	# -------- Verification --------

	def verify_receipt(self, fdn: str) -> dict:
		if self.STUB:
			return {
				"valid": True,
				"fdn": fdn,
				"issued_at": (datetime.now() - timedelta(hours=1)).isoformat(),
				"taxpayer_tin": "1234567890",
				"stub": True,
				"raw_response": {"responseCode": "00", "valid": True},
			}
		raise NotImplementedError
