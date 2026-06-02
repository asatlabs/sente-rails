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
// Service Notices — operator-curated public announcements served from
// /v1/notices. Consumed by the landing page banner (and by any other
// surface that wants to surface upstream changes — dashboard top, ops
// console homepage, etc.).

import { useQuery } from "@tanstack/react-query";
import { makeApiUrl } from "@/lib/api";

export type NoticeSeverity = "Critical" | "Warning" | "Info";

export interface ServiceNotice {
  name: string;
  title: string;
  body: string;
  severity: NoticeSeverity;
  mda: string | null;
  effective_from: string;
  effective_to: string | null;
  active: 0 | 1;
}

export async function fetchNotices(mda?: string): Promise<ServiceNotice[]> {
  const params = new URLSearchParams({ active: "1" });
  if (mda) params.set("mda", mda);
  const res = await fetch(makeApiUrl(`/v1/notices?${params.toString()}`));
  if (!res.ok) {
    // Don't throw — notices are best-effort UI sugar. A 5xx here
    // shouldn't take down the whole landing page.
    return [];
  }
  const body = await res.json();
  return Array.isArray(body) ? body : (body.data ?? []);
}

export function useNotices(mda?: string) {
  return useQuery({
    queryKey: ["notices", mda ?? "_all"],
    queryFn: () => fetchNotices(mda),
    staleTime: 60_000,
  });
}

export function severityClasses(s: NoticeSeverity): {
  border: string;
  bg: string;
  badge: string;
  dot: string;
} {
  switch (s) {
    case "Critical":
      return {
        border: "border-l-destructive",
        bg: "bg-destructive/5",
        badge: "bg-destructive/15 text-destructive",
        dot: "bg-destructive",
      };
    case "Warning":
      return {
        border: "border-l-warning",
        bg: "bg-warning/5",
        badge: "bg-warning/15 text-warning-foreground",
        dot: "bg-warning",
      };
    case "Info":
    default:
      return {
        border: "border-l-info",
        bg: "bg-info/5",
        badge: "bg-info/15 text-info",
        dot: "bg-info",
      };
  }
}
