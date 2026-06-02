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
// Callout — semantic-coloured callout boxes for docs prose.
// Four variants: info (blue), tip (green), warning (amber), danger (red).
// Matches the workbench's existing palette (success / info / warning).

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type CalloutVariant = "info" | "tip" | "warning" | "danger";

type Variant = {
  icon: LucideIcon;
  container: string;
  iconClass: string;
  title: string;
};

const VARIANTS: Record<CalloutVariant, Variant> = {
  info: {
    icon: Info,
    container: "border-info/30 bg-info/5",
    iconClass: "text-info",
    title: "Note",
  },
  tip: {
    icon: CheckCircle2,
    container: "border-success/30 bg-success/5",
    iconClass: "text-success",
    title: "Tip",
  },
  warning: {
    icon: AlertTriangle,
    container: "border-warning/40 bg-warning/10",
    iconClass: "text-warning-foreground",
    title: "Watch out",
  },
  danger: {
    icon: XCircle,
    container: "border-destructive/30 bg-destructive/5",
    iconClass: "text-destructive",
    title: "Important",
  },
};

export type CalloutProps = {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
};

export function Callout({ variant = "info", title, children }: CalloutProps) {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  const heading = title ?? v.title;

  return (
    <div
      className={`my-4 flex gap-3 rounded-md border px-4 py-3 ${v.container}`}
      role={variant === "danger" || variant === "warning" ? "alert" : "note"}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${v.iconClass}`} aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-foreground">{heading}</p>
        <div className="mt-1 text-muted-foreground [&_p]:my-1 [&_a]:text-primary [&_a]:underline">
          {children}
        </div>
      </div>
    </div>
  );
}
