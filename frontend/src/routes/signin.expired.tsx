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
// /login/expired — landing when a magic-link is stale, malformed, or
// otherwise unusable. The /v1/login/consume endpoint redirects every
// failure mode here (token not found, token already consumed, token
// expired, integrator suspended) so attackers can't probe which tokens
// existed via differential responses.

import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/signin/expired")({
  head: () => ({
    meta: [
      { title: "Sign-in link expired · Sente Rails" },
      {
        name: "description",
        content: "That sign-in link is no longer valid. Request a fresh one.",
      },
    ],
  }),
  component: LoginExpiredPage,
});

function LoginExpiredPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Sign-in link expired
        </h1>
        <p className="mt-2 text-muted-foreground">
          Magic links are single-use and valid for 15 minutes. The one you
          clicked is either past its window, has already been used, or was
          never issued.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Request a fresh link — it will arrive in your inbox in a few seconds.
          </p>
          <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/signin">
              Send me a new sign-in link <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
