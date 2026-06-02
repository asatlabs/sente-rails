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
"""Sente Rails — pre-auth Bearer header normalisation.

The underlying framework's OAuth-Bearer validator runs against the
`Authorization` header at request init and rejects unknown Bearer
tokens with AuthenticationError before our `@sente_api` decorator
gets a chance to inspect them.

This `before_request` hook runs early enough to intercept. If the
incoming Authorization header carries one of OUR Bearer tokens
(prefixed `sk_`, `rk_`, `pk_`, or `whsec_`), the hook copies the
header to `X-Sente-Authorization` via the WSGI environ and strips
the original `Authorization` so the framework's OAuth path sees
nothing to validate. Our decorator reads `X-Sente-Authorization`
as its preferred header anyway, so authentication proceeds
cleanly.

If the Authorization header is empty or carries a token in a
different format (e.g. `token KEY:SECRET` for legacy callers,
or a real OAuth Bearer), the hook does nothing and the framework
handles it as before.
"""

from __future__ import annotations

import frappe

_OUR_PREFIXES = ("sk_", "rk_", "pk_", "whsec_")


def normalise_sente_bearer() -> None:
	"""before_request hook — runs once per request."""
	try:
		auth = frappe.get_request_header("Authorization") or ""
	except (RuntimeError, AttributeError):
		return
	if not auth.startswith("Bearer "):
		return

	token = auth[7:].strip()
	if not token or not any(token.startswith(p) for p in _OUR_PREFIXES):
		# Not one of ours — leave the header alone so framework OAuth /
		# token-style auth runs as designed.
		return

	# It's one of ours. Move the header onto X-Sente-Authorization (via
	# the WSGI environ — that's the underlying source the request headers
	# proxy reads from) and strip the Authorization key so the framework's
	# Bearer validator skips silently.
	try:
		env = frappe.local.request.environ
	except (RuntimeError, AttributeError):
		return

	if "HTTP_X_SENTE_AUTHORIZATION" not in env:
		env["HTTP_X_SENTE_AUTHORIZATION"] = auth
	env.pop("HTTP_AUTHORIZATION", None)
