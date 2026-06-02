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
Oversight API — /v1/oversight/*.

Item 3.2 of docs/IMPLEMENTATION_PLAN.md. Read-only endpoints for OAG
(Office of the Auditor General) and external oversight integrators
that need aggregated revenue / anomaly / consent / event-stream views
across MDAs without granting write access anywhere.

Every endpoint requires the `oversight.read` scope on the caller's
Sente API Key. Stub scope guarding today; in Phase 3 the scope grant
will be tied to the Sente Rails OAG operator role rather than free-form.
"""

from typing import Optional

import frappe

from sente_rails.api.keys.auth import sente_api

_OVERSIGHT_SCOPE = "oversight.read"


# ---------------------------------------------------------------- aggregates


@frappe.whitelist(allow_guest=True)
@sente_api(scope=_OVERSIGHT_SCOPE)
def aggregates(
	period_start: str,
	period_end: str,
	period_type: str = "Daily",
	mda: str | None = None,
	district: str | None = None,
):
	"""Revenue + transaction roll-up over a date window.

	Grouping key defaults to MDA. When `district` is provided the
	output is grouped by district (Citizen.district) instead. When
	both `mda` and `district` are present, results are filtered to
	the named MDA AND grouped by district within it.

	Args:
	    period_start: ISO date (inclusive).
	    period_end:   ISO date (inclusive — query uses < next-day).
	    period_type:  Currently informational only; reserved for
	                  later use (e.g. forcing a rolling window).
	    mda:          Optional MDA filter.
	    district:     If set, group by district; otherwise group by MDA.
	"""
	if not period_start or not period_end:
		frappe.throw("period_start and period_end are required.")
	from frappe.utils import add_days

	end_exclusive = add_days(period_end, 1)
	filters = {"start": period_start, "end_exclusive": end_exclusive}
	mda_clause = ""
	if mda:
		mda_clause = "AND pe.mda = %(mda)s"
		filters["mda"] = mda

	if district:
		# Group by Citizen.district via Assessment.citizen → Citizen.district
		rows = frappe.db.sql(
			f"""
			SELECT
			    COALESCE(c.district, '(unknown)') AS group_key,
			    SUM(pe.amount) AS total_collected,
			    COUNT(*) AS transaction_count,
			    AVG(pe.amount) AS average_amount,
			    COUNT(DISTINCT pi.assessment) AS distinct_assessments,
			    COUNT(DISTINCT a.citizen) AS distinct_citizens
			FROM `tabPayment Event` pe
			JOIN `tabPayment Intent` pi ON pi.name = pe.payment_intent
			JOIN `tabAssessment` a ON a.name = pi.assessment
			LEFT JOIN `tabCitizen` c ON c.name = a.citizen
			WHERE pe.received_at >= %(start)s
			  AND pe.received_at < %(end_exclusive)s
			  {mda_clause}
			GROUP BY group_key
			ORDER BY total_collected DESC
			""",
			filters,
			as_dict=True,
		)
	else:
		rows = frappe.db.sql(
			"""
			SELECT
			    pe.mda AS group_key,
			    SUM(pe.amount) AS total_collected,
			    COUNT(*) AS transaction_count,
			    AVG(pe.amount) AS average_amount,
			    COUNT(DISTINCT pi.assessment) AS distinct_assessments,
			    COUNT(DISTINCT a.citizen) AS distinct_citizens
			FROM `tabPayment Event` pe
			JOIN `tabPayment Intent` pi ON pi.name = pe.payment_intent
			LEFT JOIN `tabAssessment` a ON a.name = pi.assessment
			WHERE pe.received_at >= %(start)s
			  AND pe.received_at < %(end_exclusive)s
			GROUP BY pe.mda
			ORDER BY total_collected DESC
			""",
			filters,
			as_dict=True,
		)

	# Top 5 services per group_key
	top_services_by_group = _top_services_per_group(
		group_field="district" if district else "mda",
		filters=filters,
		mda_clause=mda_clause,
	)
	for r in rows:
		r["top_services"] = top_services_by_group.get(r["group_key"], [])

	return {
		"period_start": period_start,
		"period_end": period_end,
		"period_type": period_type,
		"grouped_by": "district" if district else "mda",
		"mda_filter": mda or "",
		"row_count": len(rows),
		"rows": rows,
	}


def _top_services_per_group(group_field: str, filters: dict, mda_clause: str) -> dict:
	"""Compute top 5 services per group_key (mda or district)."""
	if group_field == "district":
		rows = frappe.db.sql(
			f"""
			SELECT
			    COALESCE(c.district, '(unknown)') AS group_key,
			    al.service AS service,
			    SUM(al.amount) AS service_total
			FROM `tabAssessment Line` al
			JOIN `tabAssessment` a ON a.name = al.parent
			JOIN `tabPayment Intent` pi ON pi.assessment = a.name
			JOIN `tabPayment Event` pe ON pe.payment_intent = pi.name
			LEFT JOIN `tabCitizen` c ON c.name = a.citizen
			WHERE pe.received_at >= %(start)s
			  AND pe.received_at < %(end_exclusive)s
			  {mda_clause}
			GROUP BY group_key, al.service
			ORDER BY group_key, service_total DESC
			""",
			filters,
			as_dict=True,
		)
	else:
		rows = frappe.db.sql(
			"""
			SELECT
			    pe.mda AS group_key,
			    al.service AS service,
			    SUM(al.amount) AS service_total
			FROM `tabAssessment Line` al
			JOIN `tabAssessment` a ON a.name = al.parent
			JOIN `tabPayment Intent` pi ON pi.assessment = a.name
			JOIN `tabPayment Event` pe ON pe.payment_intent = pi.name
			WHERE pe.received_at >= %(start)s
			  AND pe.received_at < %(end_exclusive)s
			GROUP BY pe.mda, al.service
			ORDER BY pe.mda, service_total DESC
			""",
			filters,
			as_dict=True,
		)
	out: dict = {}
	for r in rows:
		bucket = out.setdefault(r["group_key"], [])
		if len(bucket) < 5:
			bucket.append({"service": r["service"], "total": float(r["service_total"] or 0)})
	return out


# ---------------------------------------------------------------- audit trail


@frappe.whitelist(allow_guest=True)
@sente_api(scope=_OVERSIGHT_SCOPE)
def audit_trail(doctype: str | None = None, docname: str | None = None, name: str | None = None):
	"""Full Version history for a given (doctype, docname). Returns the
	raw Version rows the platform records on every save.

	The record id is `docname` (the documented param); `name` is accepted
	as a back-compat alias. Both args are keyword-optional so a missing one
	returns a clean validation error instead of a positional-arg 500.
	"""
	docname = docname or name
	if not doctype or not docname:
		frappe.throw("doctype and docname are required.")
	versions = frappe.db.sql(
		"""
		SELECT name, creation, owner, data
		FROM `tabVersion`
		WHERE ref_doctype = %(dt)s AND docname = %(dn)s
		ORDER BY creation DESC
		""",
		{"dt": doctype, "dn": docname},
		as_dict=True,
	)
	return {
		"doctype": doctype,
		"docname": docname,
		"version_count": len(versions),
		"versions": versions,
	}


# ---------------------------------------------------------------- anomaly flags


@frappe.whitelist(allow_guest=True)
@sente_api(scope=_OVERSIGHT_SCOPE)
def anomaly_flags(
	status: str = "Open",
	severity: str | None = None,
	flag_type: str | None = None,
	limit: int = 50,
	offset: int = 0,
):
	"""Paginated list of Anomaly Flag rows."""
	limit = max(1, min(int(limit), 500))
	offset = max(0, int(offset))
	filters = {"status": status} if status else {}
	if severity:
		filters["severity"] = severity
	if flag_type:
		filters["flag_type"] = flag_type
	rows = frappe.get_all(
		"Anomaly Flag",
		filters=filters,
		fields=[
			"name",
			"flag_type",
			"severity",
			"status",
			"flagged_at",
			"reference_doctype",
			"reference_name",
			"detection_rule",
			"signal_value",
			"threshold",
			"description",
			"flagged_by",
			"assigned_to",
			"resolved_at",
		],
		order_by="flagged_at desc",
		limit_page_length=limit,
		limit_start=offset,
	)
	total = frappe.db.count("Anomaly Flag", filters=filters)
	return {
		"limit": limit,
		"offset": offset,
		"total": total,
		"rows": rows,
	}


# ---------------------------------------------------------------- consent


@frappe.whitelist(allow_guest=True)
@sente_api(scope=_OVERSIGHT_SCOPE)
def citizen_consent(mda: str | None = None, purpose: str | None = None):
	"""Active consent counts grouped by (mda, purpose).

	Active = granted=1 AND revoked_at IS NULL AND
	(expiry_at IS NULL OR expiry_at >= today).
	"""
	from frappe.utils import today

	filters = {"target": today()}
	where_extra = ""
	if mda:
		where_extra += " AND mda = %(mda)s"
		filters["mda"] = mda
	if purpose:
		where_extra += " AND purpose = %(purpose)s"
		filters["purpose"] = purpose
	rows = frappe.db.sql(
		f"""
		SELECT mda, purpose, COUNT(*) AS active_consents
		FROM `tabCitizen Consent Event`
		WHERE granted = 1
		  AND revoked_at IS NULL
		  AND (expiry_at IS NULL OR expiry_at >= %(target)s)
		  {where_extra}
		GROUP BY mda, purpose
		ORDER BY mda, purpose
		""",
		filters,
		as_dict=True,
	)
	return {
		"mda_filter": mda or "",
		"purpose_filter": purpose or "",
		"as_of": str(filters["target"]),
		"row_count": len(rows),
		"rows": rows,
	}


# ---------------------------------------------------------------- payment events stream


@frappe.whitelist(allow_guest=True)
@sente_api(scope=_OVERSIGHT_SCOPE)
def payment_events(after: str | None = None, limit: int = 100):
	"""Cursor-paginated raw Payment Event stream. Cursor is the
	`received_at` of the last row in the previous page; clients
	call with `after=<that timestamp>` to get the next page.
	"""
	limit = max(1, min(int(limit), 500))
	where_clause = ""
	params: dict = {"limit": limit}
	if after:
		where_clause = "WHERE pe.received_at > %(after)s"
		params["after"] = after
	rows = frappe.db.sql(
		f"""
		SELECT
		    pe.name,
		    pe.payment_intent,
		    pe.mda,
		    pe.aggregator,
		    pe.aggregator_txn_id,
		    pe.amount,
		    pe.currency,
		    pe.received_at,
		    pi.assessment,
		    pi.channel,
		    a.citizen
		FROM `tabPayment Event` pe
		LEFT JOIN `tabPayment Intent` pi ON pi.name = pe.payment_intent
		LEFT JOIN `tabAssessment` a ON a.name = pi.assessment
		{where_clause}
		ORDER BY pe.received_at ASC
		LIMIT %(limit)s
		""",
		params,
		as_dict=True,
	)
	next_cursor = str(rows[-1]["received_at"]) if rows else (after or "")
	return {
		"limit": limit,
		"after": after or "",
		"row_count": len(rows),
		"next_cursor": next_cursor,
		"rows": rows,
	}


# ---------------------------------------------------------------- UBOS statistics

# Supported metrics. Each maps to an internal renderer that returns a
# list of row dicts.
_METRIC_RENDERERS = {
	"revenue_by_sector",
	"transactions_by_district",
	"taxpayer_count",
}


@frappe.whitelist(allow_guest=True)
@sente_api(scope=_OVERSIGHT_SCOPE)
def statistics(
	metric: str,
	period_start: str,
	period_end: str,
	geography: str | None = None,
):
	"""UBOS-shaped aggregate. Three metrics today:

	- revenue_by_sector — totals per Service.sector across the window
	- transactions_by_district — count + total per Citizen.district
	- taxpayer_count — distinct paying citizens (optionally per district)
	"""
	if metric not in _METRIC_RENDERERS:
		frappe.throw(f"Unknown metric {metric!r}. Supported: {sorted(_METRIC_RENDERERS)}")
	if not period_start or not period_end:
		frappe.throw("period_start and period_end are required.")
	from frappe.utils import add_days

	end_exclusive = add_days(period_end, 1)
	params: dict = {"start": period_start, "end_exclusive": end_exclusive}
	geo_clause = ""
	if geography:
		geo_clause = "AND COALESCE(c.district, '(unknown)') = %(geo)s"
		params["geo"] = geography

	if metric == "revenue_by_sector":
		rows = frappe.db.sql(
			f"""
			SELECT
			    COALESCE(s.sector, '(unknown)') AS sector,
			    SUM(al.amount) AS total_revenue,
			    COUNT(DISTINCT al.parent) AS assessment_count,
			    COUNT(*) AS line_count
			FROM `tabAssessment Line` al
			JOIN `tabService` s ON s.name = al.service
			JOIN `tabAssessment` a ON a.name = al.parent
			JOIN `tabPayment Intent` pi ON pi.assessment = a.name
			JOIN `tabPayment Event` pe ON pe.payment_intent = pi.name
			LEFT JOIN `tabCitizen` c ON c.name = a.citizen
			WHERE pe.received_at >= %(start)s
			  AND pe.received_at < %(end_exclusive)s
			  {geo_clause}
			GROUP BY s.sector
			ORDER BY total_revenue DESC
			""",
			params,
			as_dict=True,
		)
	elif metric == "transactions_by_district":
		rows = frappe.db.sql(
			"""
			SELECT
			    COALESCE(c.district, '(unknown)') AS district,
			    COUNT(*) AS transaction_count,
			    SUM(pe.amount) AS total_amount
			FROM `tabPayment Event` pe
			JOIN `tabPayment Intent` pi ON pi.name = pe.payment_intent
			JOIN `tabAssessment` a ON a.name = pi.assessment
			LEFT JOIN `tabCitizen` c ON c.name = a.citizen
			WHERE pe.received_at >= %(start)s
			  AND pe.received_at < %(end_exclusive)s
			GROUP BY district
			ORDER BY transaction_count DESC
			""",
			params,
			as_dict=True,
		)
	else:  # taxpayer_count
		rows = frappe.db.sql(
			f"""
			SELECT
			    COALESCE(c.district, '(unknown)') AS district,
			    COUNT(DISTINCT a.citizen) AS taxpayer_count
			FROM `tabPayment Event` pe
			JOIN `tabPayment Intent` pi ON pi.name = pe.payment_intent
			JOIN `tabAssessment` a ON a.name = pi.assessment
			LEFT JOIN `tabCitizen` c ON c.name = a.citizen
			WHERE pe.received_at >= %(start)s
			  AND pe.received_at < %(end_exclusive)s
			  {geo_clause}
			GROUP BY district
			ORDER BY taxpayer_count DESC
			""",
			params,
			as_dict=True,
		)

	return {
		"metric": metric,
		"period_start": period_start,
		"period_end": period_end,
		"geography_filter": geography or "",
		"row_count": len(rows),
		"rows": rows,
	}
