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
// /work/assess — the main counter screen.
// Citizen lookup -> service selection -> draft assessment -> assess (compute fees) -> proceed to collect.

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Search,
  TriangleAlert,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScanner } from "@/lib/use-scanner";
import {
  useActiveShift,
  useCitizenSearch,
  useRegisterCitizen,
  useWorkServices,
  useCreateAssessment,
  useAssess,
  useWorkWhoami,
  type Citizen,
  type Service,
} from "@/lib/work";

export const Route = createFileRoute("/work/assess")({
  head: () => ({ meta: [{ title: "Assess + Collect · Work" }] }),
  component: AssessPage,
});

type CartLine = {
  service: Service;
  quantity: number;
};

function AssessPage() {
  const router = useRouter();
  // The clerk's MDA is the server's truth (whoami.clerk_mda) — the same
  // source the shell uses for the header and the shift pill. A bound
  // single-MDA clerk never writes localStorage["work.mda"] (only admins
  // picking among several do), so reading that key alone left them stuck on
  // "Pick an MDA" with an open shift. Prefer the binding; fall back to the
  // localStorage pick for fleet/admin users who choose an MDA on the Shift screen.
  const { data: who, isLoading: whoLoading } = useWorkWhoami();
  const localMda = typeof window !== "undefined" ? localStorage.getItem("work.mda") || "" : "";
  const mda = (who?.authenticated ? who.clerk_mda ?? "" : "") || localMda;
  const { data: shift, isLoading: shiftLoading } = useActiveShift(mda);

  const [citizen, setCitizen] = useState<Citizen | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Durable transaction: an in-progress citizen + cart survive a refresh,
  // an accidental nav, or coming back from the collect screen. Rehydrate
  // after mount (client-only) so there's no SSR hydration mismatch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("work.draft");
      if (raw) {
        const d = JSON.parse(raw) as { mda?: string; citizen?: Citizen; cart?: CartLine[] };
        if (d.mda === mda) {
          if (d.citizen) setCitizen(d.citizen);
          if (Array.isArray(d.cart)) setCart(d.cart);
        }
      }
    } catch {
      /* corrupt draft — ignore */
    }
    setHydrated(true);
  }, [mda]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    if (!citizen && cart.length === 0) {
      localStorage.removeItem("work.draft");
      return;
    }
    localStorage.setItem("work.draft", JSON.stringify({ mda, citizen, cart }));
  }, [citizen, cart, mda, hydrated]);

  if (whoLoading && !mda) {
    return <p className="text-center text-muted-foreground">Loading…</p>;
  }
  if (!mda) {
    return (
      <Card className="border-border shadow-sm">
        <CardContent className="p-6 text-center">
          <p className="font-display text-lg">Pick an MDA on the Shift screen first.</p>
          <Button asChild className="mt-4">
            <a href="/work/shift">Go to Shift</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (shiftLoading) {
    return <p className="text-center text-muted-foreground">Checking shift status…</p>;
  }
  if (!shift) {
    return (
      <Card className="border-warning/40 bg-warning/5 shadow-sm">
        <CardContent className="p-6 text-center">
          <TriangleAlert className="mx-auto h-6 w-6 text-warning-foreground" />
          <p className="mt-3 font-display text-lg font-semibold">No active shift</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a shift before you can collect.
          </p>
          <Button asChild className="mt-4">
            <a href="/work/shift">Open shift</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
      <div className="space-y-5">
        <CitizenStep citizen={citizen} onCitizen={setCitizen} mda={mda} />
        {citizen && (
          <ServicesStep
            mda={mda}
            cart={cart}
            onAdd={(s) =>
              setCart((prev) => {
                const existing = prev.findIndex((l) => l.service.name === s.name);
                if (existing >= 0) {
                  const next = [...prev];
                  next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
                  return next;
                }
                return [...prev, { service: s, quantity: 1 }];
              })
            }
          />
        )}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <CartPanel
          citizen={citizen}
          cart={cart}
          mda={mda}
          onClear={() => setCart([])}
          onChange={setCart}
          onAssessed={(name) => {
            // Transaction has moved to the payment stage (durable by URL);
            // clear the in-progress draft so it doesn't resurface.
            if (typeof window !== "undefined") localStorage.removeItem("work.draft");
            router.navigate({ to: "/work/collect/$id", params: { id: name } });
          }}
        />
      </aside>
    </div>
  );
}

function CitizenStep({
  citizen,
  onCitizen,
  mda,
}: {
  citizen: Citizen | null;
  onCitizen: (c: Citizen | null) => void;
  mda: string;
}) {
  const [nin, setNin] = useState("");
  const [miss, setMiss] = useState(false);
  // A NIRA hit that isn't on the rail yet — has details but no local
  // docname, so it can't anchor an assessment until registered.
  const [niraHit, setNiraHit] = useState<Citizen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = useCitizenSearch();
  const register = useRegisterCitizen();

  async function runSearch(value: string) {
    const v = value.trim();
    if (!v) return;
    setNin(v);
    setMiss(false);
    setNiraHit(null);
    setError(null);
    try {
      const res = await search.mutateAsync(v);
      if (res.source === "local" && res.citizen?.name) {
        onCitizen(res.citizen);
      } else if (res.source === "nira" && res.citizen) {
        // Known to NIRA, not yet on the rail — offer to register.
        setNiraHit(res.citizen);
        onCitizen(null);
      } else {
        setMiss(true);
        onCitizen(null);
      }
    } catch {
      setMiss(true);
      onCitizen(null);
    }
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    void runSearch(nin);
  }

  // A NIN scanned while no field is focused (clerk's hands off the keyboard)
  // jumps straight to the citizen lookup — no click needed.
  useScanner({ onNin: (scanned) => void runSearch(scanned) });

  async function onRegister() {
    setError(null);
    try {
      const res = await register.mutateAsync({ nin: nin.trim(), mda });
      setNiraHit(null);
      onCitizen(res.citizen);
    } catch (err) {
      setError((err as Error)?.message ?? "Could not register the citizen.");
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 1</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Find the citizen</h2>
        </div>
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            value={nin}
            onChange={(e) => { setNin(e.target.value); setMiss(false); setNiraHit(null); }}
            placeholder="Scan or type NIN"
            className="h-12 flex-1 text-base font-mono"
            autoFocus
            autoComplete="off"
          />
          <Button type="submit" className="h-12 px-5" disabled={search.isPending || !nin.trim()}>
            {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
        {miss && (
          <p className="mt-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
            <TriangleAlert className="h-4 w-4" />
            No citizen found for that NIN. Verify the number, or capture a new citizen via the back-office.
          </p>
        )}
        {niraHit && (
          <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Found in NIRA · not yet on the rail
            </p>
            <p className="mt-1 font-display text-lg font-semibold">{niraHit.full_name}</p>
            <p className="text-sm text-muted-foreground">
              NIN <span className="font-mono">{niraHit.nin}</span>
              {niraHit.district && <> · {niraHit.district}</>}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Register this citizen to record them on the rail and continue. With the
              citizen present, this captures their in-person consent for identity use.
            </p>
            {error && (
              <p className="mt-2 flex items-center gap-2 text-xs text-destructive">
                <TriangleAlert className="h-3.5 w-3.5" /> {error}
              </p>
            )}
            <Button
              className="mt-3 h-11 w-full"
              onClick={onRegister}
              disabled={register.isPending}
            >
              {register.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registering…</>
              ) : (
                <>Register &amp; continue <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </div>
        )}
        {citizen && (
          <div className="mt-4 rounded-md border border-success/30 bg-success/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-lg font-semibold">{citizen.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  NIN <span className="font-mono">{citizen.nin}</span>
                  {citizen.district && <> · {citizen.district}</>}
                  {citizen.phone && <> · {citizen.phone}</>}
                </p>
              </div>
              {citizen.verified ? (
                <Badge className="border-0 bg-success/15 text-success">verified</Badge>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => { onCitizen(null); setNin(""); }}>
                Change
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ServicesStep({
  mda,
  cart,
  onAdd,
}: {
  mda: string;
  cart: CartLine[];
  onAdd: (s: Service) => void;
}) {
  const { data: services = [], isLoading } = useWorkServices(mda);
  const [filter, setFilter] = useState("");

  const filtered = services.filter(
    (s) =>
      !filter ||
      s.service_name.toLowerCase().includes(filter.toLowerCase()) ||
      s.code.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 2</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Pick services</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="h-10 w-56 pl-8"
            />
          </div>
        </div>
        {isLoading ? (
          <p className="text-muted-foreground">Loading services…</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">No services match.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((s) => {
              const inCart = cart.some((l) => l.service.name === s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => onAdd(s)}
                  className={`flex flex-col rounded-lg border p-3 text-left transition-colors ${
                    inCart
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <p className="font-medium">{s.service_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{s.code}</span>
                    {s.service_family && <> · {s.service_family}</>}
                  </p>
                  <p className="mt-2 font-mono text-sm font-semibold">
                    {s.fee_basis === "Tiered"
                      ? "Tiered"
                      : `${s.fee_currency} ${s.fee_amount.toLocaleString()}`}
                    <span className="font-normal text-xs text-muted-foreground"> · {s.fee_basis}</span>
                  </p>
                  {inCart && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary">
                      <CheckCircle2 className="h-3 w-3" /> in cart
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CartPanel({
  citizen,
  cart,
  mda,
  onClear,
  onChange,
  onAssessed,
}: {
  citizen: Citizen | null;
  cart: CartLine[];
  mda: string;
  onClear: () => void;
  onChange: (next: CartLine[]) => void;
  onAssessed: (name: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const create = useCreateAssessment();
  const assess = useAssess();

  const subtotal = cart.reduce((sum, l) =>
    l.service.fee_basis === "Tiered" ? sum : sum + l.service.fee_amount * l.quantity,
    0,
  );
  const hasTiered = cart.some((l) => l.service.fee_basis === "Tiered");

  function bump(index: number, delta: number) {
    onChange(cart.map((l, i) => {
      if (i !== index) return l;
      const q = Math.max(1, l.quantity + delta);
      return { ...l, quantity: q };
    }));
  }

  function remove(index: number) {
    onChange(cart.filter((_, i) => i !== index));
  }

  async function onAssess() {
    if (!citizen) return;
    setError(null);
    try {
      const lines = cart.map((l) => ({
        service: l.service.name,
        quantity: l.quantity,
      }));
      const draft = await create.mutateAsync({ citizen: citizen.name, lines, mda_default: mda });
      const assessed = await assess.mutateAsync(draft.name);
      onAssessed(assessed.name);
    } catch (err) {
      setError((err as Error)?.message ?? "Failed.");
    }
  }

  const busy = create.isPending || assess.isPending;

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Cart</h2>
          {cart.length > 0 && (
            <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
          )}
        </div>

        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pick services on the left to build a citizen&apos;s assessment.
          </p>
        ) : (
          <ul className="space-y-2">
            {cart.map((l, i) => (
              <li key={l.service.name} className="rounded-md border border-border p-2.5">
                <p className="font-medium text-sm">{l.service.service_name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{l.service.code}</span> · {l.service.fee_basis}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => bump(i, -1)} disabled={l.quantity <= 1}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-mono font-medium">{l.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => bump(i, +1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="font-mono text-sm font-semibold">
                    {l.service.fee_basis === "Tiered"
                      ? "Tiered"
                      : `${l.service.fee_currency} ${(l.service.fee_amount * l.quantity).toLocaleString()}`}
                  </p>
                </div>
                <button
                  onClick={() => remove(i)}
                  className="mt-1 text-[10px] text-muted-foreground hover:text-destructive"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {cart.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span>Estimated subtotal</span>
              <span className="font-mono font-semibold">
                {subtotal.toLocaleString()}
                {hasTiered && <span className="ml-1 text-xs text-muted-foreground">+ tiered</span>}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Server recomputes fees on Assess (Tiered + EFRIS + VAT applied).
            </p>
          </div>
        )}

        {error && (
          <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        <Button
          className="mt-4 h-12 w-full text-base"
          onClick={onAssess}
          disabled={!citizen || cart.length === 0 || busy}
        >
          {busy ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assessing…</>
          ) : (
            <>Assess & collect <ArrowRight className="ml-2 h-4 w-4" /></>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
