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
"""Demo reset — put the counter into a clean, known state before a walkthrough.

Run with:  bench --site <site> execute sente_rails.demo_reset.run

Idempotent and safe to re-run. It does NOT delete historical records; it only:
  1. closes any still-open Counter Shift cleanly (zero variance), so the demo
     clerk can open a fresh shift;
  2. sets the demo accounts' known passwords + the supervisor PIN, so the
     walkthrough is reproducible;
  3. clears any open anomaly flags (the demo generates fresh ones live).

DEMO CREDENTIALS — these are intentionally well-known demo values for the
evaluation site, not production secrets.
"""

import frappe

DEMO_SUPERVISOR = "supervisor@sente-rails.space"
SUPERVISOR_PIN = "2468"

# All demo role-players share one password for an easy walkthrough.
SHARED_PW = "nantege2009"
DEMO_ACCOUNTS = [
	"clerk@sente-rails.space",
	"supervisor@sente-rails.space",
	"oag@sente-rails.space",
	"treasurer@sente-rails.space",
	"asatlabs@gmail.com",  # owner/admin — kept on the shared password by request
]


def run():
	log = []

	# 1) Close any open shift cleanly so a fresh demo shift can be opened.
	for name in frappe.get_all("Counter Shift", filters={"status": "Open"}, pluck="name"):
		try:
			sh = frappe.get_doc("Counter Shift", name)
			sh.refresh_aggregates()
			sh.close(
				cash_counted=float(sh.cash_expected or 0),
				variance_reason=None,
				closing_notes="[demo reset] auto-closed to clear the floor",
			)
			log.append(f"closed open shift {name}")
		except Exception as exc:  # pragma: no cover - defensive
			log.append(f"could not close {name}: {exc}")

	# 2) Known demo credentials (shared password) + supervisor PIN.
	for user in DEMO_ACCOUNTS:
		if not frappe.db.exists("User", user):
			log.append(f"user missing (skipped): {user}")
			continue
		doc = frappe.get_doc("User", user)
		doc.new_password = SHARED_PW
		doc.flags.ignore_password_policy = True
		if user == DEMO_SUPERVISOR and doc.meta.has_field("sente_supervisor_pin"):
			doc.sente_supervisor_pin = SUPERVISOR_PIN
		doc.save(ignore_permissions=True)
		log.append(f"credentials set: {user}")

	# 3) Clear open anomaly flags — the demo raises fresh ones live.
	for name in frappe.get_all("Anomaly Flag", filters={"status": "Open"}, pluck="name"):
		doc = frappe.get_doc("Anomaly Flag", name)
		doc.status = "False Positive"
		doc.resolution_notes = (doc.resolution_notes or "") + "\n[demo reset] cleared pre-demo"
		doc.save(ignore_permissions=True)
		log.append(f"cleared flag {name}")

	frappe.db.commit()
	for line in log:
		print("DEMO_RESET:", line)
	print("DEMO_RESET: ready — all demo accounts share password:", SHARED_PW)
	for u in DEMO_ACCOUNTS:
		extra = f"  (PIN {SUPERVISOR_PIN})" if u == DEMO_SUPERVISOR else ""
		print(f"DEMO_RESET:   {u} / {SHARED_PW}{extra}")
