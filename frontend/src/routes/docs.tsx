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
// /docs — layout shell shared by the developer hub landing + every sub-page.
// Children render via <Outlet/>; the sidebar + TOC come from DocsLayout.

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DocsLayout } from "@/lib/docs/layout";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation · Sente Rails" },
      {
        name: "description",
        content:
          "Integration guides, standards and reference documentation for building citizen and business services on top of Sente Rails.",
      },
    ],
  }),
  component: DocsShell,
});

function DocsShell() {
  return (
    <DocsLayout>
      <Outlet />
    </DocsLayout>
  );
}
