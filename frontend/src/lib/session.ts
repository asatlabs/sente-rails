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
// Workbench-side hook for the integrator session.
//
// Polls /v1/session — a lightweight "who am I" endpoint that returns
// {authenticated, integrator?} based on the sente_session cookie.
// The hook caches for 30 seconds, refetches on window focus, and is
// safe to call from any client component (AppSidebar, /dashboard, etc.).

import { useQuery, useQueryClient } from "@tanstack/react-query";

export type SessionIntegrator = {
  code: string;
  display_name: string;
  contact_email: string;
  tier: string;
  pricing_tier: string;
  last_login_at: string | null;
};

export type Session =
  | { authenticated: false }
  | { authenticated: true; integrator: SessionIntegrator };

async function fetchSession(): Promise<Session> {
  const res = await fetch("/v1/session", { credentials: "include" });
  if (!res.ok) {
    return { authenticated: false };
  }
  const json = await res.json();
  return (json?.data ?? { authenticated: false }) as Session;
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await fetch("/v1/logout", { method: "POST", credentials: "include" });
    } catch {
      // best-effort
    }
    qc.invalidateQueries({ queryKey: ["session"] });
  };
}
