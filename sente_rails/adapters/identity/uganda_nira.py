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
NIRA (National Identification and Registration Authority) — Uganda.

Real access: brokered via NITA-U UGHub under an MDA MoU. There is no
public sandbox; production access requires institutional onboarding.

Until UGHub access is granted, this adapter returns a small library of
realistically-shaped stub citizens keyed by NIN. Used in the prototype
to demonstrate the citizen-lookup beat without exposing real PII.
"""

from datetime import date
from typing import Optional

from sente_rails.adapters.base import IdentityAdapter

# Stub library — synthetic but realistically-shaped citizens. None of
# these NINs match a real Ugandan; they're randomly generated and
# documented as test fixtures.
_STUB_CITIZENS = {
	"CM78001234ABCD": {
		"nin": "CM78001234ABCD",
		"full_name": "Mukasa John Patrick",
		"first_name": "John",
		"middle_name": "Patrick",
		"surname": "Mukasa",
		"dob": date(1978, 4, 12).isoformat(),
		"gender": "Male",
		"district": "Gulu",
		"sub_county": "Bardege",
		"parish": "Kasubi",
		"village": "Pawel",
		"photo_ref": None,
	},
	"CM85002345EFGH": {
		"nin": "CM85002345EFGH",
		"full_name": "Akello Sarah Atim",
		"first_name": "Sarah",
		"middle_name": "Atim",
		"surname": "Akello",
		"dob": date(1985, 9, 3).isoformat(),
		"gender": "Female",
		"district": "Gulu",
		"sub_county": "Layibi",
		"parish": "Layibi",
		"village": "Cereleno",
		"photo_ref": None,
	},
	"CF92003456IJKL": {
		"nin": "CF92003456IJKL",
		"full_name": "Nakato Grace",
		"first_name": "Grace",
		"middle_name": "",
		"surname": "Nakato",
		"dob": date(1992, 1, 20).isoformat(),
		"gender": "Female",
		"district": "Wakiso",
		"sub_county": "Kira",
		"parish": "Bweyogerere",
		"village": "Kirinya",
		"photo_ref": None,
	},
}


class NIRAAdapter(IdentityAdapter):
	STUB: bool = True

	def lookup(self, identifier: str) -> dict | None:
		if self.STUB:
			rec = _STUB_CITIZENS.get((identifier or "").strip().upper())
			if not rec:
				return None
			return dict(rec, stub=True)
		raise NotImplementedError("Live NIRA lookup requires UGHub access. Submit institutional MoU first.")

	def verify(self, nin: str, biometric_ref: str | None = None) -> dict:
		if self.STUB:
			exists = (nin or "").strip().upper() in _STUB_CITIZENS
			return {
				"verified": exists,
				"confidence": 0.99 if exists else 0.0,
				"stub": True,
				"raw_response": {"status": "OK" if exists else "NOT_FOUND"},
			}
		raise NotImplementedError
