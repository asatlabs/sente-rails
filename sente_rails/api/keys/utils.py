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
"""Sente Rails — API key generation, hashing, and lookup utilities.

The plaintext key is generated here, returned to the caller exactly
once, and discarded. The rail stores only the SHA-256 hash. See
docs/API_SECURITY_DESIGN.md §3 for the full key model.

Key format:
    <type>_<env>_<year>_<32-char-base62>

Examples:
    sk_sandbox_2026_aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV
    sk_live_2026_xY9aB8cD7eF6gH5iJ4kL3mN2oP1qR0sT
    pk_sandbox_2026_pQ7rS8tU9vW0xY1zA2bC3dE4fG5hI6jK

The prefix carries no secret material; the entropy lives entirely in
the 32-char payload (~190 bits at base62).
"""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import date
from typing import Literal

import frappe
from frappe.utils import add_to_date, now_datetime

_BASE62_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "abcdefghijklmnopqrstuvwxyz" "0123456789"
_PAYLOAD_LENGTH = 32

KeyType = Literal["sk", "rk", "pk", "whsec"]
Environment = Literal["sandbox", "live"]


# ─── Plaintext generation ────────────────────────────────────────────────


def _random_payload(length: int = _PAYLOAD_LENGTH) -> str:
	"""Cryptographically-secure base62 string of the given length."""
	return "".join(secrets.choice(_BASE62_ALPHABET) for _ in range(length))


def generate_key_plaintext(
	key_type: KeyType = "sk",
	environment: Environment = "sandbox",
	year: int | None = None,
) -> tuple[str, str, str]:
	"""Generate a fresh key. Returns (plaintext, prefix, last4).

	The plaintext is returned to the caller exactly once and never
	persisted. The caller must store the prefix + last4 on the
	`Sente API Key` record for display, and the SHA-256 hash (via
	`hash_plaintext`) for lookup.
	"""
	if key_type not in ("sk", "rk", "pk", "whsec"):
		raise ValueError(f"Unsupported key_type: {key_type}")
	if environment not in ("sandbox", "live"):
		raise ValueError(f"Unsupported environment: {environment}")

	resolved_year = year or date.today().year
	prefix = f"{key_type}_{environment}_{resolved_year}"
	payload = _random_payload()
	plaintext = f"{prefix}_{payload}"
	last4 = payload[-4:]
	return plaintext, prefix, last4


def hash_plaintext(plaintext: str) -> str:
	"""SHA-256 hex digest of the key. The only function that touches plaintext."""
	return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


# ─── Lookup ──────────────────────────────────────────────────────────────


def lookup_by_token(token: str) -> frappe.model.document.Document | None:
	"""Find the Sente API Key matching `token` (a full plaintext key).

	Returns the document if found and at-status-active-or-rolling,
	else None. The caller is responsible for `.is_usable_now()` to
	check expiry and `.scopes_list()` to check scopes.
	"""
	if not token or not isinstance(token, str):
		return None
	token = token.strip()
	if not token:
		return None
	digest = hash_plaintext(token)
	name = frappe.db.get_value("Sente API Key", {"key_hash": digest}, "name")
	if not name:
		return None
	return frappe.get_doc("Sente API Key", name)


# ─── Issuance ────────────────────────────────────────────────────────────


# Default scope sets per signup tier (see API_SECURITY_DESIGN.md §4.1.3).
_DEFAULT_SCOPES_SANDBOX = sorted(
	[
		"catalogue.read",
		"citizens.read",
		"assessments.read",
		"assessments.write",
		"payments.read",
		"payments.initiate",
		"webhooks.manage",
	]
)


def issue_key(
	integrator: str,
	key_type: KeyType = "sk",
	environment: Environment = "sandbox",
	scopes: list[str] | None = None,
	description: str | None = None,
	ttl_days: int | None = None,
) -> tuple[str, frappe.model.document.Document]:
	"""Mint a new key for the given integrator. Returns (plaintext, doc).

	The plaintext is returned exactly once. The persisted doc carries
	only the prefix, last4, and SHA-256 hash. Callers MUST surface the
	plaintext to the integrator (UI / response) and then discard it —
	there is no recovery path.

	Default scopes: §4.1.3 sandbox set when environment=sandbox and
	scopes is None. For live keys the caller must specify scopes
	explicitly — no default is provided because the live scope set is
	determined by the MoU + KYC outcome, not by a generic policy.
	"""
	plaintext, prefix, last4 = generate_key_plaintext(key_type=key_type, environment=environment)
	digest = hash_plaintext(plaintext)

	if scopes is None:
		if environment == "sandbox":
			scopes = list(_DEFAULT_SCOPES_SANDBOX)
		else:
			raise ValueError("Live keys must specify scopes explicitly.")

	if ttl_days is None:
		ttl_days = 90 if environment == "sandbox" else 365

	doc = frappe.new_doc("Sente API Key")
	doc.prefix = prefix
	doc.last4 = last4
	doc.key_hash = digest
	doc.integrator = integrator
	doc.environment = environment
	doc.key_type = key_type
	doc.status = "active"
	doc.scopes = json.dumps(sorted(set(scopes)))
	doc.expires_at = add_to_date(now_datetime(), days=ttl_days)
	if description:
		doc.description = description
	doc.insert(ignore_permissions=True)
	# Explicit commit so the row persists regardless of caller context.
	# HTTP requests auto-commit at end of request; script + RPC contexts do not.
	frappe.db.commit()
	return plaintext, doc


def revoke_key(name: str, reason: str, actor: str | None = None) -> None:
	"""Revoke an existing key. Idempotent on already-revoked keys."""
	doc = frappe.get_doc("Sente API Key", name)
	if doc.status == "revoked":
		return
	doc.status = "revoked"
	doc.revoked_at = now_datetime()
	doc.revoked_by = actor or frappe.session.user
	doc.revoked_reason = reason or "(no reason provided)"
	doc.save(ignore_permissions=True)
	frappe.db.commit()


def rotate_key(
	name: str,
	grace_hours: int = 24,
	actor: str | None = None,
) -> tuple[str, frappe.model.document.Document]:
	"""Roll an existing key.

	Issues a new key for the same integrator with the same scopes and
	environment, marks the old key as `rolling` with `rolling_until =
	now + grace_hours`, sets `rolled_to` on the old key pointing at
	the new one. Both keys accept traffic until the grace window
	closes, at which point the old key flips to `expired`.

	Returns (new_plaintext, new_doc). Caller must surface new_plaintext
	to the integrator immediately.
	"""
	old = frappe.get_doc("Sente API Key", name)
	if old.status not in ("active", "rolling"):
		raise ValueError(
			f"Cannot rotate key {name} in status {old.status} — only active/rolling keys may be rotated."
		)
	if grace_hours < 0 or grace_hours > 24 * 7:
		raise ValueError("grace_hours must be between 0 and 168 (one week).")

	new_plaintext, new_doc = issue_key(
		integrator=old.integrator,
		key_type=old.key_type,
		environment=old.environment,
		scopes=old.scopes_list(),
		description=(old.description or "") + " (rotated)",
	)
	old.status = "rolling"
	old.rolling_until = add_to_date(now_datetime(), hours=grace_hours)
	old.rolled_to = new_doc.name
	old.save(ignore_permissions=True)
	frappe.db.commit()
	return new_plaintext, new_doc


# ─── Maintenance ─────────────────────────────────────────────────────────


def expire_rolling_keys() -> int:
	"""Promote rolling keys past their grace window to `expired`.

	Returns the count expired. Called by the scheduler hook so the
	grace window is honoured even if no auth attempt against the old
	key happens after expiry.
	"""
	cutoff = now_datetime()
	stale = frappe.db.get_all(
		"Sente API Key",
		filters={"status": "rolling", "rolling_until": ["<", cutoff]},
		fields=["name"],
	)
	for row in stale:
		doc = frappe.get_doc("Sente API Key", row.name)
		doc.status = "expired"
		doc.save(ignore_permissions=True)
	if stale:
		frappe.db.commit()
	return len(stale)


def expire_past_keys() -> int:
	"""Flip active keys whose `expires_at` has passed to `expired`."""
	cutoff = now_datetime()
	stale = frappe.db.get_all(
		"Sente API Key",
		filters={"status": "active", "expires_at": ["<", cutoff]},
		fields=["name"],
	)
	for row in stale:
		doc = frappe.get_doc("Sente API Key", row.name)
		doc.status = "expired"
		doc.save(ignore_permissions=True)
	if stale:
		frappe.db.commit()
	return len(stale)
