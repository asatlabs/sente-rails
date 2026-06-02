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
"""Sente Rails public API v1 — Service Notices.

Operator-curated public announcements: planned MDA downtime, new MDA
onboarding, SDK breaking changes, security advisories. Curated in the
Desk by System Manager or Sente Rails Admin (via the Service Notice
doctype). Read by guests here; surfaced on the public marketing
landing + inside the dashboard.

Returned in a stable order: Critical first, then Warning, then Info;
within each severity, newest-first by ``effective_from``.
"""

from __future__ import annotations

import frappe

_SEVERITY_RANK = "FIELD(severity, 'Critical', 'Warning', 'Info')"


@frappe.whitelist(allow_guest=True, methods=["GET"])
def list_notices(active: int = 1, mda: str | None = None, limit: int = 50) -> list[dict]:
	"""Return notices for the public surface.

	Args:
	    active: 1 (default) returns currently-displayable notices —
	        ``active=1`` AND ``effective_from <= now`` AND
	        (``effective_to IS NULL`` OR ``effective_to > now``).
	        0 returns every row (admins reviewing the queue).
	    mda: optional MDA short_code filter. When set, returns rows
	        scoped to that MDA PLUS any platform-wide notices (mda IS NULL).
	        When omitted, returns all rows in scope.
	    limit: row cap, 1–200, default 50.
	"""
	active_flag = int(active or 0)
	try:
		limit_int = max(1, min(int(limit or 50), 200))
	except (TypeError, ValueError):
		limit_int = 50

	where_clauses: list[str] = []
	params: dict = {}

	if active_flag:
		# Use Frappe-side ``now()`` rather than MariaDB ``NOW()`` — this
		# dev bench has frappe.utils.now_datetime() returning IST while
		# the DB server returns UTC. Mixing the two causes IST-stored
		# effective_from values to look "in the future" relative to UTC
		# NOW() by ~5.5 hours, hiding every legitimately-active row.
		params["now_iso"] = frappe.utils.now()
		where_clauses.append("active = 1")
		where_clauses.append("effective_from <= %(now_iso)s")
		where_clauses.append("(effective_to IS NULL OR effective_to > %(now_iso)s)")

	if mda:
		where_clauses.append("(mda IS NULL OR mda = %(mda)s)")
		params["mda"] = mda

	where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

	rows = frappe.db.sql(
		f"""
		SELECT
		    name, title, body, severity, mda,
		    effective_from, effective_to, active
		FROM `tabService Notice`
		{where_sql}
		ORDER BY {_SEVERITY_RANK}, effective_from DESC
		LIMIT {limit_int}
		""",
		params,
		as_dict=True,
	)
	return rows
