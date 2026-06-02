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
URSB Online Business Registration System — Uganda.

Stub-only adapter for v0. When URSB publishes a sandbox + the MoU
lands, swap STUB=False and wire the real REST surface. URSB OBRS is
the source of truth for company registrations, business names,
director changes, and partnership filings.

Site-config block (site_config.json) — used when STUB=False:
    ursb_obrs_sandbox = {
        "base_url":    "https://obrs.ursb.go.ug/api/v1",
        "api_key":     "<merchant key issued by URSB>",
        "callback_url": "https://sente-rails.ug/v1/webhooks/ursb",
    }

The stub carries 3 synthetic businesses so the cross-MDA business
registration demo (Act 3: URSB -> URA -> NSSF) can be exercised
end-to-end without real URSB credentials.
"""

from typing import Optional

import frappe

from sente_rails.adapters.base import BusinessRegistryAdapter

# Three synthetic businesses keyed by TIN. URSB number is the auto-
# generated identifier the stub returns on register_business; both
# TIN and URSB number flow through lookup_business.
_STUB_BUSINESSES = {
	"1000000201": {
		"ursb_number": "URSB-2024-000841",
		"legal_name": "Kampala Traders Limited",
		"trading_name": "KTL",
		"business_type": "Limited Company",
		"sector": "G47",
		"district": "Kampala",
		"incorporation_date": "2024-03-14",
		"status": "Active",
		"directors": [
			{"nin": "CM78001234ABCD", "name": "Sarah Namutebi", "role": "Director", "shareholding_pct": 60.0},
			{"nin": "CM82110987XYZA", "name": "Joseph Kato", "role": "Director", "shareholding_pct": 40.0},
		],
	},
	"1000000202": {
		"ursb_number": "URSB-2024-000915",
		"legal_name": "Gulu Agricultural Cooperative",
		"trading_name": "Gulu Agri-Coop",
		"business_type": "Cooperative",
		"sector": "A01",
		"district": "Gulu",
		"incorporation_date": "2024-06-22",
		"status": "Active",
		"directors": [
			{
				"nin": "CM75092001BCDE",
				"name": "Patrick Okello Akena",
				"role": "Director",
				"shareholding_pct": 30.0,
			},
			{
				"nin": "CM80031400CDEF",
				"name": "Stella Aciro Lakot",
				"role": "Director",
				"shareholding_pct": 35.0,
			},
			{
				"nin": "CM82111400DEFG",
				"name": "Charles Otim Ojok",
				"role": "Director",
				"shareholding_pct": 35.0,
			},
		],
	},
	"1000000203": {
		"ursb_number": "URSB-2023-002467",
		"legal_name": "Mbarara Dairy Limited",
		"trading_name": "MBR Dairy",
		"business_type": "Limited Company",
		"sector": "C10",
		"district": "Mbarara",
		"incorporation_date": "2023-09-08",
		"status": "Active",
		"directors": [
			{
				"nin": "CM72050708EFGH",
				"name": "Doreen Atuhaire Tumwine",
				"role": "Director",
				"shareholding_pct": 100.0,
			},
		],
	},
}

# Reserved business names — used by reserve_name / verify_business_name
# to demonstrate the "name already taken" path.
_RESERVED_NAMES = {
	"KAMPALA TRADERS LIMITED",
	"GULU AGRICULTURAL COOPERATIVE",
	"MBARARA DAIRY LIMITED",
	"UGANDA REVENUE AUTHORITY",
	"NATIONAL SOCIAL SECURITY FUND",
}


class UgandaObrsAdapter(BusinessRegistryAdapter):
	"""Stub URSB OBRS adapter. Real-call path is a TODO until the URSB
	sandbox MoU lands."""

	STUB: bool = True

	def _settings(self) -> dict:
		return frappe.conf.get("ursb_obrs_sandbox") or {}

	# ---------------------------------------------------------------- ABC

	def lookup_business(self, identifier: str) -> dict | None:
		"""Look up a business by either TIN or URSB number. The plan's
		`lookup_business(tin)` is covered by passing the TIN string;
		passing a URSB number also resolves so back-office search is
		flexible.
		"""
		if not identifier:
			return None
		ident = identifier.strip()
		# Try TIN first
		if ident in _STUB_BUSINESSES:
			return _annotate_stub(_STUB_BUSINESSES[ident], tin=ident)
		# Try URSB number
		for tin, biz in _STUB_BUSINESSES.items():
			if biz["ursb_number"] == ident:
				return _annotate_stub(biz, tin=tin)
		return None

	def reserve_name(self, name: str) -> dict:
		"""URSB's reserve-a-name endpoint. Stub returns availability based
		on _RESERVED_NAMES and produces a synthetic reservation_ref.
		"""
		normalized = (name or "").strip().upper()
		if not normalized:
			frappe.throw("Business name is required for name reservation.")
		available = normalized not in _RESERVED_NAMES
		similar = sorted(
			rn for rn in _RESERVED_NAMES if normalized.split()[0] in rn or rn.split()[0] in normalized
		)[:5]
		return {
			"available": available,
			"normalized_name": normalized,
			"reservation_ref": (
				f"URSB-NR-STUB-{abs(hash(normalized)) % 10_000_000:07d}" if available else ""
			),
			"reservation_expires_at": "2026-08-26" if available else "",
			"similar_names": similar,
			"stub": True,
		}

	def register_business(self, payload: dict) -> dict:
		"""URSB register-business endpoint. Stub mints a URSB number and
		registration_date; the synthetic business is NOT persisted into
		the in-memory _STUB_BUSINESSES dict (per-process state isn't
		shared with the request that does lookup_business afterwards),
		but the plan's shape is honoured.

		Expected payload keys: legal_name, business_type, sector,
		district, directors (list of {nin, name, role, shareholding_pct}).
		"""
		legal_name = (payload or {}).get("legal_name", "")
		if not legal_name:
			frappe.throw("payload.legal_name is required for register_business.")
		# Mint a plausible URSB number — stub uses STUB suffix so the
		# audit trail can distinguish synthetic registrations.
		ursb_number = f"URSB-STUB-{abs(hash(legal_name)) % 1_000_000:06d}"
		return {
			"ursb_number": ursb_number,
			"registration_date": "2026-05-26",
			"legal_name": legal_name,
			"status": "Active",
			"acknowledgement_ref": f"URSB-ACK-{abs(hash(legal_name + 'ack')) % 10_000_000:07d}",
			"stub": True,
		}

	# ---------------------------------------------------------------- Extras (plan)

	def verify_business_name(self, name: str) -> dict:
		"""Plan-named convenience that aliases the ABC's reserve_name —
		returns only availability + similar_names without committing to
		a reservation. Both endpoints call URSB's same underlying check
		in production; we keep them distinct callers for clarity.
		"""
		result = self.reserve_name(name)
		return {
			"available": result["available"],
			"normalized_name": result["normalized_name"],
			"similar_names": result["similar_names"],
			"stub": True,
		}

	def submit_directors_change(self, ursb_number: str, changes: list) -> dict:
		"""URSB's directors-change filing. Stub validates the business
		exists and returns an acknowledgement; the actual change is not
		persisted in the stub.

		Expected `changes` shape: list of {action: add|remove|update,
		nin, name?, role?, shareholding_pct?}.
		"""
		if not ursb_number:
			frappe.throw("ursb_number is required for submit_directors_change.")
		business = None
		for _tin, biz in _STUB_BUSINESSES.items():
			if biz["ursb_number"] == ursb_number:
				business = biz
				break
		if not business:
			return {
				"acknowledged": False,
				"reason": f"URSB number {ursb_number} not found in stub registry.",
				"stub": True,
			}
		valid_changes = [c for c in (changes or []) if c.get("action") in ("add", "remove", "update")]
		return {
			"acknowledged": True,
			"ursb_number": ursb_number,
			"change_ref": f"URSB-DC-STUB-{abs(hash(ursb_number + str(len(valid_changes)))) % 10_000_000:07d}",
			"changes_accepted": len(valid_changes),
			"submitted_at": "2026-05-26 12:00:00",
			"stub": True,
		}


def _annotate_stub(biz: dict, *, tin: str) -> dict:
	"""Return a copy of a stub business row with TIN + stub flag added."""
	out = dict(biz)
	out["tin"] = tin
	out["stub"] = True
	return out
