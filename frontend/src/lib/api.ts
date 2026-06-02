// ─────────────────────────────────────────────────────────────────────────────
// Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
// Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>
//
// CONFIDENTIAL AND PROPRIETARY
//
// This source file is the original work of Geoffrey Oketwangwu and contains
// confidential, proprietary information protected under copyright and trade-
// secret law. No part may be reproduced, distributed, modified, reverse-
// engineered, or used — in source or compiled form — without the prior
// written permission of the author.
//
// All rights reserved.
// SSR-safe URL helper for /v1/* fetches.
//
// Why this exists: in the browser, `fetch('/v1/mdas')` works because the
// browser resolves the relative URL against the current page's origin
// and nginx routes the request to Frappe. In the SSR pass
// the fetch runs inside Node where there is no document.location to
// resolve against — `fetch('/v1/mdas')` throws "Invalid URL".
//
// The SSR fetch targets the public HTTPS URL of the same host. Two
// reasons we don't hit `http://127.0.0.1:80` directly: nginx redirects
// HTTP → HTTPS for `sente-rails.space`, so a loopback HTTP fetch lands
// in a 301 the Node fetch can't usefully follow back to localhost; and
// the cert is valid for the public hostname, so TLS Just Works. On the
// dev box this is a loopback HTTPS round-trip — sub-50ms with session
// caching, no real cost.
//
// Override at deploy time via the `SENTE_API_BASE` env var on the
// supervisor program if the workbench process ever lives somewhere
// other than the API host.

const SSR_BASE =
  (typeof process !== "undefined" && process.env?.SENTE_API_BASE) ||
  "https://sente-rails.space";

export function makeApiUrl(path: string): string {
  if (typeof window !== "undefined") return path;
  return `${SSR_BASE}${path}`;
}
