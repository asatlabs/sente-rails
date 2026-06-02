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
// /login — integrator sign-in by magic-link.
//
// Form -> POST /v1/login/request -> /login/sent. The server response is
// deliberately uniform regardless of whether the email is registered,
// so the only state we surface is "we sent something" or "validation
// failed at the wire" (e.g. malformed email).

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2, LogIn, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signin/")({
  head: () => ({
    meta: [
      { title: "Sign in · Sente Rails" },
      {
        name: "description",
        content:
          "Sign in to your Sente Rails integrator dashboard. We email you a one-click link — no password to remember.",
      },
    ],
  }),
  component: LoginPage,
});

type ApiResponse<T> = { data?: T; error?: { code: string; message: string; request_id?: string } };

const DEV_CONSUME_URL_KEY = "sente:dev_consume_url";

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/v1/login/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as ApiResponse<{ message: string; dev_consume_url?: string }>;
      if (!res.ok || json.error) {
        setError(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      // Dev-mode reveal: if the server returned a consume URL, stash it for
      // /signin/sent to render inline. Real deployments never include this.
      try {
        if (json.data?.dev_consume_url) {
          sessionStorage.setItem(DEV_CONSUME_URL_KEY, json.data.dev_consume_url);
        } else {
          sessionStorage.removeItem(DEV_CONSUME_URL_KEY);
        }
      } catch {
        // Private browsing / disabled storage — surface nothing.
      }
      router.navigate({ to: "/signin/sent", search: { email } as never });
    } catch (err) {
      setError((err as Error)?.message ?? "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/5 text-primary">
          <LogIn className="h-6 w-6" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-2 text-muted-foreground">
          We&apos;ll email you a one-click sign-in link. No password to remember.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email on your integrator account</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="text-destructive">{error}</div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={submitting || !email}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending link…
                </>
              ) : (
                <>
                  Email me a sign-in link <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Don&apos;t have an account yet?{" "}
              <Link to="/signup" className="text-primary hover:underline">
                Sign up
              </Link>
              .
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
