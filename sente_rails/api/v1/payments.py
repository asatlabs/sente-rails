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
Sente Rails public API v1 — Payment Intents + Events.

Payment Intent holds the per-MDA split rules; the aggregator executes
the split, Sente Rails never holds the money (PFMA §43). Payment Event
is the per-MDA proof-of-receipt the aggregator returns on settlement.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime

from sente_rails.api.keys.auth import sente_api

# Curated, integrator-facing field set for a Payment Intent. Excludes:
#   - framework columns (owner, modified_by, docstatus, idx, doctype, …)
#   - idempotency_key — internal server-minted retry token
#   - initiate_request_payload / initiate_response_payload /
#     verify_response_payload — verbatim adapter traces (internal; the
#     curated `trace` endpoint exposes a parsed, audit-shaped view)
# Kept: aggregator_reference (the integrator's reconciliation handle) +
# lifecycle timestamps.
_PUBLIC_INTENT_FIELDS = (
	"name",
	"assessment",
	"channel",
	"status",
	"currency",
	"citizen_msisdn",
	"amount",
	"aggregator",
	"aggregator_reference",
	"sent_at",
	"confirmed_at",
	"failed_at",
	"failure_reason",
	"notes",
	"fiscal_status",
	"fdn",
	"fiscal_verification_code",
	"fiscal_qr_payload",
	"fiscalised_at",
	"refunded_at",
	"refund_reason",
)

# Public columns of the Payment Intent Split child rows. mda + amount show
# the split transparently; destination_account / destination_account_type
# are treasury routing details and stay server-side (ops + audit-trace only).
_PUBLIC_SPLIT_FIELDS = ("mda", "amount")

# Public columns of a Payment Event. Excludes destination_account (treasury
# routing), proof_payload (verbatim provider body), linked_journal_entry
# (internal accounting), and framework columns. aggregator_txn_id kept for
# the integrator's reconciliation.
_PUBLIC_EVENT_FIELDS = (
	"name",
	"payment_intent",
	"mda",
	"amount",
	"currency",
	"aggregator",
	"aggregator_txn_id",
	"received_at",
)


def _public_intent(doc) -> dict:
	"""Shape a Payment Intent into the public API representation, including
	its (shaped) split rules and excluding framework + internal fields."""
	d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	out = {k: d.get(k) for k in _PUBLIC_INTENT_FIELDS if k in d}
	splits = d.get("split_rules") or []
	out["split_rules"] = [
		{sk: s.get(sk) for sk in _PUBLIC_SPLIT_FIELDS}
		for s in splits
		if isinstance(s, dict)
	]
	return out


def _public_event(doc) -> dict:
	"""Shape a Payment Event (doc or dict) into the public representation."""
	d = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	return {k: d.get(k) for k in _PUBLIC_EVENT_FIELDS if k in d}


def _service_beneficiaries(service: str | None, fallback_mda: str) -> list[tuple[str, float]]:
	"""The MDAs sharing a service's fee, as (mda, percent) summing to 100.

	Reads Service.fee_beneficiaries; if a service has none configured, the whole
	fee goes to its own MDA. Normalises to 100 so the split is exact even if the
	configured shares don't quite add up.
	"""
	if service:
		rows = frappe.get_all(
			"Service Beneficiary",
			filters={"parent": service, "parenttype": "Service"},
			fields=["beneficiary_mda", "share_percent"],
			order_by="idx",
		)
		clean = [(r.beneficiary_mda, float(r.share_percent or 0)) for r in rows if r.beneficiary_mda and (r.share_percent or 0) > 0]
		total = sum(p for _, p in clean)
		if clean and total > 0:
			return [(m, p / total * 100.0) for m, p in clean]
	return [(fallback_mda, 100.0)]


def _treasury_account(mda: str) -> str:
	"""The MDA's configured collection account number, or a readable fallback."""
	return frappe.db.get_value("MDA", mda, "treasury_account") or f"{mda}-COLLECTION"


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="payments.initiate")
def create_intent(
	assessment: str | None = None,
	channel: str | None = None,
	citizen_msisdn: str | None = None,
	splits: list | None = None,
	aggregator: str | None = None,
):
	"""Create a Payment Intent for an Assessment.

	If `splits` is omitted, splits are derived from the Assessment lines
	(one split per MDA, summing each MDA's line amounts).

	Body shape:
	  {
	    "assessment": "ASMT-2026-05-000123",
	    "channel": "MTN MoMo",
	    "citizen_msisdn": "+256772123456",
	    "splits": [   // optional — auto-derived from assessment if omitted
	      {"mda": "GULU", "amount": 50000, "destination_account": "GULU-COLL-001"},
	      {"mda": "URA",  "amount": 15000, "destination_account": "URA-COLL-001"}
	    ]
	  }
	"""
	# Validate up front so an empty/partial body returns a clean validation
	# error instead of a TypeError 500 (assessment + channel are required).
	if not assessment:
		frappe.throw(_("assessment is required."))
	if not channel:
		frappe.throw(_("channel is required."))
	if isinstance(splits, str):
		import json

		splits = json.loads(splits)
	asmt = frappe.get_doc("Assessment", assessment)
	if not splits:
		# Each line's fee is shared across its service's statutory beneficiaries
		# (a service can split to several MDAs — e.g. a city licence with a URA
		# tax + EFRIS levy). A service with no beneficiary config settles wholly
		# to its own MDA.
		bucket: dict[str, float] = {}
		for line in asmt.assessment_lines:
			line_amt = float(line.amount or 0)
			benes = _service_beneficiaries(line.service, line.mda)
			allocated = 0.0
			rows = []
			for bmda, pct in benes:
				share = round(line_amt * pct / 100.0, 4)
				rows.append([bmda, share])
				allocated += share
			# Put any rounding remainder on the first (largest-share) beneficiary.
			rem = round(line_amt - allocated, 4)
			if rows and rem:
				rows[0][1] = round(rows[0][1] + rem, 4)
			for bmda, share in rows:
				bucket[bmda] = bucket.get(bmda, 0) + share
		# A supervisor waiver reduces total_amount below the gross line sum.
		# Distribute it proportionally across the MDA buckets so the splits
		# still sum exactly to the (net) intent amount the citizen pays. Any
		# rounding remainder lands on the largest split.
		gross = round(sum(bucket.values()), 4)
		net = round(float(asmt.total_amount or 0), 4)
		if gross > 0 and net != gross:
			scaled = {mda: round(amt * net / gross, 4) for mda, amt in bucket.items()}
			remainder = round(net - sum(scaled.values()), 4)
			if remainder and scaled:
				largest = max(scaled, key=lambda k: scaled[k])
				scaled[largest] = round(scaled[largest] + remainder, 4)
			bucket = scaled
		splits = [
			{
				"mda": mda,
				"amount": amt,
				"destination_account": _treasury_account(mda),
				"destination_account_type": "Bank",
			}
			for mda, amt in bucket.items()
		]
	doc = frappe.get_doc(
		{
			"doctype": "Payment Intent",
			"assessment": assessment,
			"channel": channel,
			"amount": asmt.total_amount,
			"currency": asmt.currency,
			"citizen_msisdn": citizen_msisdn,
			"aggregator": aggregator,
			"split_rules": splits,
		}
	)
	doc.insert()
	return _public_intent(doc)


@frappe.whitelist(allow_guest=True)
@sente_api(scope="payments.read")
def get_intent(name: str):
	return _public_intent(frappe.get_doc("Payment Intent", name))


@frappe.whitelist(allow_guest=True)
def public_summary(name: str):
	"""Citizen-facing receipt summary, safe to expose without auth.

	Powers the /verify/{ref} public verifier — anyone with a printed
	receipt QR can land on this surface and confirm the payment is on
	file. Returns *only* non-sensitive fields:

	- Status (Confirmed / Pending / Failed) — no internal flags
	- Display name of the citizen (no NIN, no msisdn, no phone)
	- MDA full name + service line descriptions
	- Amount, currency, channel, aggregator reference
	- Split summary (MDA name + amount; no destination account numbers)
	- Confirmation timestamp

	On unknown reference, returns a 404-shaped {error} so the verifier
	can render an "unverified — receipt not on file" message rather
	than leaking whether the ref exists.
	"""
	if not frappe.db.exists("Payment Intent", name):
		frappe.throw(_("Receipt not on file"), frappe.DoesNotExistError)

	pi = frappe.get_doc("Payment Intent", name)
	assessment = frappe.get_doc("Assessment", pi.assessment) if pi.assessment else None

	lines = []
	mdas = set()
	if assessment:
		for line in assessment.assessment_lines or []:
			lines.append(
				{
					"mda": line.mda,
					"mda_name": _mda_display_name(line.mda),
					"service": line.service,
					"service_name": getattr(line, "service_name", None) or line.service,
					"amount": float(line.amount or 0),
				}
			)
			mdas.add(line.mda)

	splits = []
	for split in pi.split_rules or []:
		splits.append(
			{
				"mda": split.mda,
				"mda_name": _mda_display_name(split.mda),
				"amount": float(split.amount or 0),
			}
		)

	citizen_display = None
	if assessment and assessment.citizen:
		citizen_display = frappe.db.get_value("Citizen", assessment.citizen, "full_name")

	return {
		"reference": pi.name,
		"status": pi.status,
		"verified": pi.status == "Confirmed",
		"amount": float(pi.amount or 0),
		"currency": pi.currency or "UGX",
		"channel": pi.channel,
		"aggregator": pi.aggregator,
		"aggregator_reference": pi.aggregator_reference,
		"confirmed_at": pi.confirmed_at.isoformat() if pi.confirmed_at else None,
		"citizen_display_name": citizen_display,
		"primary_mda": _mda_display_name(next(iter(mdas))) if len(mdas) == 1 else None,
		"is_multi_mda": len(mdas) > 1,
		"lines": lines,
		"splits": splits,
	}


def _mda_display_name(short_code: str | None) -> str | None:
	if not short_code:
		return None
	full = frappe.db.get_value("MDA", short_code, "full_name")
	return full or short_code


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="payments.initiate")
def initiate(name: str):
	"""Send the payment via the channel-specific adapter (e.g. MoMo STK push).

	On stub adapters, this returns a stub-shaped response and stamps
	the intent into Sent status. On live adapters, the adapter calls
	the real aggregator and returns the aggregator's response.
	"""
	from sente_rails.adapters.dispatch import get_payment_adapter

	intent = frappe.get_doc("Payment Intent", name)
	if intent.status != "Pending":
		frappe.throw(
			_("Payment Intent {0} is in status {1}; can only initiate from Pending.").format(
				name, intent.status
			)
		)

	asmt = frappe.get_doc("Assessment", intent.assessment)
	country = frappe.db.get_value("MDA", asmt.mda_default, "country") or "UG"
	adapter = get_payment_adapter(country, intent.channel, mda=asmt.mda_default)

	resp = adapter.initiate(intent)
	intent.aggregator_reference = resp.get("aggregator_reference")
	intent.sent_at = now_datetime()
	intent.status = "Sent"
	# Persist trace bundles for audit + walkthrough.
	import json as _json

	if resp.get("trace_request") is not None:
		intent.initiate_request_payload = _json.dumps(resp["trace_request"], indent=2, default=str)
	if resp.get("trace_response") is not None:
		intent.initiate_response_payload = _json.dumps(resp["trace_response"], indent=2, default=str)
	intent.save()
	return {"intent": _public_intent(intent), "adapter_response": resp}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="payments.initiate")
def confirm(name: str):
	"""Verify + confirm the payment with the adapter, then materialise
	Payment Events for each split.

	In production this is webhook-driven (the aggregator calls our
	/v1/webhooks/{provider} endpoint). For demo / clerk-triggered
	confirmation, this endpoint polls the adapter and creates the
	Payment Events synchronously.
	"""
	from sente_rails.adapters.dispatch import get_payment_adapter

	intent = frappe.get_doc("Payment Intent", name)
	if intent.status != "Sent":
		frappe.throw(
			_("Payment Intent {0} must be in Sent status to confirm; currently {1}.").format(
				name, intent.status
			)
		)

	asmt = frappe.get_doc("Assessment", intent.assessment)
	country = frappe.db.get_value("MDA", asmt.mda_default, "country") or "UG"
	adapter = get_payment_adapter(country, intent.channel, mda=asmt.mda_default)

	verify = adapter.verify(intent)
	# Persist the verify trace for audit.
	import json as _json

	if verify.get("trace_response") is not None:
		intent.verify_response_payload = _json.dumps(verify["trace_response"], indent=2, default=str)
	if verify.get("status") != "Confirmed":
		intent.failure_reason = verify.get("status") or "Unknown"
		intent.failed_at = now_datetime()
		intent.status = "Failed"
		intent.save()
		return {"intent": _public_intent(intent), "adapter_response": verify}

	intent.confirmed_at = now_datetime()
	intent.status = "Confirmed"
	intent.save()

	# Materialise Payment Events (one per MDA split)
	events = []
	for split in intent.split_rules:
		pe = frappe.get_doc(
			{
				"doctype": "Payment Event",
				"payment_intent": intent.name,
				"mda": split.mda,
				"amount": split.amount,
				"currency": intent.currency,
				"aggregator": intent.aggregator,
				"aggregator_txn_id": f"{verify.get('txn_id', intent.aggregator_reference)}-{split.mda}",
				"destination_account": split.destination_account,
				"received_at": now_datetime(),
				"proof_payload": frappe.as_json(verify),
			}
		).insert()
		events.append(_public_event(pe))

	# Mark the parent Assessment as Paid
	asmt.payment_status = "Confirmed"
	asmt.payment_channel = intent.channel
	asmt.payment_reference = intent.aggregator_reference
	asmt.paid_at = now_datetime()
	asmt.status = "Paid"
	asmt.save()

	# Fiscalise the settled receipt (issue the FDN). Non-fatal — a fiscal
	# failure never unwinds a confirmed payment.
	_maybe_fiscalise(intent, asmt)

	from sente_rails.api.v1.assessments import _public_assessment

	return {
		"intent": _public_intent(intent),
		"events": events,
		"assessment": _public_assessment(asmt),
	}


def _maybe_fiscalise(intent, assessment) -> None:
	"""Issue a fiscal document (FDN) for a settled receipt via the country's
	fiscal adapter (UG → URA EFRIS), and stamp it onto the Payment Intent so
	the receipt can print it.

	Deliberately fail-soft: the money is already received, so a fiscalisation
	error only marks the receipt as not-yet-fiscalised — it never throws back
	into the confirm path. Skips silently when the fiscal fields aren't
	migrated yet, or the country has no fiscal adapter configured.
	"""
	if not intent.meta.has_field("fdn"):
		return  # fiscal fields not migrated yet — nothing to stamp
	from sente_rails.adapters.dispatch import get_fiscal_adapter

	country = frappe.db.get_value("MDA", assessment.mda_default, "country") or "UG"
	try:
		adapter = get_fiscal_adapter(country)
	except Exception:
		return  # no fiscal adapter for this country — receipt stays non-fiscal
	try:
		res = adapter.fiscalise(assessment, intent)
		intent.db_set(
			{
				"fdn": res.get("fdn"),
				"fiscal_verification_code": res.get("verification_code"),
				"fiscal_qr_payload": res.get("qr_payload"),
				"fiscalised_at": now_datetime(),
				"fiscal_status": "Fiscalised",
				"fiscal_response_payload": frappe.as_json(res.get("raw_response") or res),
			},
			update_modified=False,
		)
	except Exception:
		frappe.log_error(title="EFRIS fiscalisation failed", message=frappe.get_traceback())
		try:
			intent.db_set("fiscal_status", "Failed", update_modified=False)
		except Exception:
			pass


def refund(name: str, reason: str = "", refunded_by: str | None = None, authorized_by: str | None = None) -> dict:
	"""Reverse a settled (Confirmed) payment and cancel its assessment.

	Internal — NOT a public /v1 endpoint. The only caller is the counter
	wrapper (work.refund_payment), which gates it behind a supervisor PIN.
	Refunds move money and waive collected revenue, so they never sit on the
	integrator Bearer surface; they're a counter action with a named
	authorising supervisor.

	For each Payment Event under the intent, calls the channel adapter's
	refund() (cash → counter-handback, mobile money / card → aggregator
	reversal), stamps the reversal onto the Payment Intent, and walks the
	Assessment to payment_status=Refunded / status=Cancelled.
	"""
	intent = frappe.get_doc("Payment Intent", name)
	if intent.status != "Confirmed":
		frappe.throw(
			_("Only a Confirmed payment can be refunded; {0} is {1}.").format(name, intent.status)
		)

	asmt = frappe.get_doc("Assessment", intent.assessment)
	country = frappe.db.get_value("MDA", asmt.mda_default, "country") or "UG"

	from sente_rails.adapters.dispatch import get_payment_adapter

	adapter = get_payment_adapter(country, intent.channel, mda=asmt.mda_default)

	refs: list[str] = []
	for ev_name in frappe.get_all("Payment Event", filters={"payment_intent": intent.name}, pluck="name"):
		ev = frappe.get_doc("Payment Event", ev_name)
		res = adapter.refund(ev, float(ev.amount or 0), reason)
		ref = res.get("refund_id") or res.get("status") or ""
		if ref:
			refs.append(str(ref))

	intent.status = "Refunded"
	if intent.meta.has_field("refunded_at"):
		intent.refunded_at = now_datetime()
		intent.refund_reason = reason or None
		intent.refund_reference = "\n".join(refs) or None
		intent.refunded_by = refunded_by or frappe.session.user
		intent.refund_authorized_by = authorized_by
	intent.save()

	asmt.payment_status = "Refunded"
	asmt.status = "Cancelled"
	stamp = f"\n[Refunded] {reason or '—'}"
	if authorized_by:
		stamp += f" (authorised by {authorized_by})"
	asmt.notes = (asmt.notes or "") + stamp
	asmt.save()

	from sente_rails.api.v1.assessments import _public_assessment

	return {
		"intent": _public_intent(intent),
		"assessment": _public_assessment(asmt),
		"refund_references": refs,
	}


@frappe.whitelist(allow_guest=True)
@sente_api(scope="payments.read")
def live_status(name: str):
	"""Re-query the aggregator LIVE for the current status of a Payment
	Intent. Read-only — does not mutate any Sente Rails state.

	Returns a side-by-side comparison of what we have stored versus what
	the aggregator says now. Designed for on-demand reconciliation —
	the rail asks the aggregator in real time and compares the response.
	"""
	from frappe.utils import now_datetime

	from sente_rails.adapters.dispatch import get_payment_adapter

	intent = frappe.get_doc("Payment Intent", name)
	asmt = frappe.get_doc("Assessment", intent.assessment)
	country = frappe.db.get_value("MDA", asmt.mda_default, "country") or "UG"
	adapter = get_payment_adapter(country, intent.channel, mda=asmt.mda_default)

	live = adapter.verify(intent)
	queried_at = now_datetime()

	stored_status = intent.status
	live_status = live.get("status", "Unknown")

	# Reduce status to a small set for the match check.
	match = (
		(stored_status == "Confirmed" and live_status == "Confirmed")
		or (stored_status == "Sent" and live_status in ("Sent", "Confirmed"))
		or (stored_status == "Failed" and live_status == "Failed")
	)

	return {
		"queried_at": str(queried_at),
		"aggregator": intent.aggregator or intent.channel,
		"aggregator_reference": intent.aggregator_reference,
		"stored": {
			"status": stored_status,
			"confirmed_at": str(intent.confirmed_at) if intent.confirmed_at else None,
			"amount": intent.amount,
			"currency": intent.currency,
		},
		"live": {
			"status": live_status,
			"txn_id": live.get("txn_id"),
			"amount": live.get("amount"),
			"currency": live.get("currency"),
			"settled_at": live.get("settled_at"),
			"stub": live.get("stub", False),
			"raw_response": live.get("raw_response") or live.get("trace_response", {}).get("body"),
		},
		"match": match,
	}


@frappe.whitelist(allow_guest=True)
@sente_api(scope="payments.read")
def trace(name: str):
	"""Return a unified audit-trail timeline for a Payment Intent.

	Assembles assessment context, intent lifecycle, split rules, payment
	events, and the verbatim adapter request/response payloads into a
	single document — designed for on-demand reconciliation and
	for OAG-grade audit evidence.

	Response shape:
	  {
	    "assessment":  {<key fields>, lines: [...]},
	    "intent":      {<key fields>, splits: [...], traces: {...}},
	    "events":      [{name, mda, amount, proof_payload, ...}],
	    "timeline":    [{at, kind, actor, summary, detail?}, ...]
	  }
	"""
	import json as _json

	intent = frappe.get_doc("Payment Intent", name)
	asmt = frappe.get_doc("Assessment", intent.assessment)
	events = frappe.get_all(
		"Payment Event",
		filters={"payment_intent": intent.name},
		fields=[
			"name",
			"mda",
			"amount",
			"currency",
			"aggregator",
			"aggregator_txn_id",
			"destination_account",
			"received_at",
			"proof_payload",
			"linked_journal_entry",
		],
		order_by="received_at asc",
	)

	def _parse(s):
		if not s:
			return None
		try:
			return _json.loads(s)
		except (_json.JSONDecodeError, TypeError):
			return s

	# Adapter traces — parse the stored JSON for cleaner consumption.
	traces = {
		"initiate_request": _parse(intent.initiate_request_payload),
		"initiate_response": _parse(intent.initiate_response_payload),
		"verify_response": _parse(intent.verify_response_payload),
	}

	# Per-event proof parsed too.
	for e in events:
		e["proof_payload"] = _parse(e.get("proof_payload"))

	# Timeline — interleave doctype mutations + adapter calls.
	timeline = []

	# Assessment lifecycle (Version doctype tracks each change)
	for d, b, ts in _version_changes("Assessment", asmt.name):
		timeline.append(
			{
				"at": ts,
				"kind": "assessment.update",
				"actor": b,
				"summary": _summarise_change(d),
				"doc": asmt.name,
			}
		)

	# Payment Intent lifecycle
	for d, b, ts in _version_changes("Payment Intent", intent.name):
		timeline.append(
			{
				"at": ts,
				"kind": "payment_intent.update",
				"actor": b,
				"summary": _summarise_change(d),
				"doc": intent.name,
			}
		)

	# Adapter calls (synthetic timeline rows from the stored timestamps)
	if intent.sent_at:
		timeline.append(
			{
				"at": str(intent.sent_at),
				"kind": "adapter.initiate",
				"actor": intent.aggregator or intent.channel,
				"summary": f"{intent.channel} :initiate → reference {intent.aggregator_reference}",
				"detail": traces["initiate_response"],
			}
		)
	if intent.confirmed_at:
		timeline.append(
			{
				"at": str(intent.confirmed_at),
				"kind": "adapter.verify",
				"actor": intent.aggregator or intent.channel,
				"summary": f"{intent.channel} :verify → {(traces['verify_response'] or {}).get('body', {}).get('status') if isinstance((traces['verify_response'] or {}).get('body'), dict) else 'Confirmed'}",
				"detail": traces["verify_response"],
			}
		)

	# Payment Events
	for e in events:
		timeline.append(
			{
				"at": str(e["received_at"]),
				"kind": "payment_event.created",
				"actor": e["aggregator"] or intent.aggregator,
				"summary": f"{e['mda']} settlement: {e['amount']} {e['currency']} → {e['destination_account']} (txn {e['aggregator_txn_id']})",
				"doc": e["name"],
			}
		)

	timeline.sort(key=lambda r: r["at"])

	return {
		"assessment": {
			"name": asmt.name,
			"status": asmt.status,
			"citizen": asmt.citizen,
			"transaction_date": str(asmt.transaction_date),
			"total_amount": asmt.total_amount,
			"currency": asmt.currency,
			"idempotency_key": asmt.idempotency_key,
			"paid_at": str(asmt.paid_at) if asmt.paid_at else None,
			"shift": asmt.shift,
			"lines": [
				{
					"mda": L.mda,
					"service": L.service,
					"service_name": L.service_name,
					"quantity": L.quantity,
					"rate": L.rate,
					"amount": L.amount,
					"efris_taxable": L.efris_taxable,
					"ura_prn": L.ura_prn,
					"efris_fdn": L.efris_fdn,
				}
				for L in asmt.assessment_lines
			],
		},
		"intent": {
			"name": intent.name,
			"status": intent.status,
			"channel": intent.channel,
			"aggregator": intent.aggregator,
			"aggregator_reference": intent.aggregator_reference,
			"amount": intent.amount,
			"currency": intent.currency,
			"citizen_msisdn": intent.citizen_msisdn,
			"sent_at": str(intent.sent_at) if intent.sent_at else None,
			"confirmed_at": str(intent.confirmed_at) if intent.confirmed_at else None,
			"failed_at": str(intent.failed_at) if intent.failed_at else None,
			"idempotency_key": intent.idempotency_key,
			"splits": [
				{
					"mda": s.mda,
					"amount": s.amount,
					"destination_account": s.destination_account,
					"destination_account_type": s.destination_account_type,
				}
				for s in intent.split_rules
			],
			"traces": traces,
		},
		"events": events,
		"timeline": timeline,
	}


def _version_changes(doctype: str, docname: str):
	"""Yield (data_dict, modified_by, modified) for each Version row."""
	import json as _json

	rows = frappe.get_all(
		"Version",
		filters={"ref_doctype": doctype, "docname": docname},
		fields=["modified", "modified_by", "data"],
		order_by="modified asc",
	)
	for r in rows:
		try:
			data = _json.loads(r["data"]) if r["data"] else {}
		except (_json.JSONDecodeError, TypeError):
			data = {}
		yield data, r["modified_by"], str(r["modified"])


def _summarise_change(data: dict) -> str:
	"""One-line summary of a Version diff."""
	if not data:
		return "(mutation)"
	parts = []
	for ch in (data.get("changed") or [])[:3]:
		field, old, new = (ch + [""] * 3)[:3]
		parts.append(f"{field}: {old or '∅'} → {new or '∅'}")
	if data.get("added"):
		parts.append(f"+{len(data['added'])} child rows")
	if data.get("removed"):
		parts.append(f"−{len(data['removed'])} child rows")
	return "; ".join(parts) or "(mutation)"


@frappe.whitelist(allow_guest=True)
@sente_api(scope="payments.read")
def list_events(
	intent: str | None = None,
	mda: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	start: int = 0,
	limit: int = 50,
):
	"""List Payment Events filtered by intent / MDA / date range."""
	filters: dict = {}
	if intent:
		filters["payment_intent"] = intent
	if mda:
		filters["mda"] = mda
	if from_date and to_date:
		filters["received_at"] = ["between", [from_date, to_date]]
	return frappe.get_all(
		"Payment Event",
		filters=filters,
		fields=list(_PUBLIC_EVENT_FIELDS),
		start=int(start),
		page_length=min(int(limit), 200),
		order_by="received_at desc",
	)
