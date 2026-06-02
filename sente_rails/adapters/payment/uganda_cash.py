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
Cash — counter-collected legal tender.

Architecturally a "recording-only" channel. The rail's job for cash is
NOT to move money (cashier-physically-takes-cash-and-walks-to-safe
is the MDA's existing SOP) but to:

  • Issue the same EFRIS fiscal receipt URA requires regardless of
    payment medium.
  • Stamp the same immutable audit chain (clerk + counter shift +
    assessment lines + timestamp) so every cash payment is traceable.
  • Reconcile via Counter Shift's cash_expected / cash_counted /
    cash_variance fields at shift close. This is the fraud detection
    primitive — clerk variance over policy thresholds escalates to
    the Supervisor surface.

Why cash exists in a "digital transformation" rail:

  1. Last-mile reality. Uganda 2026: MTN MoMo + Airtel Money cover
     a majority but not all citizens. Property-rate payers in town
     councils, market vendors, older citizens, the unbanked all
     still pay in cash. A no-cash rail rejects them and doesn't get
     adopted.

  2. Network failure resilience. STK push needs the citizen's phone
     on a working network. When the mobile-money APIs blip, cash is
     how the counter stays open that shift.

  3. Legal mandate. MDAs accept legal tender by law. A rail that
     refuses cash is unimplementable for them.

The principled framing: WE DIGITIZE THE RECORD, NOT THE MEDIUM.

Per-MDA / per-Service `accepts_cash: false` overrides for MDAs that
want a cashless posture for specific services are a future hook —
not modeled here.

This adapter is intentionally simple — no external API calls, no
credentials, no stubs. It transitions the Payment Intent through
the same state machine as the mobile-money adapters so downstream
audit + settlement code paths don't special-case Cash.
"""

from datetime import datetime
from typing import ClassVar

import frappe

from sente_rails.adapters.base import PaymentAdapter


class CashAdapter(PaymentAdapter):
	"""Counter-cash recording adapter. Always live (no creds gate)."""

	# Never marked STUB — Cash is a real flow, just one without an
	# external aggregator. /v1/integrations reports it as a live adapter.
	STUB: bool = False
	SUPPORTED_CHANNELS: ClassVar[set] = {"Cash"}

	# ─── Lifecycle ────────────────────────────────────────────────────

	def initiate(self, payment_intent) -> dict:
		"""Mark the cash collection in flight.

		There's no external API to call — the cashier is the aggregator.
		Returns a synthetic aggregator_reference rooted in the counter
		shift name so receipts + audit logs can trace back to which
		shift handled the cash.
		"""
		shift = getattr(payment_intent, "shift", None) or ""
		ref = f"COUNTER:{shift}:{payment_intent.name}" if shift else f"COUNTER:{payment_intent.name}"
		ts = _utc_iso()
		return {
			"aggregator_reference": ref,
			"status": "AwaitingCounter",
			"amount": float(payment_intent.amount or 0),
			"currency": payment_intent.currency or "UGX",
			"stub": False,
			# Audit trace — what we "sent" (nothing external) + the
			# context we recorded. Lets the receipt + verification card
			# show "Cash collected at counter <shift>".
			"trace_request": {
				"channel": "Cash",
				"counter_shift": shift,
				"clerk": frappe.session.user,
				"recorded_at": ts,
			},
			"trace_response": {
				"channel": "Cash",
				"counter_shift": shift,
				"awaiting_counter_at": ts,
			},
			"raw_response": {"counter_shift": shift, "status": "AwaitingCounter"},
		}

	def verify(self, payment_intent) -> dict:
		"""Confirm the cash is in hand.

		Called when the cashier presses "Mark as paid" in the workbench.
		There's no aggregator to poll — the operator's confirmation is
		the source of truth. Variance reconciliation at shift close is
		the audit primitive that catches discrepancies.
		"""
		shift = getattr(payment_intent, "shift", None) or ""
		ref = (
			payment_intent.aggregator_reference
			or f"COUNTER:{shift}:{payment_intent.name}"
		)
		ts = _utc_iso()
		return {
			"status": "Confirmed",
			"txn_id": ref,
			"settled_at": ts,
			"raw_response": {"counter_shift": shift, "confirmed_at": ts},
			"stub": False,
			"trace_response": {
				"channel": "Cash",
				"confirmed_by": frappe.session.user,
				"confirmed_at": ts,
				"counter_shift": shift,
			},
		}

	def refund(self, payment_event, amount: float, reason: str = "") -> dict:
		"""Reverse a cash payment.

		At the counter this is "the clerk hands the cash back" — there's
		no aggregator round-trip. The refund is recorded so the shift
		reconciliation reflects it; the physical reversal happens at the
		drawer.
		"""
		return {
			"refund_id": f"COUNTER-REFUND:{payment_event.name}:{_utc_iso()}",
			"status": "Refunded",
			"amount": float(amount or 0),
			"raw_response": {"reason": reason or "", "method": "counter-handback"},
			"stub": False,
		}


def _utc_iso() -> str:
	return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S") + "Z"
