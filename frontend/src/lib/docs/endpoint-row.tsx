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
// EndpointRow — single-row endpoint reference for inline-doc usage.
// Pattern: [METHOD] /v1/path  —  short description
// Used in API-standards and webhook reference tables.

import { MethodBadge, type HttpMethod } from "./method-badge";
import { ArrowRight } from "lucide-react";

export type EndpointRowProps = {
  method: HttpMethod;
  path: string;
  description: string;
  /** Optional auth requirement label, e.g. "guest" / "bearer" / "mTLS". */
  auth?: string;
};

export function EndpointRow({ method, path, description, auth }: EndpointRowProps) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0">
      <div className="w-14 shrink-0 pt-0.5">
        <MethodBadge method={method} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[13px] text-foreground">{path}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>
      </div>
      {auth && (
        <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          {auth}
        </span>
      )}
      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
    </div>
  );
}
