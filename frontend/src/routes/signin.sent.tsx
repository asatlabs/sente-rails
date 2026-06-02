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
// /login/sent — confirmation after POST /v1/login/request.
//
// Displays the uniform "if-active-we-sent-something" message. Never reveals
// whether the email is registered — both the success and the silent-failure
// paths land here.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, ArrowLeft, ArrowRight, FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Search = { email?: string };

const DEV_CONSUME_URL_KEY = "sente:dev_consume_url";

export const Route = createFileRoute("/signin/sent")({
  validateSearch: (s): Search => ({
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Check your email · Sente Rails" },
      {
        name: "description",
        content: "We just sent a one-click sign-in link to your registered email.",
      },
    ],
  }),
  component: LoginSentPage,
});

function LoginSentPage() {
  const { email } = Route.useSearch();
  const [devUrl, setDevUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const url = sessionStorage.getItem(DEV_CONSUME_URL_KEY);
      if (url) {
        setDevUrl(url);
        sessionStorage.removeItem(DEV_CONSUME_URL_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Check your email
        </h1>
        <p className="mt-2 text-muted-foreground">
          If an active integrator is registered for{" "}
          {email ? (
            <span className="font-mono text-foreground">{email}</span>
          ) : (
            "that address"
          )}
          , we just sent a one-click sign-in link. It is valid for 15 minutes.
        </p>
      </div>

      {devUrl && (
        <Card className="mb-4 border-warning/40 bg-warning/5 shadow-sm">
          <CardContent className="space-y-3 p-5 text-sm">
            <div className="flex items-start gap-2">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
              <div>
                <p className="font-medium text-foreground">Dev mode — sign-in link below</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This sandbox isn&apos;t wired to a real email service yet, so the link is
                  shown inline. Click it to sign in. This banner does not appear on real
                  deployments.
                </p>
              </div>
            </div>
            <Button asChild className="w-full">
              <a href={devUrl}>
                Continue sign-in <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
            <p className="break-all rounded-md border border-border bg-surface-muted p-2 font-mono text-[11px] text-muted-foreground">
              {devUrl}
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <CardContent className="space-y-4 p-6 text-sm">
          <div className="space-y-2">
            <p className="font-medium text-foreground">Didn&apos;t get it?</p>
            <ul className="ml-5 list-disc space-y-1 text-muted-foreground">
              <li>Check your spam folder.</li>
              <li>Make sure the email you used matches the one on your integrator profile.</li>
              <li>
                If you haven&apos;t signed up yet, do that first at{" "}
                <Link to="/signup" className="text-primary hover:underline">
                  /signup
                </Link>
                .
              </li>
              <li>
                Try again at{" "}
                <Link to="/signin" className="text-primary hover:underline">
                  /signin
                </Link>{" "}
                — resends are rate-limited to one per 60 seconds and 5 per day.
              </li>
            </ul>
          </div>

          <div className="border-t border-border pt-4">
            <Button asChild variant="outline" size="sm">
              <Link to="/signin">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to sign in
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
