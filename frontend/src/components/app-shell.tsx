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
// PageHeader — shared page-title block used inside dashboard / ops / work
// surfaces. The original ``AppShell`` (sidebar + workbench topbar with
// the hardcoded template user widget) was removed in the Phase 1
// IA cleanup; routes either get the new MarketingShell at the root level
// or carry their own shell (/ops/*, /work/*). Keep this file solely for
// the PageHeader export until Phase 2 retires the last usages.

import { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-border pb-5">
      <div className="space-y-1.5">
        {meta && (
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            {meta}
          </div>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight lg:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
