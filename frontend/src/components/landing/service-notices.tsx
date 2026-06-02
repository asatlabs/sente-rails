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
// Service Notices banner — operator-curated announcements rendered
// between the StatusStrip and the Pillars section. Renders nothing
// when there are no active notices (clean empty state).
//
// Severity-tinted left border + small severity badge + optional MDA
// badge for scoped notices. Body preserves paragraph breaks at the
// blank-line boundary so admins can write multi-paragraph announcements.

import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { severityClasses, type ServiceNotice } from "@/lib/notices";

interface Props {
  notices: ServiceNotice[];
}

export function ServiceNoticesStrip({ notices }: Props) {
  if (notices.length === 0) return null;

  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Megaphone className="h-3.5 w-3.5" />
          Service notices
        </div>
        <ul className="space-y-3">
          {notices.map((n) => (
            <NoticeCard key={n.name} notice={n} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function NoticeCard({ notice }: { notice: ServiceNotice }) {
  const s = severityClasses(notice.severity);
  return (
    <li
      className={`rounded-md border border-border border-l-4 ${s.border} ${s.bg} p-4`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`border-0 text-[10px] ${s.badge}`}>{notice.severity}</Badge>
        {notice.mda && (
          <Badge className="border-0 bg-muted text-[10px] text-muted-foreground">
            {notice.mda}
          </Badge>
        )}
        {!notice.mda && (
          <span className="text-[11px] text-muted-foreground">Platform-wide</span>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {formatEffectiveFrom(notice.effective_from)}
        </span>
      </div>
      <h3 className="mt-2 font-display text-base font-semibold text-foreground">
        {notice.title}
      </h3>
      {notice.body && (
        <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {notice.body
            .split(/\n\s*\n/)
            .map((para, i) => (
              <p key={i} className={i > 0 ? "mt-2" : ""}>
                {para}
              </p>
            ))}
        </div>
      )}
    </li>
  );
}

function formatEffectiveFrom(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
