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
Adapter base classes for Sente Rails.

Each domain (fiscal, payment, identity, gateway, business_registry,
cadastre, sms) has an abstract base class. Concrete per-country
implementations subclass these and are dispatched via Country Profile
adapter class paths.

The STUB class attribute is the v0 mechanism for switching between
realistically-shaped stub responses and real API calls. Flip STUB=False
once production / sandbox credentials are wired into site_config.json
(under domain-specific keys like efris_sandbox, momo_sandbox, etc.).

All concrete adapters should:
1. Set STUB = True initially (intellectually honest in the brief, swap
   to False once creds are live).
2. Read settings via self._settings() (a thin helper subclasses define
   that pulls from site_config).
3. Annotate every stub response with stub: True so downstream consumers
   (audit log, brief evidence) can distinguish synthetic from live.
"""

from abc import ABC, abstractmethod
from typing import ClassVar, Optional


class FiscalAdapter(ABC):
	"""Generates fiscal receipts via the country's tax authority.

	Per-country examples:
		UG → URA EFRIS
		KE → KRA eTIMS
		TZ → TRA EFD / VFD
		RW → RRA EBM 2.1
		BI → OBR EBMS
		ET → MoR receipt system
	"""

	STUB: bool = True

	def __init__(self, country_profile):
		self.country = country_profile

	@abstractmethod
	def generate_prn(self, assessment, line) -> dict:
		"""Reserve a Payment Registration Number for an Assessment line.

		Returns: {prn, expires_at, amount, currency, raw_response, stub?}
		"""

	@abstractmethod
	def fiscalise(self, assessment, payment_intent) -> dict:
		"""Issue the fiscal document for a settled receipt.

		Called once per settled Payment Intent, after the payment is
		Confirmed. The tax authority fiscalises the whole assessment (all
		lines) as one invoice and returns a single Fiscal Document Number.

		Returns: {fdn, verification_code, qr_payload, issued_at, raw_response, stub?}
		"""

	@abstractmethod
	def verify_receipt(self, fdn: str) -> dict:
		"""Verify an issued fiscal document is valid and unaltered.

		Returns: {valid: bool, fdn, issued_at, raw_response, stub?}
		"""

	def verify_signature(self, headers: dict, body: str) -> bool:
		"""Default fiscal-callback signature verifier. Same shape as
		PaymentAdapter.verify_signature — STUB accepts, live fail-closed.
		"""
		return bool(getattr(self, "STUB", True))


class PaymentAdapter(ABC):
	"""Triggers and verifies payments via channel-specific aggregators.

	Sente Rails NEVER holds the cash (PFMA §43). Adapters are expected
	to instruct the aggregator to split-disburse to MDA collection
	accounts directly. The split rules live on Payment Intent.
	"""

	STUB: bool = True
	SUPPORTED_CHANNELS: ClassVar[set] = set()  # subclasses declare which Payment Intent channels they handle

	def __init__(self, country_profile, mda=None):
		self.country = country_profile
		self.mda = mda

	@abstractmethod
	def initiate(self, payment_intent) -> dict:
		"""Send the payment instruction (e.g. STK push, card auth).

		Returns: {aggregator_reference, status, raw_response, stub?}
		"""

	@abstractmethod
	def verify(self, payment_intent) -> dict:
		"""Poll / confirm payment status.

		Returns: {status, txn_id, settled_at, raw_response, stub?}
		"""

	@abstractmethod
	def refund(self, payment_event, amount: float, reason: str = "") -> dict:
		"""Issue a refund against a settled Payment Event.

		Returns: {refund_id, status, amount, raw_response, stub?}
		"""

	def verify_signature(self, headers: dict, body: str) -> bool:
		"""Default signature verifier for inbound webhooks.

		Subclasses override with provider-specific HMAC / OAuth1 / RSA
		schemes (see UgandaPesapalAdapter for the canonical example).
		Default behaviour:
		  - STUB mode: accept (returns True) so sandbox + smoke callbacks
		    flow through without a real verifier wired up.
		  - Live mode (STUB=False): fail-closed (returns False) so a
		    creds-bearing site never silently accepts an unsigned
		    callback before its real verifier ships.
		"""
		return bool(getattr(self, "STUB", True))


class IdentityAdapter(ABC):
	"""Citizen identity verification via national registries.

	Per-country examples:
		UG → NIRA (via UGHub)
		KE → IPRS / Huduma
		TZ → NIDA
		RW → NIDA
	"""

	STUB: bool = True

	def __init__(self, country_profile):
		self.country = country_profile

	@abstractmethod
	def lookup(self, identifier: str) -> dict | None:
		"""Lookup a citizen by national identifier.

		Returns: {nin, full_name, first_name, middle_name, surname,
		dob, gender, district, sub_county, parish, village, photo_ref}
		or None if not found.
		"""

	@abstractmethod
	def verify(self, nin: str, biometric_ref: str | None = None) -> dict:
		"""Verify a citizen's identity (optionally with biometric proof).

		Returns: {verified: bool, confidence: float, raw_response, stub?}
		"""


class GatewayAdapter(ABC):
	"""Government data exchange gateway.

	Per-country examples:
		UG → NITA-U UGHub
		RW → RDF SOA gateway
		KE → IFMIS/CCS interop
	"""

	STUB: bool = True

	def __init__(self, country_profile):
		self.country = country_profile

	@abstractmethod
	def call(self, service: str, method: str, payload: dict) -> dict:
		"""Make a generic gateway call. Service and method are gateway-
		specific (e.g. UGHub: service="nira", method="lookup_nin")."""


class BusinessRegistryAdapter(ABC):
	"""Business registry / company registration adapter.

	Per-country examples:
		UG → URSB OBRS
		KE → BRS
		TZ → BRELA
		RW → RDB
	"""

	STUB: bool = True

	def __init__(self, country_profile):
		self.country = country_profile

	@abstractmethod
	def lookup_business(self, identifier: str) -> dict | None: ...

	@abstractmethod
	def reserve_name(self, name: str) -> dict: ...

	@abstractmethod
	def register_business(self, payload: dict) -> dict: ...


class CadastreAdapter(ABC):
	"""Land cadastre adapter (parcels, titles, encumbrances)."""

	STUB: bool = True

	def __init__(self, country_profile):
		self.country = country_profile

	@abstractmethod
	def lookup_plot(self, plot_ref: str) -> dict | None: ...


class SMSAdapter(ABC):
	"""SMS gateway adapter (NITA-U primary; Africa's Talking fallback)."""

	STUB: bool = True

	@abstractmethod
	def send(self, to: str, body: str) -> dict: ...
