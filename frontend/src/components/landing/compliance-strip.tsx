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
// Compliance strip — the seven Ugandan frameworks the architecture
// addresses. Compact pill row + the one-line trust statement that
// the rail never holds public money (PFMA §43).

import { Link } from "@tanstack/react-router";

const FRAMEWORKS = [
  "Data Protection & Privacy Act 2019",
  "National Payment Systems Act 2020",
  "PFMA 2015 §43",
  "Tax Procedures Code 2014",
  "Access to Information Act 2005",
  "Computer Misuse Act 2011",
  "e-Gov Interoperability Framework",
];

export function ComplianceStrip() {
  return (
    <section className="border-b border-border bg-surface-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Built to the standards that matter
          </p>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The architecture addresses the seven Ugandan frameworks
            integration with government revenue must satisfy. The rail
            never holds public money — settlement routes direct to each
            MDA&apos;s treasury account.
          </p>
          <ul className="flex flex-wrap justify-center gap-1.5">
            {FRAMEWORKS.map((f) => (
              <li
                key={f}
                className="rounded-full border border-border bg-background px-3 py-1 text-[11px] text-muted-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
          <Link
            to="/docs/security"
            className="text-sm font-medium text-primary hover:underline"
          >
            Read the security & compliance brief →
          </Link>
        </div>
      </div>
    </section>
  );
}
