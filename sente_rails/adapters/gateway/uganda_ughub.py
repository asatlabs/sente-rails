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
UGHub — NITA-U Government Service Bus (Uganda).

Real access: requires institutional MoU with NITA-U. Brokers calls to
NIRA, URA, NSSF, URSB, Lands LIS, and other MDAs.

Until UGHub credentials are issued, this adapter logs the call shape
and returns service-specific stub responses so downstream code paths
can be exercised end-to-end.
"""

from typing import Optional

import frappe

from sente_rails.adapters.base import GatewayAdapter


class UGHubAdapter(GatewayAdapter):
	STUB: bool = True

	def _settings(self) -> dict:
		return frappe.conf.get("ughub") or {}

	def call(self, service: str, method: str, payload: dict) -> dict:
		if self.STUB:
			# Log the call shape so it's visible during demos and audits
			frappe.logger("sente_rails.adapters.ughub").info(
				f"[STUB UGHub] service={service} method={method} payload={payload}"
			)
			return {
				"stub": True,
				"service": service,
				"method": method,
				"echo": payload,
				"raw_response": {
					"status": "OK",
					"message": "Stubbed UGHub response — institutional MoU pending.",
				},
			}
		raise NotImplementedError(
			"Live UGHub calls require NITA-U institutional MoU. Configure ughub creds in site_config."
		)
