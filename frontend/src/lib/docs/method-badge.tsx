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
// MethodBadge — HTTP method pill (GET / POST / PUT / PATCH / DELETE).
// Colour-coded per common REST convention: GET green, POST blue, PUT amber,
// DELETE red, PATCH violet. Follows the convention used by Stripe /
// Postman-style references.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const STYLES: Record<HttpMethod, string> = {
  GET: "bg-success/15 text-success",
  POST: "bg-info/15 text-info",
  PUT: "bg-warning/20 text-warning-foreground",
  PATCH: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  DELETE: "bg-destructive/15 text-destructive",
};

export function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider ${STYLES[method]}`}
    >
      {method}
    </span>
  );
}
