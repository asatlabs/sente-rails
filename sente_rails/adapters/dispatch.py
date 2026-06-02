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
Adapter dispatch.

Resolves the correct adapter class for a country + domain at runtime.
Class paths live on Country Profile (identity_adapter, fiscal_adapter,
default_payment_adapters). Concrete classes are imported via
frappe.get_attr so new adapters can be added without touching this
module.

Usage:
    from sente_rails.adapters.dispatch import (
        get_fiscal_adapter, get_payment_adapter, get_identity_adapter
    )

    fiscal = get_fiscal_adapter("UG")
    prn = fiscal.generate_prn(assessment, line)

    payment = get_payment_adapter("UG", "MTN MoMo", mda="GULU")
    initiated = payment.initiate(payment_intent)

    identity = get_identity_adapter("UG")
    citizen = identity.lookup("CM78001234ABCD")
"""

import frappe
from frappe import _


def _country_profile(country_code: str):
	return frappe.get_cached_doc("Country Profile", country_code)


def get_fiscal_adapter(country_code: str):
	cp = _country_profile(country_code)
	if not cp.fiscal_adapter:
		frappe.throw(_("Country Profile {0} has no fiscal_adapter configured.").format(country_code))
	cls = frappe.get_attr(cp.fiscal_adapter)
	return cls(cp)


def get_identity_adapter(country_code: str):
	cp = _country_profile(country_code)
	if not cp.identity_adapter:
		return None
	cls = frappe.get_attr(cp.identity_adapter)
	return cls(cp)


_DEFAULT_BUSINESS_REGISTRY_ADAPTERS = {
	"UG": "sente_rails.adapters.business_registry.uganda_obrs.UgandaObrsAdapter",
}

_DEFAULT_CADASTRE_ADAPTERS = {
	"UG": "sente_rails.adapters.cadastre.uganda_lis.UgandaLisAdapter",
}

_DEFAULT_SMS_ADAPTERS = {
	# Country-default primary SMS adapter. The send_sms routing helper
	# at sente_rails.notifications.sms also reads sms_primary_adapter
	# from site_config; this map is the fallback when neither setting
	# is present.
	"UG": "sente_rails.adapters.sms.uganda_nitau.UgandaNitauAdapter",
}


def get_sms_adapter(country_code: str):
	"""Resolve the country's default SMS adapter. Same 3-tier lookup as
	get_cadastre_adapter / get_business_registry_adapter.
	"""
	cp = _country_profile(country_code)
	path = getattr(cp, "sms_adapter", None) or _DEFAULT_SMS_ADAPTERS.get(country_code)
	if not path:
		return None
	try:
		cls = frappe.get_attr(path)
	except (ImportError, AttributeError):
		return None
	# SMSAdapter doesn't take a country_profile arg.
	return cls()


def get_cadastre_adapter(country_code: str):
	"""Resolve the country's land cadastre adapter. Same 3-tier lookup
	pattern as get_business_registry_adapter (Country Profile field ->
	built-in default -> None).
	"""
	cp = _country_profile(country_code)
	path = getattr(cp, "cadastre_adapter", None) or _DEFAULT_CADASTRE_ADAPTERS.get(country_code)
	if not path:
		return None
	try:
		cls = frappe.get_attr(path)
	except (ImportError, AttributeError):
		return None
	return cls(cp)


def get_business_registry_adapter(country_code: str):
	"""Resolve the country's business-registry adapter.

	Lookup order:
	1. Country Profile.business_registry_adapter (custom override, when
	   that field is added to a deployment's Country Profile)
	2. _DEFAULT_BUSINESS_REGISTRY_ADAPTERS map (per-country built-in)
	3. None — caller decides whether that's a hard error or a skip.
	"""
	cp = _country_profile(country_code)
	path = getattr(cp, "business_registry_adapter", None) or _DEFAULT_BUSINESS_REGISTRY_ADAPTERS.get(
		country_code
	)
	if not path:
		return None
	try:
		cls = frappe.get_attr(path)
	except (ImportError, AttributeError):
		return None
	return cls(cp)


def get_payment_adapter(country_code: str, channel: str, mda: str | None = None):
	cp = _country_profile(country_code)
	adapter_paths = [s.strip() for s in (cp.default_payment_adapters or "").split(",") if s.strip()]
	if not adapter_paths:
		frappe.throw(
			_("Country Profile {0} has no default_payment_adapters configured.").format(country_code)
		)
	mda_doc = frappe.get_doc("MDA", mda) if mda else None
	for path in adapter_paths:
		try:
			cls = frappe.get_attr(path)
		except (ImportError, AttributeError):
			# Tolerate missing adapter classes — skip and try the next.
			# This lets Country Profile reference future adapters that
			# haven't been built yet.
			continue
		if channel in getattr(cls, "SUPPORTED_CHANNELS", set()):
			return cls(cp, mda_doc)
	frappe.throw(_("No payment adapter for channel {0} in country {1}.").format(channel, country_code))


def list_installed_adapters() -> dict:
	"""Snapshot of which adapters are configured per country, with
	importability check. Useful for /v1/integrations endpoint."""
	rv = {}
	for cp in frappe.get_all(
		"Country Profile",
		fields=["code", "identity_adapter", "fiscal_adapter", "default_payment_adapters"],
	):
		row = {
			"identity": _adapter_status(cp.identity_adapter),
			"fiscal": _adapter_status(cp.fiscal_adapter),
			"payment": [
				_adapter_status(s.strip())
				for s in (cp.default_payment_adapters or "").split(",")
				if s.strip()
			],
		}
		rv[cp.code] = row
	return rv


def _adapter_status(class_path: str | None) -> dict:
	if not class_path:
		return {"class_path": None, "importable": False, "stub": None}
	try:
		cls = frappe.get_attr(class_path)
		return {
			"class_path": class_path,
			"importable": True,
			"stub": _resolve_stub(cls),
			"supported_channels": sorted(getattr(cls, "SUPPORTED_CHANNELS", set())) or None,
		}
	except (ImportError, AttributeError) as e:
		return {"class_path": class_path, "importable": False, "error": str(e)}


def _resolve_stub(cls) -> bool | None:
	"""Resolve the STUB flag whether it's a class attribute (most adapters)
	or an instance @property (MoMo: STUB depends on site_config credentials).

	Returns True/False for a clean answer, or None if it can't be determined.
	"""
	stub = getattr(cls, "STUB", None)
	if isinstance(stub, bool):
		return stub
	if isinstance(stub, property):
		# Avoid the adapter __init__ (requires country_profile). The MoMo
		# STUB property only reads frappe.conf, so a bare allocator works.
		try:
			instance = object.__new__(cls)
			return bool(stub.fget(instance))
		except Exception:
			return None
	return None
