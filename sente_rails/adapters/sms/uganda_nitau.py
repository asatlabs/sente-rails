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
NITA-U SMS gateway — Uganda.

Government-mediated SMS gateway operated by the National Information
Technology Authority. Production access is MoU-gated; stub-only until
the MoU and per-MDA short-code allocation land.

Site-config block (used when STUB=False):
    nitau_sms_sandbox = {
        "base_url":   "https://sms.nita.go.ug/api/v1",
        "api_key":    "<MoU-issued key>",
        "sender_id":  "SENTE",
    }
"""

import secrets
from datetime import datetime, timezone
from typing import Optional

import frappe

from sente_rails.adapters.base import SMSAdapter

# In-process delivery store so delivery_status can return something
# meaningful in stub mode. Wiped on bench restart — acceptable for
# stub-only flow.
_STUB_DELIVERIES: dict = {}


class UgandaNitauAdapter(SMSAdapter):
	"""Stub NITA-U SMS adapter. Real-call path waits on the MoU."""

	STUB: bool = True

	def _settings(self) -> dict:
		return frappe.conf.get("nitau_sms_sandbox") or {}

	def send(self, msisdn: str, message: str, sender_id: str | None = None) -> dict:
		"""Plan signature. The ABC's send(to, body) is satisfied since
		the first two positional args match.
		"""
		if not msisdn:
			frappe.throw("msisdn is required for SMS send.")
		if not message:
			frappe.throw("message is required for SMS send.")
		# Stub-only for now; production hits NITA-U REST when STUB=False.
		now = datetime.now(timezone.utc).isoformat()
		delivery_id = f"NITAU-STUB-{secrets.token_hex(8).upper()}"
		_STUB_DELIVERIES[delivery_id] = {
			"status": "Accepted",
			"accepted_at": now,
			"delivered_at": None,
			"msisdn": msisdn,
			"sender_id": sender_id or self._settings().get("sender_id", "SENTE"),
			"adapter": "nitau",
		}
		return {
			"delivery_id": delivery_id,
			"accepted_at": now,
			"adapter": "nitau",
			"stub": True,
		}

	def delivery_status(self, delivery_id: str) -> dict:
		"""Lookup status of a previously-sent message. Stub returns
		Accepted -> Delivered after a fixed-delay simulation (we just
		report Delivered for any non-fresh stub id).
		"""
		row = _STUB_DELIVERIES.get(delivery_id)
		if not row:
			return {
				"status": "Unknown",
				"delivered_at": None,
				"reason": "delivery_id not in stub store",
				"stub": True,
			}
		# Stub semantics: stamp Delivered on first read so the rest of
		# the rail can be exercised without a polling loop.
		if not row.get("delivered_at"):
			row["delivered_at"] = datetime.now(timezone.utc).isoformat()
			row["status"] = "Delivered"
		return {
			"status": row["status"],
			"delivered_at": row["delivered_at"],
			"msisdn": row["msisdn"],
			"stub": True,
		}
