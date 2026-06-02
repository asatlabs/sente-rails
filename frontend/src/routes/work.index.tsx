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
// /work — landing. Redirects to the role-appropriate surface.

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { fetchWorkWhoami, useWorkWhoami, type WorkWhoami } from "@/lib/work";

export const Route = createFileRoute("/work/")({
  loader: () => fetchWorkWhoami().catch(() => null as WorkWhoami | null),
  component: WorkIndex,
});

function WorkIndex() {
  const router = useRouter();
  const initialWho = Route.useLoaderData();
  const { data: who } = useWorkWhoami(initialWho ?? undefined);
  useEffect(() => {
    if (!who?.authenticated) return;
    if (who.is_clerk) {
      router.navigate({ to: "/work/shift" });
    } else if (who.is_supervisor || who.is_admin) {
      router.navigate({ to: "/work/supervisor" });
    }
  }, [who, router]);
  return <p className="text-center text-muted-foreground">Routing…</p>;
}
