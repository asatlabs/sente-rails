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
// Live agency data for the workbench. Fetches /v1/mdas from the Sente Rails
// Frappe upstream and shapes the response into the `Agency` type the template
// renders. Public read, no auth — `list_mdas` is `allow_guest=True`.
//
// Used by: routes/index.tsx (Connected Agencies panel, first 6),
//          routes/agencies.tsx (full directory table),
//          routes/services.tsx (service catalogue cards).

import { useQuery } from "@tanstack/react-query";
import { makeApiUrl } from "@/lib/api";

// Honest integration-maturity ladder. Mirrors the `MDA.integration_status`
// Select on the Frappe side (Live / Sandbox / Planned / Inquiry).
//   live    — operational, passing real traffic
//   sandbox — adapter built, credentials active or pending
//   planned — roadmap-committed, ~14 days from MoU per architecture velocity
//   inquiry — relationship exploratory, no MoU yet
export type AgencyStatus = "live" | "sandbox" | "planned" | "inquiry";

export type Agency = {
  code: string;
  name: string;
  full: string;
  category: string;
  endpoints: number;
  /** True when `endpoints` is the operator-curated target, not a real Service count. */
  endpoints_is_target: boolean;
  status: AgencyStatus;
  mode: "A" | "B" | "C";
  /** Real telemetry — undefined until we wire the request-metrics backend. */
  uptime?: number;
  latency?: number;
};

type MDARow = {
  name: string;
  short_code: string;
  full_name: string;
  mda_type: string;
  country: string;
  mode: "A" | "B" | "C";
  status: "Active" | "Onboarding" | "Suspended" | string;
  parent_authority: string | null;
  treasury_account: string | null;
  sector: string | null;
  integration_status: "Live" | "Sandbox" | "Planned" | "Inquiry" | string | null;
  target_endpoint_count: number | null;
  endpoint_count: number;
  display_endpoint_count: number;
};

const STATUS_MAP: Record<string, AgencyStatus> = {
  Live: "live",
  Sandbox: "sandbox",
  Planned: "planned",
  Inquiry: "inquiry",
};

function mdaToAgency(m: MDARow): Agency {
  return {
    code: m.short_code,
    name: m.short_code,
    full: m.full_name,
    // Workbench category column shows the functional sector (Revenue, Identity,
    // Lands, ...). Fall back to the entity-type if sector isn't set yet.
    category: m.sector || m.mda_type,
    endpoints: m.display_endpoint_count ?? m.endpoint_count ?? 0,
    endpoints_is_target: (m.endpoint_count ?? 0) === 0 && (m.target_endpoint_count ?? 0) > 0,
    status: STATUS_MAP[m.integration_status || ""] ?? "planned",
    mode: m.mode,
    // No telemetry yet — leave undefined; the UI renders "—".
    uptime: undefined,
    latency: undefined,
  };
}

export async function fetchAgencies(): Promise<Agency[]> {
  const res = await fetch(makeApiUrl("/v1/mdas"));
  if (!res.ok) {
    throw new Error(`Failed to load agencies (${res.status})`);
  }
  const json = await res.json();
  const rows: MDARow[] = Array.isArray(json) ? json : (json.data ?? []);
  return rows.map(mdaToAgency);
}

export function useAgencies() {
  return useQuery({
    queryKey: ["agencies"],
    queryFn: fetchAgencies,
    staleTime: 60_000,
  });
}

// Shared helper for the workbench status pill so the three consumer routes
// stay in sync as we tune the colour palette.
export function statusPillClass(status: AgencyStatus): string {
  switch (status) {
    case "live":
      return "bg-success/15 text-success border-0";
    case "sandbox":
      return "bg-info/15 text-info border-0";
    case "planned":
      return "bg-muted text-muted-foreground border-0";
    case "inquiry":
      return "bg-warning/15 text-warning-foreground border-0";
  }
}

export function statusLabel(status: AgencyStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "sandbox":
      return "Sandbox";
    case "planned":
      return "Planned";
    case "inquiry":
      return "Inquiry";
  }
}
