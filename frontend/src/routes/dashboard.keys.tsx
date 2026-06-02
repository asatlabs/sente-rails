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
// /dashboard/keys — list every key the signed-in integrator holds + rotate/revoke actions.
// New key plaintext appears once after rotate; the user MUST copy it before navigating away.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldX,
  TriangleAlert,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchMyKeys, useMyKeys, useRotateKey, useRevokeKey, type MeKey, type RotateResult } from "@/lib/me";

export const Route = createFileRoute("/dashboard/keys")({
  head: () => ({ meta: [{ title: "API keys · Sente Rails" }] }),
  // SSR loader — populates the keys list on first paint so signed-in
  // users don't see a "Loading…" flicker after hydration. Falls back to
  // [] on auth failure or backend hiccup; useMyKeys() below takes over
  // for refetch + post-mutation invalidation.
  loader: () => fetchMyKeys().catch(() => [] as MeKey[]),
  component: KeysPage,
});

const STATUS_PILL: Record<string, string> = {
  active: "bg-success/15 text-success border-0",
  rolling: "bg-info/15 text-info border-0",
  revoked: "bg-destructive/15 text-destructive border-0",
  expired: "bg-muted text-muted-foreground border-0",
};

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function KeysPage() {
  const initialKeys = Route.useLoaderData();
  const { data: keys = initialKeys, isLoading } = useMyKeys(initialKeys);
  const [rotateTarget, setRotateTarget] = useState<MeKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<MeKey | null>(null);
  const [rotated, setRotated] = useState<RotateResult | null>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          API keys
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rotate replaces a key with a fresh one and keeps the old key active for a
          grace window (default 24 hours). Revoke is immediate and permanent.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading keys…
        </div>
      )}

      {!isLoading && keys.length === 0 && (
        <Card className="border-border shadow-none">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              No keys on this account yet. Sandbox keys are issued at signup —
              if you reached this page another way, contact ops at{" "}
              <a href="mailto:asatlabs@gmail.com" className="text-primary hover:underline">
                asatlabs@gmail.com
              </a>.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {keys.map((k) => (
          <Card key={k.name} className="border-border shadow-none">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-mono text-sm">
                        {k.prefix}_••••••••••••••••••••••{k.last4}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {k.name} · {k.environment} · scopes:{" "}
                        <span className="font-mono">{k.scopes.length}</span>
                      </p>
                    </div>
                    <Badge className={STATUS_PILL[k.status] ?? STATUS_PILL.expired}>
                      {k.status}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <div>
                      <p className="uppercase tracking-wider">Created</p>
                      <p className="mt-0.5 font-mono text-foreground">{fmt(k.created_at)}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wider">Expires</p>
                      <p className="mt-0.5 font-mono text-foreground">{fmt(k.expires_at)}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wider">Last used</p>
                      <p className="mt-0.5 font-mono text-foreground">{fmt(k.last_used_at)}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wider">Calls</p>
                      <p className="mt-0.5 font-mono text-foreground">{k.usage_count}</p>
                    </div>
                  </div>

                  {k.status === "rolling" && (
                    <p className="mt-3 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
                      Rolling — accepts traffic alongside the new key until{" "}
                      <span className="font-mono">{fmt(k.rolling_until)}</span>.
                      Replaced by{" "}
                      <code className="rounded bg-background px-1 font-mono">{k.rolled_to}</code>.
                    </p>
                  )}
                  {k.status === "revoked" && k.revoked_reason && (
                    <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      Revoked {fmt(k.revoked_at)} — {k.revoked_reason}
                    </p>
                  )}
                </div>

                {(k.status === "active" || k.status === "rolling") && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRotateTarget(k)}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" /> Rotate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRevokeTarget(k)}
                    >
                      <ShieldX className="mr-1 h-3.5 w-3.5" /> Revoke
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {rotateTarget && (
        <RotateDialog
          target={rotateTarget}
          onClose={() => setRotateTarget(null)}
          onSuccess={(r) => {
            setRotated(r);
            setRotateTarget(null);
          }}
        />
      )}
      {revokeTarget && (
        <RevokeDialog
          target={revokeTarget}
          onClose={() => setRevokeTarget(null)}
        />
      )}
      {rotated && <RotatedPlaintextDialog rotated={rotated} onClose={() => setRotated(null)} />}
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────

function RotateDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: MeKey;
  onClose: () => void;
  onSuccess: (r: RotateResult) => void;
}) {
  const [grace, setGrace] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const rotate = useRotateKey();

  return (
    <Dialog open onOpenChange={(o) => !o && !rotate.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate this key?</DialogTitle>
          <DialogDescription>
            A new key with the same scopes will be issued. The current key keeps
            working as &quot;rolling&quot; for the grace window you set below, then
            expires. Update your applications to use the new plaintext before the
            grace window closes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-md border border-border bg-surface-muted p-3 font-mono text-xs">
            {target.name} · {target.prefix}_***{target.last4}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="grace">Grace window (hours)</Label>
            <Input
              id="grace"
              type="number"
              min={1}
              max={168}
              value={grace}
              onChange={(e) => setGrace(Math.max(1, Math.min(168, Number(e.target.value) || 24)))}
              disabled={rotate.isPending}
            />
            <p className="text-xs text-muted-foreground">
              How long the old key keeps accepting traffic. 1–168 hours.
            </p>
          </div>
          {error && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={rotate.isPending}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              setError(null);
              try {
                const r = await rotate.mutateAsync({ name: target.name, grace_hours: grace });
                onSuccess(r);
              } catch (err) {
                setError((err as Error)?.message ?? "Rotate failed.");
              }
            }}
            disabled={rotate.isPending}
          >
            {rotate.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Rotating…
              </>
            ) : (
              <>
                Rotate <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({
  target,
  onClose,
}: {
  target: MeKey;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const revoke = useRevokeKey();

  return (
    <Dialog open onOpenChange={(o) => !o && !revoke.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this key immediately?</DialogTitle>
          <DialogDescription>
            Revoked keys can&apos;t be restored. Any application using this key
            will start receiving 401 responses immediately. To restore service,
            rotate a different key or contact ops for a fresh issuance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-md border border-border bg-surface-muted p-3 font-mono text-xs">
            {target.name} · {target.prefix}_***{target.last4}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you revoking this key?"
              disabled={revoke.isPending}
              maxLength={280}
            />
            <p className="text-xs text-muted-foreground">
              Stays on the audit record. Required.
            </p>
          </div>
          {error && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={revoke.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              setError(null);
              try {
                await revoke.mutateAsync({ name: target.name, reason });
                onClose();
              } catch (err) {
                setError((err as Error)?.message ?? "Revoke failed.");
              }
            }}
            disabled={revoke.isPending || !reason.trim()}
          >
            {revoke.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Revoking…
              </>
            ) : (
              <>Revoke permanently</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RotatedPlaintextDialog({
  rotated,
  onClose,
}: {
  rotated: RotateResult;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your new key</DialogTitle>
          <DialogDescription>
            Copy this plaintext now — it cannot be retrieved later. The old key
            keeps working until its grace window closes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
            <p className="font-medium text-foreground">{rotated.plaintext_warning}</p>
          </div>
          <div className="rounded-md border border-border bg-surface-muted p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {rotated.new_key.prefix}_***{rotated.new_key.last4}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-3 py-2 font-mono text-xs">
                {revealed
                  ? rotated.plaintext
                  : `${rotated.new_key.prefix}_••••••••••••••••••••••${rotated.new_key.last4}`}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRevealed((r) => !r)}
              >
                {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(rotated.plaintext);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  } catch {
                    // ignore
                  }
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>I&apos;ve copied it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
