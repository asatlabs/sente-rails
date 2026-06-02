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
Uganda Land Information System — Ministry of Lands, Housing and
Urban Development. Stub-only adapter for v0.

Site-config block (used when STUB=False):
    uganda_lis_sandbox = {
        "base_url": "https://lis.mlhud.go.ug/api/v1",
        "api_key":  "<merchant key>",
    }

The stub carries 5 synthetic titles spread across Gulu, Kampala, and
Mbarara so the Lands title-transfer demo path can be exercised
end-to-end without real LIS credentials.
"""

import secrets
from typing import Optional

import frappe

from sente_rails.adapters.base import CadastreAdapter

# Five seeded titles. Encumbrances mix common UG types (mortgage,
# caveat, easement) so a workflow can show the "blocked by
# encumbrance" path.
_STUB_TITLES = {
	"LRV-001-GULU-PECE": {
		"title_no": "LRV-001-GULU-PECE",
		"owner_nin": "CM75092001BCDE",
		"owner_name": "Patrick Okello Akena",
		"district": "Gulu",
		"sub_county": "Bardege",
		"parish": "Pece",
		"area_sqm": 1024.5,
		"land_use": "Residential",
		"valuation": 85_000_000,
		"currency": "UGX",
		"encumbrances": [],
	},
	"LRV-002-GULU-LAYIBI": {
		"title_no": "LRV-002-GULU-LAYIBI",
		"owner_nin": "CM80031400CDEF",
		"owner_name": "Stella Aciro Lakot",
		"district": "Gulu",
		"sub_county": "Layibi",
		"parish": "Te-Tugu",
		"area_sqm": 2048.0,
		"land_use": "Commercial",
		"valuation": 220_000_000,
		"currency": "UGX",
		"encumbrances": [
			{
				"type": "Mortgage",
				"holder": "Stanbic Bank Uganda",
				"amount": 90_000_000,
				"registered_at": "2024-08-12",
			}
		],
	},
	"LRV-101-KAMPALA-NAKAWA": {
		"title_no": "LRV-101-KAMPALA-NAKAWA",
		"owner_nin": "CM78001234ABCD",
		"owner_name": "Sarah Namutebi",
		"district": "Kampala",
		"sub_county": "Nakawa",
		"parish": "Bugolobi",
		"area_sqm": 512.25,
		"land_use": "Residential",
		"valuation": 480_000_000,
		"currency": "UGX",
		"encumbrances": [],
	},
	"LRV-102-KAMPALA-KAWEMPE": {
		"title_no": "LRV-102-KAMPALA-KAWEMPE",
		"owner_nin": "CM82110987XYZA",
		"owner_name": "Joseph Kato",
		"district": "Kampala",
		"sub_county": "Kawempe",
		"parish": "Bwaise",
		"area_sqm": 384.0,
		"land_use": "Mixed-Use",
		"valuation": 195_000_000,
		"currency": "UGX",
		"encumbrances": [
			{"type": "Caveat", "lodged_by": "Estate of late Sarah Kato", "registered_at": "2025-02-03"}
		],
	},
	"LRV-201-MBARARA-NYAMITANGA": {
		"title_no": "LRV-201-MBARARA-NYAMITANGA",
		"owner_nin": "CM72050708EFGH",
		"owner_name": "Doreen Atuhaire Tumwine",
		"district": "Mbarara",
		"sub_county": "Nyamitanga",
		"parish": "Kakoba",
		"area_sqm": 4096.75,
		"land_use": "Agricultural",
		"valuation": 110_000_000,
		"currency": "UGX",
		"encumbrances": [],
	},
}


class UgandaLisAdapter(CadastreAdapter):
	"""Stub Lands Information System adapter. Real-call path is a TODO
	until the MLHUD sandbox lands."""

	STUB: bool = True

	def _settings(self) -> dict:
		return frappe.conf.get("uganda_lis_sandbox") or {}

	# ---------------------------------------------------------------- ABC

	def lookup_plot(self, plot_ref: str) -> dict | None:
		"""ABC entrypoint — delegates to lookup_title since UG's
		cadastral primitive IS the land title number."""
		return self.lookup_title(plot_ref)

	# ---------------------------------------------------------------- Plan API

	def lookup_title(self, title_no: str) -> dict | None:
		"""Return the title row keyed by the LRV reference, or None."""
		if not title_no:
			return None
		ident = title_no.strip().upper()
		if ident in _STUB_TITLES:
			out = dict(_STUB_TITLES[ident])
			out["stub"] = True
			return out
		return None

	def verify_owner(self, title_no: str, nin: str) -> dict:
		"""Check whether the supplied NIN currently owns the title.
		Returns {matches, current_owner_nin, title_no, stub}.
		Unknown title -> {matches: False, current_owner_nin: None,
		reason: 'title_not_found'}.
		"""
		title = self.lookup_title(title_no)
		if not title:
			return {
				"matches": False,
				"current_owner_nin": None,
				"title_no": title_no,
				"reason": "title_not_found",
				"stub": True,
			}
		current = title.get("owner_nin")
		return {
			"matches": (current or "").strip().upper() == (nin or "").strip().upper(),
			"current_owner_nin": current,
			"title_no": title["title_no"],
			"stub": True,
		}

	def submit_transfer(
		self,
		title_no: str,
		from_nin: str,
		to_nin: str,
		consideration_amount: float,
	) -> dict:
		"""Submit a title transfer. Stub validates:
		- title exists
		- from_nin currently owns it
		- no blocking encumbrances (Mortgage / Caveat — operator must
		  discharge first)

		Returns {transfer_ref, status (Accepted / Rejected), stub,
		reason if Rejected}.
		"""
		title = self.lookup_title(title_no)
		if not title:
			return {
				"transfer_ref": "",
				"status": "Rejected",
				"reason": f"Title {title_no} not found.",
				"stub": True,
			}
		owner_check = self.verify_owner(title_no, from_nin)
		if not owner_check["matches"]:
			return {
				"transfer_ref": "",
				"status": "Rejected",
				"reason": (
					f"NIN {from_nin} is not the current owner of {title_no}. "
					f"Current owner: {owner_check['current_owner_nin']}."
				),
				"stub": True,
			}
		blocking = [e for e in title.get("encumbrances") or [] if e.get("type") in ("Mortgage", "Caveat")]
		if blocking:
			return {
				"transfer_ref": "",
				"status": "Rejected",
				"reason": f"Title has {len(blocking)} blocking encumbrance(s); discharge required first.",
				"encumbrances": blocking,
				"stub": True,
			}
		if not to_nin:
			frappe.throw("to_nin is required for submit_transfer.")
		if float(consideration_amount or 0) <= 0:
			frappe.throw("consideration_amount must be > 0 for submit_transfer.")
		return {
			"transfer_ref": f"LIS-TRF-STUB-{secrets.token_hex(6).upper()}",
			"status": "Accepted",
			"title_no": title["title_no"],
			"from_nin": from_nin,
			"to_nin": to_nin,
			"consideration_amount": float(consideration_amount),
			"currency": title.get("currency", "UGX"),
			"submitted_at": "2026-05-26 12:00:00",
			"stub": True,
		}
