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
// /v1/ops/* Operations Console surface — universal fetchers + React
// Query hooks.
//
// The `fetch*` exports are universal (browser or SSR loader). The `use*`
// hooks wrap them in React Query for client-side cache + mutation
// invalidation. Read hooks accept optional `initialData` so route loaders
// can pre-fill on first paint and skip the loading state.
//
// Auth is the workbench `sid` session cookie (set by /signin). In the
// browser, `credentials: "include"` on the fetch attaches it automatically.
// In SSR loaders, authFetch forwards the inbound request's sid via
// the framework's getCookie.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "./auth-fetch";

// ─── Types ───────────────────────────────────────────────────────────────

export type OpsWhoami =
  | { authenticated: false }
  | {
      authenticated: true;
      user: { name: string; full_name: string; email: string; enabled: 0 | 1 };
      roles: string[];
      has_ops_access: boolean;
      can_write: boolean;
      can_read_oversight: boolean;
    };

export type MdaRow = {
  name: string;
  short_code: string;
  full_name: string;
  mda_type: string;
  country: string;
  mode: "A" | "B" | "C" | string;
  status: string;
  parent_authority: string | null;
  treasury_account: string | null;
  sector: string | null;
  integration_status: string;
  target_endpoint_count: number;
  endpoint_count: number;
  display_endpoint_count: number;
};

export type ServiceRow = {
  name: string;
  mda: string;
  code: string;
  service_name: string;
  sector: string | null;
  service_family: string | null;
  fee_amount: number;
  fee_currency: string;
  fee_basis: string;
  fee_schedule_ref: string | null;
  efris_taxable: 0 | 1;
  vat_applicable: 0 | 1;
  vat_rate: number;
  status: string;
};

export type IntegratorRow = {
  name: string;
  display_name: string;
  type: string;
  tier: string;
  pricing_tier: string;
  status: "Active" | "Suspended" | "PendingEmail" | string;
  contact_email: string;
  email_verified: 0 | 1;
  mou_status: string;
  kyc_status: string;
  signup_source: string | null;
  tos_accepted_version: string | null;
  tos_accepted_on: string | null;
  last_login_at: string | null;
  anticipated_volume_daily: number | null;
  anticipated_volume_monthly: number | null;
  creation: string;
};

export type IntegratorDetail = IntegratorRow & {
  notes: string | null;
  webhook_endpoint: string | null;
  ip_allowlist: string | null;
  technical_lead_user: string | null;
  keys: { total: number; active: number };
  requests_last_7d: number;
};

export type OpsKeyRow = {
  name: string;
  integrator: string;
  prefix: string;
  last4: string;
  environment: string;
  key_type: string;
  status: string;
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
  creation: string;
};

export type AuditRow = {
  name: string;
  ts: string;
  event: string;
  request_id: string | null;
  http_method: string | null;
  endpoint: string | null;
  http_status: number;
  error_code: string | null;
  integrator: string | null;
  api_key: string | null;
  source_ip: string | null;
  required_scopes: string[] | null;
  granted_scopes: string[] | null;
  latency_ms: number;
};

export type ShiftRow = {
  name: string;
  mda: string;
  clerk: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  expected_total: number | null;
  counted_total: number | null;
  variance: number | null;
  variance_status: string | null;
};

export type Stats = Record<string, number>;

export type SystemHealth = {
  audit_log: { row_count: number; oldest_ts: string | null; newest_ts: string | null };
  scheduler: { last_daily_expiry_sweep: string | null };
  adapters: { live: number | null; stub: number | null };
  counts: { integrators: number; mdas: number; services: number; keys_active: number; keys_total: number };
  build: { git_head: string | null };
};

export type AggregatesResult = {
  by_mda: { mda: string; total_amount: number; event_count: number }[];
  totals: { window_days: number; total_amount: number; event_count: number };
};

export type AdapterRegistry = Record<string, Record<string, unknown>>;

// ─── Universal fetchers (loader + client) ────────────────────────────────

export const fetchOpsWhoami = (): Promise<OpsWhoami> => authFetch<OpsWhoami>("/v1/ops/whoami");
export const fetchOpsMdas = (): Promise<MdaRow[]> => authFetch<MdaRow[]>("/v1/ops/mdas");

export function fetchOpsServices(filters: { mda?: string; status?: string } = {}): Promise<ServiceRow[]> {
  const qs = new URLSearchParams();
  if (filters.mda) qs.set("mda", filters.mda);
  if (filters.status) qs.set("status", filters.status);
  const q = qs.toString();
  return authFetch<ServiceRow[]>("/v1/ops/services" + (q ? "?" + q : ""));
}

export function fetchOpsIntegrators(
  filters: { status?: string; q?: string } = {},
): Promise<IntegratorRow[]> {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.q) qs.set("q", filters.q);
  const q = qs.toString();
  return authFetch<IntegratorRow[]>("/v1/ops/integrators" + (q ? "?" + q : ""));
}

export const fetchOpsIntegrator = (name: string): Promise<IntegratorDetail> =>
  authFetch<IntegratorDetail>(`/v1/ops/integrators/${encodeURIComponent(name)}`);

export function fetchOpsKeys(
  filters: { integrator?: string; status?: string; q?: string } = {},
): Promise<OpsKeyRow[]> {
  const qs = new URLSearchParams();
  if (filters.integrator) qs.set("integrator", filters.integrator);
  if (filters.status) qs.set("status", filters.status);
  if (filters.q) qs.set("q", filters.q);
  const q = qs.toString();
  return authFetch<OpsKeyRow[]>("/v1/ops/keys" + (q ? "?" + q : ""));
}

export type OpsAuditFilters = {
  limit?: number;
  integrator?: string;
  endpoint?: string;
  event?: string;
  min_status?: number;
  since?: string;
};

export function fetchOpsAudit(filters: OpsAuditFilters = {}): Promise<AuditRow[]> {
  const qs = new URLSearchParams();
  if (filters.limit) qs.set("limit", String(filters.limit));
  if (filters.integrator) qs.set("integrator", filters.integrator);
  if (filters.endpoint) qs.set("endpoint", filters.endpoint);
  if (filters.event) qs.set("event", filters.event);
  if (filters.min_status !== undefined) qs.set("min_status", String(filters.min_status));
  if (filters.since) qs.set("since", filters.since);
  const q = qs.toString();
  return authFetch<AuditRow[]>("/v1/ops/audit" + (q ? "?" + q : ""));
}

export const fetchOpsOversightStats = (): Promise<Stats> =>
  authFetch<Stats>("/v1/ops/oversight/statistics");
export const fetchOpsAggregates = (): Promise<AggregatesResult> =>
  authFetch<AggregatesResult>("/v1/ops/oversight/aggregates");
export const fetchOpsAnomalyFlags = (): Promise<Record<string, unknown>[]> =>
  authFetch<Record<string, unknown>[]>("/v1/ops/oversight/anomaly-flags");
export const fetchOpsPaymentEvents = (): Promise<Record<string, unknown>[]> =>
  authFetch<Record<string, unknown>[]>("/v1/ops/oversight/payment-events");
export const fetchOpsConsentEvents = (): Promise<Record<string, unknown>[]> =>
  authFetch<Record<string, unknown>[]>("/v1/ops/oversight/citizen-consent");
export const fetchOpsShifts = (): Promise<ShiftRow[]> => authFetch<ShiftRow[]>("/v1/ops/shifts");
export const fetchOpsAdapters = (): Promise<AdapterRegistry> =>
  authFetch<AdapterRegistry>("/v1/ops/adapters");
export const fetchOpsSystem = (): Promise<SystemHealth> => authFetch<SystemHealth>("/v1/ops/system");

// ─── Hooks (initialData-aware) ───────────────────────────────────────────

export function useOpsWhoami(initialData?: OpsWhoami) {
  return useQuery({
    queryKey: ["ops", "whoami"],
    queryFn: fetchOpsWhoami,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsMdas(initialData?: MdaRow[]) {
  return useQuery({
    queryKey: ["ops", "mdas"],
    queryFn: fetchOpsMdas,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useUpdateMda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, patch }: { name: string; patch: Partial<MdaRow> }) =>
      authFetch<MdaRow>(`/v1/ops/mdas/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "mdas"] }),
  });
}

export function useOpsServices(
  filters: { mda?: string; status?: string } = {},
  initialData?: ServiceRow[],
) {
  return useQuery({
    queryKey: ["ops", "services", filters],
    queryFn: () => fetchOpsServices(filters),
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, patch }: { name: string; patch: Partial<ServiceRow> }) =>
      authFetch<ServiceRow>(`/v1/ops/services/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "services"] }),
  });
}

export function useOpsIntegrators(
  filters: { status?: string; q?: string } = {},
  initialData?: IntegratorRow[],
) {
  return useQuery({
    queryKey: ["ops", "integrators", filters],
    queryFn: () => fetchOpsIntegrators(filters),
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsIntegrator(name: string | undefined, initialData?: IntegratorDetail) {
  return useQuery({
    queryKey: ["ops", "integrator", name],
    queryFn: () => fetchOpsIntegrator(name!),
    enabled: !!name,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 10_000,
    retry: false,
  });
}

export function useSuspendIntegrator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) =>
      authFetch<{ name: string; status: string }>(
        `/v1/ops/integrators/${encodeURIComponent(name)}:suspend`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "integrators"] });
      qc.invalidateQueries({ queryKey: ["ops", "integrator"] });
    },
  });
}

export function useReactivateIntegrator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) =>
      authFetch<{ name: string; status: string }>(
        `/v1/ops/integrators/${encodeURIComponent(name)}:reactivate`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "integrators"] });
      qc.invalidateQueries({ queryKey: ["ops", "integrator"] });
    },
  });
}

export function useOpsKeys(
  filters: { integrator?: string; status?: string; q?: string } = {},
  initialData?: OpsKeyRow[],
) {
  return useQuery({
    queryKey: ["ops", "keys", filters],
    queryFn: () => fetchOpsKeys(filters),
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useForceRevokeKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) =>
      authFetch<{ name: string; status: string }>(
        `/v1/ops/keys/${encodeURIComponent(name)}:revoke`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "keys"] }),
  });
}

export function useOpsAudit(filters: OpsAuditFilters = {}, initialData?: AuditRow[]) {
  return useQuery({
    queryKey: ["ops", "audit", filters],
    queryFn: () => fetchOpsAudit(filters),
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 10_000,
    retry: false,
  });
}

export function useOpsOversightStats(initialData?: Stats) {
  return useQuery({
    queryKey: ["ops", "oversight", "stats"],
    queryFn: fetchOpsOversightStats,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsAggregates(initialData?: AggregatesResult) {
  return useQuery({
    queryKey: ["ops", "oversight", "aggregates"],
    queryFn: fetchOpsAggregates,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsAnomalyFlags(initialData?: Record<string, unknown>[]) {
  return useQuery({
    queryKey: ["ops", "oversight", "anomalies"],
    queryFn: fetchOpsAnomalyFlags,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsPaymentEvents(initialData?: Record<string, unknown>[]) {
  return useQuery({
    queryKey: ["ops", "oversight", "payments"],
    queryFn: fetchOpsPaymentEvents,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsConsentEvents(initialData?: Record<string, unknown>[]) {
  return useQuery({
    queryKey: ["ops", "oversight", "consent"],
    queryFn: fetchOpsConsentEvents,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsShifts(initialData?: ShiftRow[]) {
  return useQuery({
    queryKey: ["ops", "shifts"],
    queryFn: fetchOpsShifts,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useOpsAdapters(initialData?: AdapterRegistry) {
  return useQuery({
    queryKey: ["ops", "adapters"],
    queryFn: fetchOpsAdapters,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 60_000,
    retry: false,
  });
}

export function useOpsSystem(initialData?: SystemHealth) {
  return useQuery({
    queryKey: ["ops", "system"],
    queryFn: fetchOpsSystem,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 15_000,
    retry: false,
  });
}

export function useOpsSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await fetch("/api/method/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    qc.invalidateQueries({ queryKey: ["ops", "whoami"] });
  };
}
