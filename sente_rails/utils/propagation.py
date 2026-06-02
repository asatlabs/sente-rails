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
"""Cross-MDA propagation enqueue logic.

The pipeline:
1. A Payment Event lands -> its on_insert hook calls enqueue_for_payment_event.
2. We look up the source Assessment, then the source MDA's propagation_rules.
3. For each active rule matching the event_type, create one Cross-MDA
   Propagation row in status=Pending.
4. The scheduled worker (sente_rails.jobs.propagation_worker) picks them up,
   resolves the adapter, calls it, and stamps status.
"""

import frappe
from frappe.utils import now_datetime

_EVENT_ASSESSMENT_PAID = "Assessment Paid"

# Backoff schedule in minutes — index = previous attempt_count
# attempt 1 fails -> wait 1m; 2 -> 5m; 3 -> 30m; 4 -> 2h; 5 -> 12h; 6 -> Failed
BACKOFF_MINUTES = [1, 5, 30, 120, 720]
MAX_ATTEMPTS = len(BACKOFF_MINUTES)


def enqueue_for_payment_event(payment_event_name: str) -> list[str]:
	"""Look up the source MDA's propagation rules for Assessment Paid
	and enqueue one Cross-MDA Propagation per matching rule.

	Returns the list of newly-created CMP names. Empty list if no rules
	match or the Payment Event has no linked Assessment.
	"""
	pe = frappe.db.get_value(
		"Payment Event",
		payment_event_name,
		["payment_intent", "mda", "amount"],
		as_dict=True,
	)
	if not pe or not pe.payment_intent:
		return []
	assessment_name = frappe.db.get_value("Payment Intent", pe.payment_intent, "assessment")
	if not assessment_name:
		return []
	source_mda = pe.mda or frappe.db.get_value("Assessment", assessment_name, "mda_default")
	if not source_mda:
		return []

	rules = frappe.db.sql(
		"""
		SELECT name, event_type, destination_mda, adapter_method, payload_template
		FROM `tabMDA Propagation Rule`
		WHERE parent = %(mda)s
		  AND parenttype = 'MDA'
		  AND parentfield = 'propagation_rules'
		  AND event_type = %(event_type)s
		  AND IFNULL(active, 0) = 1
		""",
		{"mda": source_mda, "event_type": _EVENT_ASSESSMENT_PAID},
		as_dict=True,
	)
	if not rules:
		return []

	created = []
	for rule in rules:
		# Defensive: skip self-propagation rules (validate also catches but cheaper here)
		if rule.destination_mda == source_mda:
			continue
		cmp_doc = frappe.get_doc(
			{
				"doctype": "Cross-MDA Propagation",
				"source_assessment": assessment_name,
				"source_mda": source_mda,
				"destination_mda": rule.destination_mda,
				"propagation_type": _infer_propagation_type(rule.adapter_method),
				"status": "Pending",
				"attempt_count": 0,
				"next_attempt_at": now_datetime(),
				# Cache the rule's adapter_method + template inside payload_sent
				# so the worker doesn't need to re-walk to find them. We use a
				# small JSON envelope inside payload_sent for the worker to read.
				"payload_sent": frappe.as_json(
					{
						"_rule_adapter_method": rule.adapter_method,
						"_rule_payload_template": rule.payload_template or "",
					}
				),
			}
		)
		cmp_doc.insert(ignore_permissions=True)
		created.append(cmp_doc.name)
	frappe.db.commit()
	return created


def _infer_propagation_type(adapter_method: str | None) -> str:
	"""Best-effort mapping from the adapter method name to one of the
	doctype's enumerated propagation_type values. Falls back to Other.
	"""
	if not adapter_method:
		return "Other"
	probe = adapter_method.lower()
	if "tin" in probe:
		return "TIN Notification"
	if "nssf" in probe:
		return "NSSF Enrollment"
	if "kcca" in probe or "trade_licence" in probe:
		return "KCCA Trade Licence Mirror"
	if "land" in probe or "cadastre" in probe:
		return "Land Cadastre Update"
	return "Other"
