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
Sente Rails public API v1 — Citizens.

URL prefix (Frappe-native): /api/method/sente_rails.api.v1.citizens.*
Production presents these as /v1/citizens/* via the in-process router.

Auth (Phase 1A): Sente API Key as Bearer token. The `@sente_api`
decorator does hash lookup, status + scope check, audit log write,
and `last_used_at` bump. See docs/API_SECURITY_DESIGN.md §3 + §6.1.

Scope mapping per docs/API_SECURITY_DESIGN.md §3.4:
    list_citizens      → citizens.read
    get_citizen        → citizens.read
    search_by_nin      → citizens.read
    create_citizen     → citizens.write
"""

import frappe
from frappe import _

from sente_rails.api.keys.auth import sente_api

# Curated, integrator-facing field set for a single citizen. Deliberately
# excludes framework-internal columns (owner, creation, modified_by,
# docstatus, idx, doctype) and the internal consent-recorder user, so the
# public API never leaks the implementation underneath. Keep this in sync
# with the Citizen doctype's business fields.
_PUBLIC_CITIZEN_FIELDS = (
	"name",
	"nin",
	"tin",
	"status",
	"verified",
	"full_name",
	"first_name",
	"middle_name",
	"surname",
	"dob",
	"gender",
	"phone",
	"alternate_phone",
	"email",
	"district",
	"sub_county",
	"parish",
	"village",
	"address_line",
	"consent_data_sharing",
	"consent_recorded_on",
	"linked_customer",
	"photo",
	"modified",
)


def _public_citizen(doc) -> dict:
	"""Shape a Citizen doc/dict into the public API representation.

	Accepts either a Document or a plain dict (e.g. an adapter hit) and
	returns only the whitelisted business fields — never the framework's
	system columns. Unknown keys (such as an adapter's `stub` marker) are
	dropped here; callers that need them attach them to the envelope.
	"""
	d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	return {k: d.get(k) for k in _PUBLIC_CITIZEN_FIELDS if k in d}


@frappe.whitelist(allow_guest=True)
@sente_api(scope="citizens.read")
def list_citizens(
	q: str | None = None, nin: str | None = None, phone: str | None = None, start: int = 0, limit: int = 50
):
	"""Search / list citizens.

	Query params:
		q     — substring across full_name + nin + phone
		nin   — exact NIN match
		phone — exact phone match
		start — pagination offset (default 0)
		limit — page size (default 50, max 200)
	"""
	limit = min(int(limit), 200)
	filters: dict = {}
	or_filters: dict = {}
	if nin:
		filters["nin"] = nin.upper()
	if phone:
		filters["phone"] = phone
	if q:
		or_filters = {
			"full_name": ["like", f"%{q}%"],
			"nin": ["like", f"%{q.upper()}%"],
			"phone": ["like", f"%{q}%"],
		}
	fields = ["name", "nin", "full_name", "phone", "email", "district", "status", "verified", "modified"]
	return frappe.get_all(
		"Citizen",
		filters=filters,
		or_filters=or_filters or None,
		fields=fields,
		start=int(start),
		page_length=limit,
		order_by="modified desc",
	)


@frappe.whitelist(allow_guest=True)
@sente_api(scope="citizens.read")
def get_citizen(name: str):
	"""Get a single citizen by docname."""
	return _public_citizen(frappe.get_doc("Citizen", name))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="citizens.write")
def create_citizen(**kwargs):
	"""Create a citizen. Body fields match the Citizen doctype schema."""
	# Don't let callers set system fields
	for forbidden in (
		"name",
		"creation",
		"modified",
		"owner",
		"consent_recorded_on",
		"consent_recorded_by",
		"verified",
	):
		kwargs.pop(forbidden, None)
	doc = frappe.get_doc({"doctype": "Citizen", **kwargs})
	doc.insert(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist(allow_guest=True)
@sente_api(scope="citizens.read")
def search_by_nin(nin: str):
	"""Resolve a citizen by NIN.

	Lookup order:
	  1. Local Citizen registry (already registered)
	  2. NIRA via the country's identity adapter (UGHub-mediated in
	     production; stub today)

	Response carries `source` ("local" | "nira") and `stub` when the
	NIRA adapter is still in stub mode.
	"""
	nin_norm = (nin or "").strip().upper()
	if not nin_norm:
		frappe.throw(_("NIN is required."))

	local = frappe.db.get_value("Citizen", {"nin": nin_norm}, "name")
	if local:
		return {
			"source": "local",
			"citizen": _public_citizen(frappe.get_doc("Citizen", local)),
		}

	from sente_rails.adapters.dispatch import get_identity_adapter

	adapter = get_identity_adapter("UG")
	if adapter:
		hit = adapter.lookup(nin_norm)
		if hit:
			return {
				"source": "nira",
				"citizen": _public_citizen(hit),
				"stub": hit.get("stub", False),
			}
	return {"source": "not_found", "citizen": None}


# Evidence types accepted by the Citizen Consent Event doctype. Mirrors the
# Select options; an off-list value would 417 the insert, so we coerce.
_CONSENT_EVIDENCE_TYPES = (
	"In-Person Signature",
	"OTP Confirmation",
	"Written Letter",
	"API Consent",
)


def _record_identity_consent(citizen: str, mda: str, evidence_type: str = "In-Person Signature") -> str | None:
	"""Record a Citizen Consent Event for an identity pull.

	Persisting a citizen sourced from NIRA is a data-access event under the
	PDP Act 2019 — it must leave a proof-of-consent trail. The clerk
	registering a citizen who is physically present at the counter is the
	consent gesture (evidence: in-person). Returns the event docname, or
	None if it couldn't be written (logged, never fatal — a failed consent
	row must not block the citizen registration the clerk needs).
	"""
	if not mda:
		return None
	if evidence_type not in _CONSENT_EVIDENCE_TYPES:
		evidence_type = "In-Person Signature"
	try:
		ev = frappe.get_doc(
			{
				"doctype": "Citizen Consent Event",
				"citizen": citizen,
				"mda": mda,
				"purpose": "Identity Verification",
				"granted": 1,
				"evidence_type": evidence_type,
			}
		)
		ev.insert(ignore_permissions=True)
		return ev.name
	except Exception:
		frappe.log_error(
			title="Identity consent capture failed",
			message=f"citizen={citizen} mda={mda}: {frappe.get_traceback()}",
		)
		return None


def _register_citizen_from_nin(
	nin: str, mda: str | None = None, evidence_type: str = "In-Person Signature"
) -> dict:
	"""Find-or-create a local Citizen for ``nin``.

	The counter's missing half of the identity cascade. ``search_by_nin``
	resolves a NIN (local → NIRA → not_found) but a NIRA-only hit has no
	local docname, so it can't anchor an Assessment. This persists that hit
	into the local registry and returns a usable record.

	Resolution order:
	  1. Already in the local registry → return it (idempotent; no
	     duplicate, no second consent row).
	  2. NIRA hit → persist as a local Citizen + record an Identity
	     Verification consent event, return it.
	  3. Neither → 404.

	``verified`` is set only when NIRA authoritatively vouches in live mode;
	a stub-mode hit stays ``verified=0`` (we don't claim verification the
	national authority hasn't actually given).

	Returns ``{"citizen": <public dict>, "created": bool, "source":
	"local"|"nira", "consent_event": <name|None>}``.
	"""
	nin_norm = (nin or "").strip().upper()
	if not nin_norm:
		frappe.throw(_("NIN is required."))

	existing = frappe.db.get_value("Citizen", {"nin": nin_norm}, "name")
	if existing:
		return {
			"citizen": _public_citizen(frappe.get_doc("Citizen", existing)),
			"created": False,
			"source": "local",
			"consent_event": None,
		}

	from sente_rails.adapters.dispatch import get_identity_adapter

	adapter = get_identity_adapter("UG")
	hit = adapter.lookup(nin_norm) if adapter else None
	if not hit:
		frappe.throw(
			_("No citizen found for NIN {0} in the local registry or NIRA.").format(nin_norm),
			exc=frappe.DoesNotExistError,
		)

	is_stub = bool(hit.get("stub"))
	doc = frappe.get_doc(
		{
			"doctype": "Citizen",
			"nin": nin_norm,
			"full_name": hit.get("full_name"),
			"first_name": hit.get("first_name"),
			"middle_name": hit.get("middle_name"),
			"surname": hit.get("surname"),
			"dob": hit.get("dob"),
			"gender": hit.get("gender"),
			"district": hit.get("district"),
			"sub_county": hit.get("sub_county"),
			"parish": hit.get("parish"),
			"village": hit.get("village"),
			# NIRA vouches in live mode → verified. Stub mode stays
			# unverified — honest about what the authority actually confirmed.
			"verified": 0 if is_stub else 1,
		}
	)
	doc.insert(ignore_permissions=True)
	consent_event = _record_identity_consent(doc.name, mda, evidence_type)
	return {
		"citizen": _public_citizen(doc),
		"created": True,
		"source": "nira",
		"consent_event": consent_event,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="citizens.write")
def register_citizen(nin: str, mda: str | None = None, evidence_type: str = "In-Person Signature"):
	"""Find-or-create a local Citizen from a NIN (resolving via NIRA).

	The write-scoped companion to ``search_by_nin``: where search only
	reads, this persists a NIRA hit into the local registry so it can
	anchor an Assessment. Idempotent — an already-registered NIN returns
	the existing record without creating a duplicate.
	"""
	return _register_citizen_from_nin(nin, mda, evidence_type)
