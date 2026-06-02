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
// Live status strip — single thin line under the hero. Data flows in via
// props from the `/` route's loader so the counts are rendered into the
// SSR HTML on first paint, no client-side flicker.

import type { Agency } from "@/lib/agencies";
import type { Service } from "@/lib/services";

interface Props {
  agencies: Agency[];
  services: Service[];
}

export function StatusStrip({ agencies, services }: Props) {
  const sandbox = agencies.filter((a) => a.status === "sandbox").length;
  const live = agencies.filter((a) => a.status === "live").length;

  return (
    <div className="border-b border-border bg-surface-muted/40">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 text-[12px] text-muted-foreground sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Sandbox open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          MoMo sandbox live
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-info" />
          <span className="font-mono text-foreground">{agencies.length}</span>{" "}
          MDAs catalogued
          <span className="text-muted-foreground/70">
            · {sandbox} sandbox · {live} live
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-info" />
          <span className="font-mono text-foreground">{services.length}</span>{" "}
          services available
        </span>
        <a
          href="https://github.com/asatlabs/sente-rails"
          target="_blank"
          rel="noreferrer"
          className="ml-auto hidden sm:inline hover:text-foreground"
        >
          Apache 2.0 · Open source ↗
        </a>
      </div>
    </div>
  );
}
