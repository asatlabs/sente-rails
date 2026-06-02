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
"""Sente Rails public API v1 — Supervisor dashboard aggregates + variance workflow.

Powers the /supervisor surface. The supervisor of an MDA needs three
families of answers in real time at the end of every shift cycle:

1. **Today's headline numbers** — how much was collected, how many
   counters are still open, how many are closing right now (cash
   counted but variance unresolved).
2. **Per-counter drill** — which clerks, what status, how many
   transactions, any variance.
3. **Breakdown by service + by channel** — where the money came from
   and how it was paid, so the supervisor can spot a channel outage
   or an outlier service line.

Plus three actions on a flagged shift: approve the variance reason
(closes the chain of custody), reject (sends back to the clerk for a
re-count), or escalate (raises a Treasurer ticket).
"""

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime, today

from sente_rails.api.keys.auth import sente_api


@frappe.whitelist(allow_guest=True)
@sente_api(scope="assessments.read")
def dashboard(mda: str | None = None, date: str | None = None):
	"""Return the supervisor dashboard payload for one MDA + one day.

	Both `mda` and `date` are optional:
	- If `mda` is omitted, we infer it from the first MDA the calling
	  user holds an Assessment / Shift permission on. A supervisor is
	  usually scoped to a single MDA; this fallback
	  keeps callers from needing query-string fiddling.
	- If `date` is omitted, defaults to today (server-local).

	Returns a single JSON object — never a list. Empty days return
	zeroed tiles + empty lists rather than 404, so the page renders
	cleanly even when there's no activity.
	"""
	target_date = getdate(date) if date else getdate(today())
	mda = mda or _infer_mda_for_user()

	if not mda:
		return _empty_payload(mda=None, date=target_date)

	mda_doc = frappe.db.get_value("MDA", mda, ["short_code", "full_name"], as_dict=True)
	if not mda_doc:
		frappe.throw(_("MDA {0} not found").format(mda), frappe.DoesNotExistError)

	shifts = _list_shifts_for(mda, target_date)
	totals = _totals_for(shifts)
	by_service = _by_service(mda, target_date)
	by_channel = _by_channel(shifts)
	variance_queue = _variance_queue(shifts)
	corrections = _corrections_for(mda, target_date)
	flags = _open_flags_for(mda, target_date, shifts)

	return {
		"mda": mda_doc.short_code,
		"mda_name": mda_doc.full_name,
		"date": str(target_date),
		"is_today": target_date == getdate(today()),
		"totals": totals,
		"counters": _counters(totals, corrections, flags, variance_queue),
		"variance_queue": variance_queue,
		"shifts": shifts,
		"by_service": by_service,
		"by_channel": by_channel,
		"corrections": corrections,
		"flags": flags,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def resolve_flag(name: str, status: str = "Resolved", note: str | None = None):
	"""Supervisor triages an anomaly flag: Investigating / Resolved / False
	Positive / Escalated. Stamps the actor + note for the audit trail."""
	allowed = {"Investigating", "Resolved", "False Positive", "Escalated"}
	if status not in allowed:
		frappe.throw(_("Invalid flag status {0}.").format(status), frappe.ValidationError)
	flag = frappe.get_doc("Anomaly Flag", name)
	flag.status = status
	flag.assigned_to = frappe.session.user
	if status in ("Resolved", "False Positive"):
		flag.resolved_at = now_datetime()
	flag.resolution_notes = _append_note(flag.resolution_notes, _audit_stamp(status.upper(), note))
	flag.save()
	frappe.db.commit()
	return {"name": flag.name, "status": status}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def approve_variance(name: str, note: str | None = None):
	"""Supervisor signs off on the clerk's stated variance reason.

	Closes the chain of custody — the shift is already Closed, this
	just stamps the approval in the closing_notes audit blob.
	"""
	shift = _load_closed_shift(name)
	stamp = _audit_stamp("APPROVE", note)
	shift.db_set("closing_notes", _append_note(shift.closing_notes, stamp))
	frappe.db.commit()
	return {"name": shift.name, "action": "approved", "stamped": stamp}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def reject_variance(name: str, note: str | None = None):
	"""Send the shift back to the clerk for a re-count.

	Reopens the shift (status → Open) and stamps the rejection note so
	the clerk sees why they're being asked to look again.
	"""
	if not note:
		frappe.throw(_("A rejection reason is required."), frappe.ValidationError)
	shift = _load_closed_shift(name)
	stamp = _audit_stamp("REJECT", note)
	shift.db_set("closing_notes", _append_note(shift.closing_notes, stamp))
	shift.db_set("status", "Open")
	shift.db_set("closed_at", None)
	frappe.db.commit()
	return {"name": shift.name, "action": "rejected", "stamped": stamp}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@sente_api(scope="assessments.write")
def escalate_variance(name: str, note: str | None = None):
	"""Raise the variance to the Treasurer — for now this
	just stamps the note; the /treasury surface (P1) will read it."""
	if not note:
		frappe.throw(_("An escalation reason is required."), frappe.ValidationError)
	shift = _load_closed_shift(name)
	stamp = _audit_stamp("ESCALATE", note)
	shift.db_set("closing_notes", _append_note(shift.closing_notes, stamp))
	frappe.db.commit()
	return {"name": shift.name, "action": "escalated", "stamped": stamp}


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────


def _infer_mda_for_user() -> str | None:
	"""Pick the MDA the calling user most recently worked under.

	Falls back to the first MDA in the system so the dashboard renders
	*something* on a freshly-seeded bench. The user can always pass
	?mda=XYZ explicitly.
	"""
	user = frappe.session.user
	if user and user != "Guest":
		row = frappe.db.sql(
			"""SELECT mda FROM `tabCounter Shift`
			   WHERE clerk=%s ORDER BY opened_at DESC LIMIT 1""",
			(user,),
		)
		if row and row[0][0]:
			return row[0][0]
	first = frappe.db.get_value("MDA", {}, "name", order_by="creation asc")
	return first


def _list_shifts_for(mda: str, target_date) -> list[dict]:
	"""All shifts opened on `target_date` (whether closed or still open).

	A shift that opened the previous day and is still running shows
	up too — we filter by opened_at::date but also include any shift
	whose status is Open regardless of date, because the supervisor
	needs to see anyone still on the floor.
	"""
	rows = frappe.db.sql(
		"""
		SELECT cs.name, cs.clerk, cs.counter_label, cs.status,
		       cs.opened_at, cs.closed_at,
		       cs.assessment_count, cs.total_collected,
		       cs.cash_counted, cs.cash_expected, cs.cash_variance,
		       cs.variance_reason, cs.closing_notes
		FROM `tabCounter Shift` cs
		WHERE cs.mda = %(mda)s
		  AND (DATE(cs.opened_at) = %(d)s OR cs.status = 'Open')
		ORDER BY
		  CASE cs.status WHEN 'Open' THEN 0 ELSE 1 END,
		  cs.opened_at DESC
		""",
		{"mda": mda, "d": target_date},
		as_dict=True,
	)
	now = now_datetime()
	enriched = []
	for row in rows:
		clerk_name = frappe.db.get_value("User", row.clerk, "full_name") or row.clerk
		opened = row.opened_at
		closed = row.closed_at
		end = closed or now
		minutes = int((end - opened).total_seconds() // 60) if opened else 0
		variance = float(row.cash_variance or 0)
		closing_now = row.status == "Open" and row.cash_counted is not None
		enriched.append(
			{
				"name": row.name,
				"clerk": row.clerk,
				"clerk_name": clerk_name,
				"counter_label": row.counter_label or "—",
				"status": row.status,
				"opened_at": row.opened_at.isoformat() if row.opened_at else None,
				"closed_at": row.closed_at.isoformat() if row.closed_at else None,
				"duration_minutes": minutes,
				"transactions": int(row.assessment_count or 0),
				"total_collected": float(row.total_collected or 0),
				"cash_counted": float(row.cash_counted) if row.cash_counted is not None else None,
				"cash_expected": float(row.cash_expected) if row.cash_expected is not None else None,
				"cash_variance": variance,
				"variance_flag": abs(variance) >= 1,
				"variance_reason": row.variance_reason,
				"closing_notes": row.closing_notes,
				"closing_now": closing_now,
				"last_action": _latest_action(row.closing_notes),
			}
		)
	return enriched


def _totals_for(shifts: list[dict]) -> dict:
	total_collected = sum(s["total_collected"] for s in shifts)
	open_count = sum(1 for s in shifts if s["status"] == "Open")
	closing_now = sum(1 for s in shifts if s["closing_now"])
	variance_count = sum(1 for s in shifts if s["variance_flag"])
	closed_count = sum(1 for s in shifts if s["status"] == "Closed")
	return {
		"total_collected": round(total_collected, 2),
		"open_shifts": open_count,
		"closing_now": closing_now,
		"variance_shifts": variance_count,
		"closed_shifts": closed_count,
		"shift_count": len(shifts),
	}


def _by_service(mda: str, target_date) -> list[dict]:
	"""Sum Assessment Line amounts by service for the MDA + day.

	Only counts lines whose parent Assessment is linked to a Shift
	opened on `target_date` — anchors the breakdown to the same
	window the supervisor is looking at.
	"""
	rows = frappe.db.sql(
		"""
		SELECT al.service AS service,
		       MAX(al.service_name) AS service_name,
		       SUM(al.amount) AS total
		FROM `tabAssessment Line` al
		JOIN `tabAssessment`      a  ON a.name = al.parent
		JOIN `tabCounter Shift`   cs ON cs.name = a.shift
		WHERE al.mda = %(mda)s
		  AND DATE(cs.opened_at) = %(d)s
		  AND a.status IN ('Assessed', 'Paid')
		GROUP BY al.service
		ORDER BY total DESC
		""",
		{"mda": mda, "d": target_date},
		as_dict=True,
	)
	return [
		{
			"service": r.service,
			"service_name": r.service_name or r.service,
			"total": float(r.total or 0),
		}
		for r in rows
	]


def _by_channel(shifts: list[dict]) -> list[dict]:
	"""Pull per-channel totals straight off the shift aggregate fields.

	Reuses the same numbers Counter Shift already maintains via its
	`refresh_aggregates` path — no double-counting risk.
	"""
	buckets = {
		"MTN MoMo": 0.0,
		"Airtel Money": 0.0,
		"Card": 0.0,
		"Bank Transfer": 0.0,
		"Cash": 0.0,
		"Voucher": 0.0,
	}
	# Fetch the channel-named columns in one go to avoid N+1.
	if not shifts:
		return _channels_sorted(buckets)
	names = [s["name"] for s in shifts]
	rows = frappe.db.get_all(
		"Counter Shift",
		filters={"name": ["in", names]},
		fields=[
			"momo_collected",
			"airtel_collected",
			"card_collected",
			"bank_collected",
			"cash_collected",
			"voucher_collected",
		],
	)
	for r in rows:
		buckets["MTN MoMo"] += float(r.momo_collected or 0)
		buckets["Airtel Money"] += float(r.airtel_collected or 0)
		buckets["Card"] += float(r.card_collected or 0)
		buckets["Bank Transfer"] += float(r.bank_collected or 0)
		buckets["Cash"] += float(r.cash_collected or 0)
		buckets["Voucher"] += float(r.voucher_collected or 0)
	return _channels_sorted(buckets)


def _channels_sorted(buckets: dict) -> list[dict]:
	total = sum(buckets.values()) or 0.0
	out = []
	for channel, amount in buckets.items():
		share = (amount / total * 100.0) if total > 0 else 0.0
		out.append({"channel": channel, "total": round(amount, 2), "share_pct": round(share, 1)})
	out.sort(key=lambda r: r["total"], reverse=True)
	return out


def _variance_queue(shifts: list[dict]) -> list[dict]:
	"""Closed shifts carrying a real cash variance a supervisor hasn't signed
	off on yet — the approval queue. Shape matches what the cockpit table
	renders (expected_total / counted_total / variance)."""
	out = []
	for s in shifts:
		if s["status"] != "Closed" or not s.get("variance_flag"):
			continue
		if s.get("last_action") == "approved":
			continue
		out.append(
			{
				"name": s["name"],
				"clerk": s.get("clerk_name") or s.get("clerk"),
				"expected_total": s.get("cash_expected") or 0,
				"counted_total": s.get("cash_counted") or 0,
				"variance": s.get("cash_variance") or 0,
				"variance_reason": s.get("variance_reason"),
			}
		)
	return out


def _corrections_for(mda: str, target_date) -> dict:
	"""Refunds + waivers booked during this MDA's shifts on `target_date`,
	each carrying the supervisor who authorised it — the corrections ledger."""
	refunds = frappe.db.sql(
		"""
		SELECT pi.name AS intent, pi.amount AS amount, pi.refund_reason AS reason,
		       pi.refunded_by AS clerk, pi.refund_authorized_by AS authorized_by,
		       pi.refunded_at AS at, a.citizen AS citizen
		FROM `tabPayment Intent` pi
		JOIN `tabAssessment` a ON a.name = pi.assessment
		JOIN `tabCounter Shift` cs ON cs.name = a.shift
		WHERE cs.mda = %(mda)s AND DATE(cs.opened_at) = %(d)s AND pi.status = 'Refunded'
		ORDER BY pi.refunded_at DESC
		""",
		{"mda": mda, "d": target_date},
		as_dict=True,
	)
	waivers = frappe.db.sql(
		"""
		SELECT a.name AS assessment, a.discount_amount AS amount, a.discount_reason AS reason,
		       a.discount_authorized_by AS authorized_by, a.gross_amount AS gross,
		       a.total_amount AS net, a.citizen AS citizen
		FROM `tabAssessment` a
		JOIN `tabCounter Shift` cs ON cs.name = a.shift
		WHERE cs.mda = %(mda)s AND DATE(cs.opened_at) = %(d)s AND IFNULL(a.discount_amount, 0) > 0
		ORDER BY a.modified DESC
		""",
		{"mda": mda, "d": target_date},
		as_dict=True,
	)
	return {
		"refunds": [
			{
				"intent": r.intent,
				"amount": float(r.amount or 0),
				"reason": r.reason,
				"clerk": r.clerk,
				"authorized_by": r.authorized_by,
				"at": r.at.isoformat() if r.at else None,
				"citizen": r.citizen,
			}
			for r in refunds
		],
		"waivers": [
			{
				"assessment": w.assessment,
				"amount": float(w.amount or 0),
				"reason": w.reason,
				"authorized_by": w.authorized_by,
				"gross": float(w.gross or 0),
				"net": float(w.net or 0),
				"citizen": w.citizen,
			}
			for w in waivers
		],
	}


def _open_flags_for(mda: str, target_date, shifts: list[dict]) -> list[dict]:
	"""Open anomaly flags whose referenced doc belongs to this MDA's day:
	Cash Variance (→ Counter Shift) and Unusual Amount / Duplicate (→
	Assessment). Severity-ordered."""
	shift_names = [s["name"] for s in shifts]
	asmt_names = frappe.db.sql_list(
		"""
		SELECT a.name FROM `tabAssessment` a
		JOIN `tabCounter Shift` cs ON cs.name = a.shift
		WHERE cs.mda = %(mda)s AND DATE(cs.opened_at) = %(d)s
		""",
		{"mda": mda, "d": target_date},
	)
	conditions = []
	params: dict = {}
	if shift_names:
		conditions.append("(reference_doctype='Counter Shift' AND reference_name IN %(shifts)s)")
		params["shifts"] = tuple(shift_names)
	if asmt_names:
		conditions.append("(reference_doctype='Assessment' AND reference_name IN %(asmts)s)")
		params["asmts"] = tuple(asmt_names)
	if not conditions:
		return []
	rows = frappe.db.sql(
		f"""
		SELECT name, flag_type, severity, status, flagged_at, reference_doctype,
		       reference_name, description, signal_value, threshold
		FROM `tabAnomaly Flag`
		WHERE status IN ('Open', 'Investigating', 'Escalated') AND ({' OR '.join(conditions)})
		ORDER BY FIELD(severity, 'Critical', 'High', 'Medium', 'Low'), flagged_at DESC
		LIMIT 50
		""",
		params,
		as_dict=True,
	)
	return [
		{
			"name": r.name,
			"flag_type": r.flag_type,
			"severity": r.severity,
			"status": r.status,
			"flagged_at": r.flagged_at.isoformat() if r.flagged_at else None,
			"reference_doctype": r.reference_doctype,
			"reference_name": r.reference_name,
			"description": r.description,
			"signal_value": float(r.signal_value or 0),
			"threshold": float(r.threshold or 0),
		}
		for r in rows
	]


def _counters(totals: dict, corrections: dict, flags: list, variance_queue: list, currency: str = "UGX") -> dict:
	"""Flat tile values for the cockpit header."""
	return {
		"collected_today": round(float(totals.get("total_collected") or 0), 2),
		"currency": currency,
		"open_shifts": totals.get("open_shifts", 0),
		"variances_pending": len(variance_queue),
		"refunds_today": len(corrections["refunds"]),
		"refunds_amount": round(sum(r["amount"] for r in corrections["refunds"]), 2),
		"waivers_today": len(corrections["waivers"]),
		"waivers_amount": round(sum(w["amount"] for w in corrections["waivers"]), 2),
		"open_flags": len(flags),
	}


def _load_closed_shift(name: str):
	if not frappe.db.exists("Counter Shift", name):
		frappe.throw(_("Shift {0} not found").format(name), frappe.DoesNotExistError)
	shift = frappe.get_doc("Counter Shift", name)
	if shift.status not in ("Closed", "Open"):
		frappe.throw(_("Shift {0} cannot be actioned in state {1}").format(name, shift.status))
	return shift


def _audit_stamp(action: str, note: str | None) -> str:
	user = frappe.session.user or "system"
	ts = now_datetime().strftime("%Y-%m-%d %H:%M:%S")
	body = (note or "").strip()
	return f"[{ts} · {action} by {user}]" + (f" {body}" if body else "")


def _append_note(existing: str | None, line: str) -> str:
	existing = (existing or "").rstrip()
	if not existing:
		return line
	return existing + "\n" + line


def _latest_action(closing_notes: str | None) -> str | None:
	"""Pull the most recent supervisor-action marker out of closing_notes
	so the dashboard can chip it ('approved by …', 'rejected by …').
	"""
	if not closing_notes:
		return None
	for line in reversed(closing_notes.strip().splitlines()):
		line = line.strip()
		for marker in ("APPROVE", "REJECT", "ESCALATE"):
			if marker in line:
				return marker.lower() + ("d" if marker.endswith("E") else "ed")
	return None


def _empty_payload(mda: str | None, date) -> dict:
	return {
		"mda": mda,
		"mda_name": None,
		"date": str(date),
		"is_today": date == getdate(today()),
		"totals": {
			"total_collected": 0.0,
			"open_shifts": 0,
			"closing_now": 0,
			"variance_shifts": 0,
			"closed_shifts": 0,
			"shift_count": 0,
		},
		"counters": {
			"collected_today": 0.0,
			"currency": "UGX",
			"open_shifts": 0,
			"variances_pending": 0,
			"refunds_today": 0,
			"refunds_amount": 0.0,
			"waivers_today": 0,
			"waivers_amount": 0.0,
			"open_flags": 0,
		},
		"variance_queue": [],
		"shifts": [],
		"by_service": [],
		"by_channel": _channels_sorted(
			{k: 0.0 for k in ("MTN MoMo", "Airtel Money", "Card", "Bank Transfer", "Cash", "Voucher")}
		),
		"corrections": {"refunds": [], "waivers": []},
		"flags": [],
	}
