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
// Universal authenticated /v1/* fetcher.
//
// In the browser: a plain `fetch(path, { credentials: "include" })`. The
// browser attaches the `sid` cookie automatically because the workbench
// and the API live on the same origin.
//
// In SSR (Node): three problems vs the browser case —
//   1. Relative URLs throw "Invalid URL" — fixed via makeApiUrl().
//   2. There is no document.cookie — fixed by reading the inbound request's
//      `sid` via the SSR framework's `getCookie` server helper and forwarding
//      it as an outgoing `Cookie` header.
//   3. The platform validates the session against the inbound cookie; if
//      missing, /v1/me/* returns 401 (graceful at the loader's catch site).
//
// The `createIsomorphicFn().client(...).server(...)` pattern is the
// framework-sanctioned way to split implementations. The compiler
// strips the server branch (and the `@tanstack/react-start/server` import)
// from client builds — the server module never reaches the browser.

import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { makeApiUrl } from "./api";

type ApiResponse<T> = {
  data?: T;
  error?: { code: string; message: string; request_id?: string };
};

export class AuthFetchError extends Error {
  code?: string;
  status: number;
  request_id?: string;
  constructor(message: string, status: number, code?: string, request_id?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.request_id = request_id;
  }
}

// Browser: returns undefined — the browser attaches the sid cookie
// automatically via `credentials: "include"` on same-origin fetches.
// SSR: reads the inbound request's sid cookie via the SSR framework.
const readSsrSid = createIsomorphicFn()
  .client((): string | undefined => undefined)
  .server((): string | undefined => getCookie("sid"));

function buildHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  const sid = readSsrSid();
  if (sid) headers["Cookie"] = `sid=${sid}`;
  // Caller-supplied headers win.
  return { ...headers, ...((init?.headers as Record<string, string>) || {}) };
}

/**
 * Fetch a /v1/* endpoint with session-cookie auth.
 *
 * Works identically from an SSR loader and from a
 * browser-side handler (client). Throws AuthFetchError on non-2xx /
 * envelope-error responses; 401 carries `status: 401` for callers to
 * decide whether to redirect to /signin or show an empty state.
 */
export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = buildHeaders(init);
  const res = await fetch(makeApiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new AuthFetchError(`HTTP ${res.status} (no JSON body)`, res.status);
  }
  if (!res.ok || json.error || json.data === undefined) {
    throw new AuthFetchError(
      json.error?.message ?? `HTTP ${res.status}`,
      res.status,
      json.error?.code,
      json.error?.request_id,
    );
  }
  return json.data;
}
