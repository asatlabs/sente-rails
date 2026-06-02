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
// Live service-catalogue data for the developer hub. Fetches /v1/services
// and shapes the response into the `Service` type the catalogue table
// renders. Public read, no auth — `list_services` is `allow_guest=True`.
//
// Used by routes/docs.catalogue.services.tsx (the catalogue table).

import { useQuery } from "@tanstack/react-query";
import { makeApiUrl } from "@/lib/api";

export type ServiceFeeBasis = "Flat" | "Per-Day" | "Per-Unit" | "Tiered" | string;

export type Service = {
  /** Doctype name — e.g. "SVC-2026-000004". Stable identifier. */
  name: string;
  /** Owning MDA short_code — e.g. "GULU", "URA". */
  mda: string;
  /** Operator-curated short code within the MDA — e.g. "MD-CEREALS". */
  code: string;
  /** Display label — e.g. "Market Dues — Cereals Market". */
  service_name: string;
  /** Functional sector — e.g. "Local Government", "Revenue", "Lands". */
  sector: string | null;
  /** Family the service rolls up to — e.g. "Market Dues", "Land Lease". */
  service_family: string | null;
  /** Headline fee amount (in fee_currency). May be 0 for Tiered services. */
  fee_amount: number;
  fee_currency: string;
  fee_basis: ServiceFeeBasis;
  /** Pointer into Fee Schedule for Tiered/variable services. */
  fee_schedule_ref: string | null;
  /** Whether the service routes through EFRIS for fiscal receipting. */
  efris_taxable: 0 | 1;
  vat_applicable: 0 | 1;
  vat_rate: number;
  status: "Active" | "Suspended" | "Draft" | string;
};

export async function fetchServices(): Promise<Service[]> {
  const res = await fetch(makeApiUrl("/v1/services"));
  if (!res.ok) {
    throw new Error(`Failed to load services (${res.status})`);
  }
  const json = await res.json();
  const rows: Service[] = Array.isArray(json) ? json : (json.data ?? []);
  return rows;
}

export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
    staleTime: 60_000,
  });
}

export function feeLabel(svc: Pick<Service, "fee_amount" | "fee_currency" | "fee_basis" | "fee_schedule_ref">): string {
  if (svc.fee_basis === "Tiered" || svc.fee_schedule_ref) {
    return "Tiered";
  }
  const amount = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(svc.fee_amount);
  const basis = svc.fee_basis === "Flat" ? "" : ` · ${svc.fee_basis}`;
  return `${svc.fee_currency} ${amount}${basis}`;
}

export function efrisLabel(svc: Pick<Service, "efris_taxable" | "vat_rate" | "vat_applicable">): string {
  if (svc.efris_taxable && svc.vat_applicable) {
    return `EFRIS · VAT ${svc.vat_rate}%`;
  }
  if (svc.efris_taxable) {
    return "EFRIS · No VAT";
  }
  return "Non-fiscal";
}
