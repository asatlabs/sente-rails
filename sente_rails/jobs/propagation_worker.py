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
"""Background worker that drains the Cross-MDA Propagation queue.

Scheduled every 5 min by hooks.py. Picks up Pending rows whose
next_attempt_at has elapsed, resolves the rule's adapter, calls it,
and updates the row. On failure, applies the BACKOFF_MINUTES schedule
from sente_rails.utils.propagation; after MAX_ATTEMPTS, marks Failed.
"""

import json
from datetime import timedelta

import frappe
from frappe.utils import now_datetime

from sente_rails.utils.propagation import BACKOFF_MINUTES, MAX_ATTEMPTS


def process_propagation_queue(limit: int = 100) -> dict:
	"""Drain at most `limit` Pending Cross-MDA Propagation rows whose
	backoff window has elapsed. Returns a summary dict for the scheduler
	log.
	"""
	now = now_datetime()
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabCross-MDA Propagation`
		WHERE status = 'Pending'
		  AND (next_attempt_at IS NULL OR next_attempt_at <= %(now)s)
		ORDER BY creation
		LIMIT %(limit)s
		""",
		{"now": now, "limit": limit},
		as_dict=True,
	)

	summary = {"picked": len(rows), "sent": 0, "failed": 0, "permanently_failed": 0, "skipped": 0}
	for row in rows:
		outcome = _attempt_once(row.name)
		summary[outcome] = summary.get(outcome, 0) + 1
	return summary


def _attempt_once(cmp_name: str) -> str:
	"""Make one delivery attempt against a single CMP row. Returns one of:
	sent / failed / permanently_failed / skipped.
	"""
	doc = frappe.get_doc("Cross-MDA Propagation", cmp_name)
	doc.attempt_count = int(doc.attempt_count or 0) + 1
	doc.last_attempt_at = now_datetime()

	# Read the rule details out of payload_sent (stashed at enqueue time)
	rule = _extract_rule_metadata(doc.payload_sent)
	adapter_method = rule.get("adapter_method")
	payload_template = rule.get("payload_template")

	if not adapter_method:
		doc.status = "Skipped"
		doc.error_message = "No adapter_method on the rule — nothing to call."
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return "skipped"

	# Resolve adapter
	try:
		callable_target = _resolve_adapter(adapter_method)
	except Exception as e:
		return _record_failure(doc, f"Adapter resolution failed: {e}")

	# Build payload
	try:
		payload = _render_payload(payload_template, doc)
	except Exception as e:
		return _record_failure(doc, f"Payload template render failed: {e}")

	# Stash rendered payload back so the operator can audit what we sent
	doc.payload_sent = frappe.as_json(payload)

	# Call
	try:
		response = callable_target(payload)
	except Exception as e:
		return _record_failure(doc, f"Adapter call raised: {e}")

	# Success
	doc.status = "Sent"
	doc.sent_at = now_datetime()
	doc.response_received = frappe.as_json(response) if not isinstance(response, str) else response
	doc.error_message = ""
	doc.next_attempt_at = None
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return "sent"


def _record_failure(doc, error_message: str) -> str:
	"""Mark the row Failed temporarily (still Pending if retries remain)
	or permanently (Failed) once retries are exhausted.
	"""
	doc.error_message = error_message
	if doc.attempt_count >= MAX_ATTEMPTS:
		doc.status = "Failed"
		doc.next_attempt_at = None
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		return "permanently_failed"
	# Schedule next attempt per backoff
	# attempt_count is now 1-based; pick BACKOFF_MINUTES[attempt_count-1]
	wait_minutes = BACKOFF_MINUTES[doc.attempt_count - 1]
	doc.next_attempt_at = now_datetime() + timedelta(minutes=wait_minutes)
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return "failed"


def _extract_rule_metadata(payload_sent_raw: str) -> dict:
	"""enqueue_for_payment_event stashes the rule's adapter_method and
	payload_template inside payload_sent as a small JSON envelope. The
	worker reads them back here; once the worker calls the adapter,
	payload_sent gets overwritten with the actually-rendered payload.
	"""
	if not payload_sent_raw:
		return {}
	try:
		blob = json.loads(payload_sent_raw)
		if isinstance(blob, dict):
			return {
				"adapter_method": blob.get("_rule_adapter_method"),
				"payload_template": blob.get("_rule_payload_template", ""),
			}
	except json.JSONDecodeError:
		pass
	return {}


def _resolve_adapter(adapter_method: str):
	"""Resolve a dotted adapter path under sente_rails.adapters."""
	full_path = f"sente_rails.adapters.{adapter_method}"
	return frappe.get_attr(full_path)


def _render_payload(template_raw: str, cmp_doc) -> dict:
	"""Render the rule's payload_template against the source assessment
	context. If template is empty, return a default snapshot of the
	source Assessment.
	"""
	if not template_raw or not template_raw.strip():
		return _default_payload(cmp_doc)
	# Template can be a plain JSON literal, OR a JSON literal with {{ }}
	# placeholders. Use frappe.render_template for both, then json.loads.
	context = _build_context(cmp_doc)
	rendered = frappe.render_template(template_raw, context)
	return json.loads(rendered)


def _default_payload(cmp_doc) -> dict:
	asmt = frappe.db.get_value(
		"Assessment",
		cmp_doc.source_assessment,
		["name", "citizen", "mda_default", "total_amount", "currency", "status"],
		as_dict=True,
	)
	return {
		"source_assessment": cmp_doc.source_assessment,
		"source_mda": cmp_doc.source_mda,
		"destination_mda": cmp_doc.destination_mda,
		"propagation_type": cmp_doc.propagation_type,
		"assessment": asmt,
	}


def _build_context(cmp_doc) -> dict:
	"""Context dict passed to render_template. Exposes:
	cmp     — the propagation row
	asmt    — the source Assessment dict (citizen, total, etc.)
	source  — the source MDA short_code
	dest    — the destination MDA short_code
	"""
	asmt = (
		frappe.db.get_value(
			"Assessment",
			cmp_doc.source_assessment,
			["name", "citizen", "mda_default", "total_amount", "currency", "status"],
			as_dict=True,
		)
		or {}
	)
	return {
		"cmp": cmp_doc.as_dict(),
		"asmt": asmt,
		"source": cmp_doc.source_mda,
		"dest": cmp_doc.destination_mda,
	}
