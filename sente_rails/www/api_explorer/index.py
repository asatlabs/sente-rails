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
"""Sente Rails — API Documentation page route.

Renders the OpenAPI 3.1 spec at sente_rails/api/v1/openapi.yaml via
Swagger UI. Public (allow_guest) so visitors can browse without a
login.
"""

import json
from pathlib import Path

import frappe
import yaml

no_cache = 1
no_breadcrumbs = 1
sitemap = 0


def get_context(context):
	spec_path = Path(frappe.get_app_path("sente_rails", "api", "v1", "openapi.yaml"))
	spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
	# JSON-encode for safe injection into a <script> tag.
	# Swagger UI accepts the spec as a JS object via the `spec:` option.
	context.spec_json = json.dumps(spec, ensure_ascii=False)
	context.title = "Sente Rails — API Documentation"
	context.spec_version = spec.get("info", {}).get("version", "1.0.0")
	context.endpoint_count = len(spec.get("paths", {}))
	context.schema_count = len((spec.get("components") or {}).get("schemas") or {})
	return context
