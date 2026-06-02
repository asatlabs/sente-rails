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
// /dashboard/settings — editable subset of the integrator profile.
//
// Email change is deliberately out of scope here: rotating contact_email
// requires re-running the OTP loop against the new address (queued for a
// follow-up). For now: change display name, webhook endpoint, IP allowlist,
// volume estimates.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, TriangleAlert, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchMe, useMe, useUpdateMe, type MeProfile } from "@/lib/me";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings · Sente Rails" }] }),
  loader: () => fetchMe().catch(() => null as MeProfile | null),
  component: SettingsPage,
});

function SettingsPage() {
  const initialMe = Route.useLoaderData();
  const { data: me, isLoading } = useMe(initialMe ?? undefined);
  const update = useUpdateMe();

  const [displayName, setDisplayName] = useState("");
  const [webhook, setWebhook] = useState("");
  const [allowlist, setAllowlist] = useState("");
  const [volDay, setVolDay] = useState<string>("");
  const [volMonth, setVolMonth] = useState<string>("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setDisplayName(me.display_name || "");
    setWebhook(me.webhook_endpoint || "");
    setAllowlist(me.ip_allowlist || "");
    setVolDay(me.anticipated_volume_daily?.toString() ?? "");
    setVolMonth(me.anticipated_volume_monthly?.toString() ?? "");
  }, [me]);

  if (isLoading || !me) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
    );
  }

  const dirty =
    displayName !== (me.display_name || "") ||
    webhook !== (me.webhook_endpoint || "") ||
    allowlist !== (me.ip_allowlist || "") ||
    volDay !== (me.anticipated_volume_daily?.toString() ?? "") ||
    volMonth !== (me.anticipated_volume_monthly?.toString() ?? "");

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({
        display_name: displayName,
        webhook_endpoint: webhook || null,
        ip_allowlist: allowlist || null,
        anticipated_volume_daily: volDay ? Number(volDay) : 0,
        anticipated_volume_monthly: volMonth ? Number(volMonth) : 0,
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as Error)?.message ?? "Save failed.");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account profile + integration endpoints. Changes apply immediately
          to your /v1 traffic.
        </p>
      </header>

      <form onSubmit={onSave} className="space-y-4">
        <Card className="border-border shadow-none">
          <CardContent className="space-y-5 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={140}
                disabled={update.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Shown on the dashboard. Has no effect on /v1 auth.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact_email">Contact email</Label>
              <Input
                id="contact_email"
                value={me.contact_email}
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Email changes require re-verification via OTP — contact ops at{" "}
                <a href="mailto:asatlabs@gmail.com" className="text-primary hover:underline">
                  asatlabs@gmail.com
                </a>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="webhook">Webhook endpoint</Label>
              <Input
                id="webhook"
                type="url"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://your-app.example.com/sente/events"
                disabled={update.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Where Sente Rails delivers /v1 event notifications. Must be HTTPS in
                production. Leave blank to disable webhook delivery.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="allowlist">IP allowlist</Label>
              <Input
                id="allowlist"
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                placeholder="10.0.0.0/8, 203.0.113.42/32"
                disabled={update.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated CIDR ranges. Requests from outside these ranges
                are rejected. Leave blank to accept any source.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardContent className="space-y-5 p-5">
            <div>
              <h2 className="font-display text-base font-semibold">
                Anticipated volume
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Helps us tune rate-limits + anomaly thresholds for your account.
                Rough estimates are fine.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vol_day">Calls per day (peak)</Label>
                <Input
                  id="vol_day"
                  type="number"
                  min={0}
                  value={volDay}
                  onChange={(e) => setVolDay(e.target.value)}
                  disabled={update.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vol_month">Calls per month</Label>
                <Input
                  id="vol_month"
                  type="number"
                  min={0}
                  value={volMonth}
                  onChange={(e) => setVolMonth(e.target.value)}
                  disabled={update.isPending}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {savedAt && !dirty && (
          <div className="flex gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Saved.
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="submit"
            disabled={!dirty || update.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {update.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
