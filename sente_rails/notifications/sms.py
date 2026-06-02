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
SMS routing helper.

Selects an SMS adapter by `sms_primary_adapter` in site_config and
falls back to the other if the primary is unavailable. Adapters are
expected to expose a `send(msisdn, message, sender_id=None)` method
that returns a dict including `delivery_id` + `accepted_at`.

Caller pattern:
    from sente_rails.notifications.sms import send_sms
    receipt = send_sms("+256700123456", "Your trading licence is renewed.")
    # receipt -> {delivery_id, accepted_at, adapter, stub, ...}
"""

from typing import Optional

import frappe

_ADAPTERS = {
	"nitau": "sente_rails.adapters.sms.uganda_nitau.UgandaNitauAdapter",
	"africastalking": "sente_rails.adapters.sms.africastalking.AfricasTalkingAdapter",
}


def send_sms(msisdn: str, message: str, sender_id: str | None = None) -> dict:
	"""Send an SMS via the configured primary adapter; fall back to the
	other on adapter-level failure.

	Returns the adapter's `send` response dict, augmented with the
	`routed_via` key naming which adapter actually shipped the message.

	If the primary adapter raises, we capture the exception and try the
	fallback. Both failing -> re-raise the primary's exception.
	"""
	primary_key = (frappe.conf.get("sms_primary_adapter") or "nitau").strip().lower()
	if primary_key not in _ADAPTERS:
		primary_key = "nitau"
	fallback_key = "africastalking" if primary_key == "nitau" else "nitau"

	primary_err: Exception | None = None
	try:
		primary = _instantiate(primary_key)
		out = primary.send(msisdn, message, sender_id=sender_id)
		out["routed_via"] = primary_key
		return out
	except Exception as e:
		primary_err = e

	try:
		fallback = _instantiate(fallback_key)
		out = fallback.send(msisdn, message, sender_id=sender_id)
		out["routed_via"] = fallback_key
		out["primary_failed"] = type(primary_err).__name__ if primary_err else ""
		return out
	except Exception:
		# Both adapters failed — surface the primary failure to the caller
		# since that's what the operator configured first.
		raise primary_err  # type: ignore[misc]


def _instantiate(adapter_key: str):
	path = _ADAPTERS[adapter_key]
	cls = frappe.get_attr(path)
	return cls()
