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
// /v1/me/* surface — universal fetchers + React Query hooks.
//
// The `fetch*` exports are universal (browser or SSR loader). The `use*`
// hooks wrap them in React Query for client-side cache + mutation
// invalidation. Read endpoints stale at 30s. Write endpoints (PATCH /v1/me,
// key rotate/revoke) invalidate the relevant caches on success so the
// dashboard reflects the new state without a manual reload.
//
// Auth is handled by the browser `sid` session cookie. The workbench never
// sends Bearer tokens. In SSR loaders the cookie is forwarded by authFetch
// reading the inbound request via the framework's getCookie.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "./auth-fetch";

// ─── Types ───────────────────────────────────────────────────────────────

export type MeProfile = {
  name: string;
  display_name: string;
  type: string;
  tier: string;
  pricing_tier: string;
  status: string;
  contact_email: string;
  technical_lead_user: string | null;
  webhook_endpoint: string | null;
  mou_status: string;
  kyc_status: string;
  ip_allowlist: string | null;
  tos_accepted_on: string | null;
  tos_accepted_version: string | null;
  signup_source: string | null;
  email_verified: 0 | 1;
  last_login_at: string | null;
  anticipated_volume_daily: number | null;
  anticipated_volume_monthly: number | null;
  keys: { total: number; active: number };
  requests_last_7d: number;
};

export type MeKey = {
  name: string;
  prefix: string;
  last4: string;
  environment: "sandbox" | "live";
  key_type: string;
  status: "active" | "rolling" | "revoked" | "expired" | string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  usage_count: number;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
  rolling_until: string | null;
  rolled_to: string | null;
  description: string | null;
};

export type MeLogEntry = {
  name: string;
  ts: string;
  event: string;
  request_id: string | null;
  http_method: string | null;
  endpoint: string | null;
  http_status: number;
  error_code: string | null;
  api_key: string | null;
  source_ip: string | null;
  required_scopes: string[] | null;
  granted_scopes: string[] | null;
  latency_ms: number;
};

export type RotateResult = {
  old_key: { name: string; status: string; rolling_until: string | null };
  new_key: MeKey;
  plaintext: string;
  plaintext_warning: string;
};

// ─── Universal fetchers (SSR loader + client) ────────────────────────────

export const fetchMe = (): Promise<MeProfile> => authFetch<MeProfile>("/v1/me");
export const fetchMyKeys = (): Promise<MeKey[]> => authFetch<MeKey[]>("/v1/me/keys");

export type LogsFilters = {
  limit?: number;
  endpoint?: string;
  event?: string;
  min_status?: number;
};

export function fetchMyLogs(filters: LogsFilters = {}): Promise<MeLogEntry[]> {
  const qs = new URLSearchParams();
  if (filters.limit) qs.set("limit", String(filters.limit));
  if (filters.endpoint) qs.set("endpoint", filters.endpoint);
  if (filters.event) qs.set("event", filters.event);
  if (filters.min_status !== undefined) qs.set("min_status", String(filters.min_status));
  const q = qs.toString();
  return authFetch<MeLogEntry[]>("/v1/me/logs" + (q ? "?" + q : ""));
}

// ─── Hooks (client-side cache + invalidation) ────────────────────────────

// Each read hook accepts `initialData` — when called from a route that
// pre-fetched via its loader, useQuery starts in `success` state with
// the loader's data (no flicker) and revalidates in the background.
// `initialDataUpdatedAt: 0` marks the initial data immediately-stale so
// the background refetch fires once on mount.

export function useMe(initialData?: MeProfile) {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useMyKeys(initialData?: MeKey[]) {
  return useQuery({
    queryKey: ["me", "keys"],
    queryFn: fetchMyKeys,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useMyLogs(filters: LogsFilters = {}, initialData?: MeLogEntry[]) {
  return useQuery({
    queryKey: ["me", "logs", filters],
    queryFn: () => fetchMyLogs(filters),
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 10_000,
    retry: false,
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<MeProfile,
      "display_name" | "webhook_endpoint" | "ip_allowlist" |
      "anticipated_volume_daily" | "anticipated_volume_monthly"
    >>) => authFetch<MeProfile>("/v1/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

export function useRotateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, grace_hours }: { name: string; grace_hours?: number }) =>
      authFetch<RotateResult>(
        `/v1/me/keys/${encodeURIComponent(name)}:rotate`,
        {
          method: "POST",
          body: JSON.stringify({ grace_hours: grace_hours ?? 24 }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me", "keys"] });
    },
  });
}

export function useRevokeKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) =>
      authFetch<MeKey>(
        `/v1/me/keys/${encodeURIComponent(name)}:revoke`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me", "keys"] });
    },
  });
}
