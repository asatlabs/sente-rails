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
// /v1/work/* Counter Stations surface — universal fetchers + React
// Query hooks.
//
// The `fetch*` exports are universal (browser or SSR loader). The `use*`
// hooks wrap them in React Query for client-side cache + mutation
// invalidation. Read hooks accept optional `initialData` so route
// loaders can pre-fill on first paint and skip the loading state.
//
// Auth is the workbench `sid` session cookie. In the browser,
// `credentials: "include"` on the fetch attaches it automatically.
// In SSR loaders, authFetch forwards the inbound request's sid via
// the framework's getCookie.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "./auth-fetch";

export type WorkWhoami =
  | { authenticated: false }
  | {
      authenticated: true;
      user: { name: string; full_name: string; email: string };
      roles: string[];
      is_clerk: boolean;
      is_supervisor: boolean;
      is_admin: boolean;
      has_work_access: boolean;
      // MDA assignment — SCOPE that pairs with the capability roles.
      // null for admins (fleet-wide) or unassigned users. Clerks and
      // supervisors should always carry a value in production.
      clerk_mda: string | null;
    };

export type Mda = {
  name: string;
  short_code: string;
  full_name: string;
  mda_type: string;
  mode: string;
};

export type Service = {
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
};

export type Citizen = {
  name: string;
  nin: string;
  full_name: string;
  first_name?: string;
  surname?: string;
  status: string;
  verified: number;
  phone?: string | null;
  email?: string | null;
  district?: string | null;
  dob?: string | null;
};

export type ShiftDoc = {
  name: string;
  clerk: string;
  mda: string;
  counter_label: string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  opening_cash?: number | null;
  expected_total?: number | null;
  counted_total?: number | null;
  variance?: number | null;
  variance_status?: string | null;
  notes?: string | null;
};

export type Assessment = Record<string, unknown> & {
  name: string;
  citizen?: string;
  status?: string;
  total_amount?: number;
  gross_amount?: number;
  discount_amount?: number;
  discount_reason?: string;
  fee_currency?: string;
};

export type PaymentIntent = Record<string, unknown> & {
  name: string;
  assessment?: string;
  channel?: string;
  status?: string;
  amount?: number;
};

// ─── Universal fetchers (loader + client) ────────────────────────────────

export const fetchWorkWhoami = (): Promise<WorkWhoami> => authFetch<WorkWhoami>("/v1/work/whoami");
export const fetchWorkMdas = (): Promise<Mda[]> => authFetch<Mda[]>("/v1/work/mdas");
export const fetchWorkServices = (mda: string): Promise<Service[]> =>
  authFetch<Service[]>(`/v1/work/services?mda=${encodeURIComponent(mda)}`);
export const fetchActiveShift = (mda: string): Promise<ShiftDoc | null> =>
  authFetch<ShiftDoc | null>(`/v1/work/shift/active?mda=${encodeURIComponent(mda)}`);
export const fetchMyShifts = (): Promise<ShiftDoc[]> =>
  authFetch<ShiftDoc[]>("/v1/work/shifts?limit=20");
export const fetchAssessment = (name: string): Promise<Assessment> =>
  authFetch<Assessment>(`/v1/work/assessments/${encodeURIComponent(name)}`);
export type SupervisorDashboard = {
  mda: string | null;
  mda_name: string | null;
  date: string;
  is_today: boolean;
  counters: {
    collected_today: number;
    currency: string;
    open_shifts: number;
    variances_pending: number;
    refunds_today: number;
    refunds_amount: number;
    waivers_today: number;
    waivers_amount: number;
    open_flags: number;
  };
  variance_queue: {
    name: string;
    clerk: string;
    expected_total: number;
    counted_total: number;
    variance: number;
    variance_reason?: string | null;
  }[];
  shifts: Array<Record<string, unknown>>;
  by_service: { service: string; service_name: string; total: number }[];
  by_channel: { channel: string; total: number; share_pct: number }[];
  corrections: {
    refunds: {
      intent: string;
      amount: number;
      reason?: string | null;
      clerk?: string;
      authorized_by?: string;
      at?: string | null;
      citizen?: string;
    }[];
    waivers: {
      assessment: string;
      amount: number;
      reason?: string | null;
      authorized_by?: string;
      gross: number;
      net: number;
      citizen?: string;
    }[];
  };
  flags: {
    name: string;
    flag_type: string;
    severity: string;
    status: string;
    flagged_at?: string | null;
    reference_doctype: string;
    reference_name: string;
    description?: string;
    signal_value: number;
    threshold: number;
  }[];
};

export const fetchSupervisorDashboard = (): Promise<SupervisorDashboard> =>
  authFetch<SupervisorDashboard>("/v1/work/supervisor/dashboard");

// ─── Hooks (initialData-aware) ───────────────────────────────────────────

export function useWorkWhoami(initialData?: WorkWhoami) {
  return useQuery({
    queryKey: ["work", "whoami"],
    queryFn: fetchWorkWhoami,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 30_000,
    retry: false,
  });
}

export function useWorkMdas(initialData?: Mda[]) {
  return useQuery({
    queryKey: ["work", "mdas"],
    queryFn: fetchWorkMdas,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useWorkServices(mda: string | undefined, initialData?: Service[]) {
  return useQuery({
    queryKey: ["work", "services", mda],
    queryFn: () => fetchWorkServices(mda!),
    enabled: !!mda,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 60_000,
    retry: false,
  });
}

export function useActiveShift(mda: string | undefined, initialData?: ShiftDoc | null) {
  return useQuery({
    queryKey: ["work", "shift", "active", mda],
    queryFn: () => fetchActiveShift(mda ?? ""),
    enabled: !!mda,
    initialData,
    initialDataUpdatedAt: initialData !== undefined ? 0 : undefined,
    staleTime: 5_000,
    retry: false,
  });
}

export function useMyShifts(initialData?: ShiftDoc[]) {
  return useQuery({
    queryKey: ["work", "shifts"],
    queryFn: fetchMyShifts,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 10_000,
    retry: false,
  });
}

export type WorkTxn = {
  name: string;
  citizen: string;
  citizen_name: string;
  total_amount: number;
  gross_amount: number;
  discount_amount: number;
  status: string;
  payment_status: string;
  created: string | null;
  paid_at: string | null;
  mda: string;
  channel?: string | null;
  intent?: string | null;
  intent_status?: string | null;
  fdn?: string | null;
};

export const fetchWorkHistory = (limit = 25): Promise<WorkTxn[]> =>
  authFetch<WorkTxn[]>(`/v1/work/history?limit=${limit}`);

export function useWorkHistory(limit = 25, initialData?: WorkTxn[]) {
  return useQuery({
    queryKey: ["work", "history", limit],
    queryFn: () => fetchWorkHistory(limit),
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 5_000,
    retry: false,
  });
}

export type ShiftReport = {
  kind: "X" | "Z";
  shift: string;
  mda: string;
  mda_name: string;
  clerk?: string;
  counter_label?: string;
  status: string;
  opened_at?: string | null;
  closed_at?: string | null;
  currency: string;
  opening_float: number;
  assessment_count: number;
  total_collected: number;
  cash_collected: number;
  by_channel: { channel: string; total: number }[];
  by_service: { service: string; service_name: string; total: number; count: number }[];
  cash: { expected: number; counted: number | null; variance: number | null; variance_reason: string | null };
  refunds: { count: number; total: number };
  waivers: { count: number; total: number };
  generated_at: string;
};

export const fetchShiftReport = (name: string, kind: "X" | "Z"): Promise<ShiftReport> =>
  authFetch<ShiftReport>(`/v1/work/shift/${encodeURIComponent(name)}/report?kind=${kind}`);

export function useShiftReport(name: string | undefined, kind: "X" | "Z", enabled: boolean) {
  return useQuery({
    queryKey: ["work", "shift", "report", name, kind],
    queryFn: () => fetchShiftReport(name!, kind),
    enabled: enabled && !!name,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useOpenShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mda, counter_label, opening_cash }: { mda: string; counter_label?: string; opening_cash?: number }) =>
      authFetch<ShiftDoc>("/v1/work/shift", {
        method: "POST",
        body: JSON.stringify({ mda, counter_label: counter_label ?? "", opening_cash: opening_cash ?? 0 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work", "shift"] });
      qc.invalidateQueries({ queryKey: ["work", "shifts"] });
    },
  });
}

export function useCloseShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, cash_counted, note }: { name: string; cash_counted: number; note?: string }) =>
      authFetch<ShiftDoc>(`/v1/work/shift/${encodeURIComponent(name)}:close`, {
        method: "POST",
        body: JSON.stringify({ cash_counted, note: note ?? "" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work", "shift"] });
      qc.invalidateQueries({ queryKey: ["work", "shifts"] });
    },
  });
}

export function useCitizenSearch() {
  return useMutation({
    mutationFn: (nin: string) =>
      authFetch<{ source: string; citizen: Citizen | null; stub?: boolean }>(
        `/v1/work/citizens/search?nin=${encodeURIComponent(nin)}`,
      ),
  });
}

// Find-or-create a local Citizen from a NIN. Used when search returns a
// NIRA hit (source: "nira") — that record has no local docname yet, so it
// can't anchor an assessment until it's persisted here.
export function useRegisterCitizen() {
  return useMutation({
    mutationFn: ({ nin, mda }: { nin: string; mda: string }) =>
      authFetch<{ citizen: Citizen; created: boolean; source: string }>(
        "/v1/work/citizens",
        { method: "POST", body: JSON.stringify({ nin, mda }) },
      ),
  });
}

export function useCreateAssessment() {
  return useMutation({
    mutationFn: ({ citizen, lines, mda_default, notes }: {
      citizen: string;
      lines: { service: string; quantity?: number; explicit_amount?: number }[];
      mda_default?: string;
      notes?: string;
    }) =>
      authFetch<Assessment>("/v1/work/assessments", {
        method: "POST",
        body: JSON.stringify({ citizen, lines: JSON.stringify(lines), mda_default: mda_default ?? "", notes: notes ?? "" }),
      }),
  });
}

export function useAssess() {
  return useMutation({
    mutationFn: (name: string) =>
      authFetch<Assessment>(`/v1/work/assessments/${encodeURIComponent(name)}:assess`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });
}

export function useAssessment(name: string | undefined, initialData?: Assessment) {
  return useQuery({
    queryKey: ["work", "assessment", name],
    queryFn: () => fetchAssessment(name!),
    enabled: !!name,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 5_000,
    retry: false,
  });
}

export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: ({
      assessment,
      channel,
      citizen_msisdn,
    }: {
      assessment: string;
      channel: string;
      // Required when channel is "MTN MoMo" or "Airtel Money" — the
      // mobile-money adapters call the aggregator with this as the
      // payer's partyId (MSISDN). MTN's Collections API returns HTTP
      // 400 if it's empty or malformed.
      citizen_msisdn?: string;
    }) =>
      authFetch<PaymentIntent>("/v1/work/payment-intents", {
        method: "POST",
        body: JSON.stringify({
          assessment,
          channel,
          citizen_msisdn: citizen_msisdn ?? "",
        }),
      }),
  });
}

export function useInitiatePayment() {
  return useMutation({
    mutationFn: (name: string) =>
      authFetch<PaymentIntent>(`/v1/work/payment-intents/${encodeURIComponent(name)}:initiate`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });
}

export function useConfirmPayment() {
  return useMutation({
    mutationFn: (name: string) =>
      authFetch<PaymentIntent>(`/v1/work/payment-intents/${encodeURIComponent(name)}:confirm`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  });
}

// The live-status endpoint returns a side-by-side {stored, live, match} — the
// aggregator's current view is at `.live.status`, NOT the top level.
export type LiveStatus = {
  queried_at: string;
  aggregator?: string;
  aggregator_reference?: string | null;
  stored: { status: string; confirmed_at?: string | null };
  live: { status: string; txn_id?: string | null; settled_at?: string | null; stub?: boolean };
  match: boolean;
};

export function usePaymentLiveStatus(name: string | undefined) {
  return useQuery({
    queryKey: ["work", "payment", "live", name],
    queryFn: () => authFetch<LiveStatus>(`/v1/work/payment-intents/${encodeURIComponent(name!)}/live-status`),
    enabled: !!name,
    refetchInterval: 3_000,
    retry: false,
  });
}

export type PaymentBreakdown = {
  intent: string;
  channel?: string;
  currency: string;
  amount: number;
  status: string;
  aggregator?: string | null;
  fdn?: string | null;
  settled_total: number;
  splits: {
    mda: string;
    mda_code: string;
    mda_name: string;
    amount: number;
    share_pct: number;
    destination_account: string;
    account_name?: string | null;
    bank?: string | null;
    account_type: string;
    settled: boolean;
    txn_id?: string | null;
    settled_at?: string | null;
  }[];
};

export function usePaymentBreakdown(name: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["work", "payment", "breakdown", name],
    queryFn: () =>
      authFetch<PaymentBreakdown>(`/v1/work/payment-intents/${encodeURIComponent(name!)}/breakdown`),
    enabled: enabled && !!name,
    staleTime: 30_000,
    retry: false,
  });
}

export function useRefundPayment() {
  return useMutation({
    mutationFn: (vars: { intent: string; reason: string; supervisor_pin: string }) =>
      authFetch<{ intent: PaymentIntent }>(
        `/v1/work/payment-intents/${encodeURIComponent(vars.intent)}:refund`,
        { method: "POST", body: JSON.stringify({ reason: vars.reason, supervisor_pin: vars.supervisor_pin }) },
      ),
  });
}

export function useVoidAssessment() {
  return useMutation({
    mutationFn: (vars: { name: string; reason: string }) =>
      authFetch<Assessment>(`/v1/work/assessments/${encodeURIComponent(vars.name)}:void`, {
        method: "POST",
        body: JSON.stringify({ reason: vars.reason }),
      }),
  });
}

export function useApplyDiscount() {
  return useMutation({
    mutationFn: (vars: { name: string; amount: number; reason: string; supervisor_pin: string }) =>
      authFetch<Assessment>(`/v1/work/assessments/${encodeURIComponent(vars.name)}:waive`, {
        method: "POST",
        body: JSON.stringify({ amount: vars.amount, reason: vars.reason, supervisor_pin: vars.supervisor_pin }),
      }),
  });
}

export function useSupervisorDashboard(initialData?: SupervisorDashboard) {
  return useQuery({
    queryKey: ["work", "supervisor", "dashboard"],
    queryFn: fetchSupervisorDashboard,
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    staleTime: 15_000,
    retry: false,
  });
}

export function useResolveFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, status, note }: { name: string; status: string; note?: string }) =>
      authFetch<{ name: string; status: string }>(
        `/v1/work/supervisor/flags/${encodeURIComponent(name)}:resolve`,
        { method: "POST", body: JSON.stringify({ status, note: note ?? "" }) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work", "supervisor"] }),
  });
}

export function useApproveVariance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, note }: { name: string; note?: string }) =>
      authFetch<{ name: string; variance_status: string }>(
        `/v1/work/supervisor/shifts/${encodeURIComponent(name)}:approve-variance`,
        { method: "POST", body: JSON.stringify({ note: note ?? "" }) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work", "supervisor"] }),
  });
}

export function useRejectVariance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, note }: { name: string; note?: string }) =>
      authFetch<{ name: string; variance_status: string }>(
        `/v1/work/supervisor/shifts/${encodeURIComponent(name)}:reject-variance`,
        { method: "POST", body: JSON.stringify({ note: note ?? "" }) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work", "supervisor"] }),
  });
}

export function useWorkSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await fetch("/api/method/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    qc.invalidateQueries({ queryKey: ["work", "whoami"] });
  };
}
