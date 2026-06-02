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
"""Consent lookup helpers (PDP Act 2019)."""

from typing import Optional

import frappe
from frappe.utils import getdate, today


def has_active_consent(citizen: str, mda: str, purpose: str, on_date: str | None = None) -> bool:
	"""Return True iff the citizen has at least one Citizen Consent Event
	row that is currently active for (mda, purpose).

	Active = granted=1 AND revoked_at IS NULL AND (expiry_at IS NULL OR
	expiry_at >= on_date). on_date defaults to today.

	Args:
	    citizen: Citizen name (CITIZEN-YYYY-NNNNNN).
	    mda: MDA short_code.
	    purpose: one of the Citizen Consent Event purpose options.
	    on_date: ISO date string. Default = today.

	Returns:
	    True / False.
	"""
	target = getdate(on_date) if on_date else getdate(today())
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabCitizen Consent Event`
		WHERE citizen = %(c)s
		  AND mda = %(m)s
		  AND purpose = %(p)s
		  AND granted = 1
		  AND revoked_at IS NULL
		  AND (expiry_at IS NULL OR expiry_at >= %(t)s)
		LIMIT 1
		""",
		{"c": citizen, "m": mda, "p": purpose, "t": target},
	)
	return bool(rows)
