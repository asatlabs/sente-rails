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
// /signup — public sandbox-tier signup landing with email-OTP verification.
//
// Three-step state machine:
//   1. "form"    → POST /v1/signup            { full_name, email, organisation, tos_accepted_version }
//                  → server creates Integrator (status=PendingEmail), generates OTP,
//                    delivers via dev-stub log (or SMTP once configured).
//                    Returns { integrator_id, expires_at_iso }.
//   2. "otp"     → POST /v1/signup/verify     { integrator_id, otp }
//                  → on match: Integrator flips to Active, first sandbox key issued.
//                    Returns the SuccessPayload (with plaintext key).
//                  → "Resend code" button calls POST /v1/signup/resend-otp
//                    { integrator_id }; 60s cooldown + 5/day cap.
//   3. "success" → SuccessView shows the plaintext exactly once.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Get a sandbox key · Sente Rails" },
      {
        name: "description",
        content:
          "Self-serve sandbox-tier API access. Verify your email, get your first Bearer key.",
      },
    ],
  }),
  component: SignupPage,
});

type Tos = { version: string; summary: string; document_url: string };

type RequestSignupPayload = {
  integrator_id: string;
  email: string;
  message: string;
  expires_at_iso: string;
  tos_version: string;
};

type ResendPayload = {
  integrator_id: string;
  message: string;
  expires_at_iso: string;
  sends_remaining_today: number;
};

type SuccessPayload = {
  integrator: {
    code: string;
    display_name: string;
    contact_email: string;
    tier: string;
    pricing_tier: string;
  };
  key: {
    name: string;
    prefix: string;
    last4: string;
    scopes: string[];
    expires_at: string;
  };
  plaintext: string;
  plaintext_warning: string;
  next_steps: string[];
};

type ApiResponse<T> = { data?: T; error?: { code: string; message: string; request_id?: string } };

async function postV1<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok && !json.error) {
    return { error: { code: "http_" + res.status, message: `HTTP ${res.status}` } };
  }
  return json;
}

type Step = "form" | "otp" | "success";

function SignupPage() {
  const [tos, setTos] = useState<Tos | null>(null);
  const [step, setStep] = useState<Step>("form");

  // Step 1 state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Step 2 state
  const [integratorId, setIntegratorId] = useState<string>("");
  const [otpEmail, setOtpEmail] = useState<string>("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<string>("");

  // Step 3 state
  const [success, setSuccess] = useState<SuccessPayload | null>(null);

  useEffect(() => {
    fetch("/v1/signup/tos")
      .then((r) => r.json())
      .then((d: ApiResponse<Tos>) => setTos(d?.data ?? null))
      .catch(() => {
        setTos({
          version: "sandbox-tos-v1-2026-05-25",
          summary:
            "The Sandbox Terms of Service cover responsible use of sandbox API keys.",
          document_url:
            "https://github.com/asatlabs/sente-rails/blob/main/docs/legal/SANDBOX_TOS.md",
        });
      });
  }, []);

  async function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!tos) return;
    setFormError(null);
    setSubmittingForm(true);
    try {
      const res = await postV1<RequestSignupPayload>("/v1/signup", {
        full_name: fullName,
        email,
        organisation,
        tos_accepted_version: tos.version,
      });
      if (res.error || !res.data) {
        setFormError(res.error?.message ?? "Signup failed.");
        return;
      }
      setIntegratorId(res.data.integrator_id);
      setOtpEmail(res.data.email);
      setOtpExpiresAt(res.data.expires_at_iso);
      setStep("otp");
    } catch (err) {
      setFormError((err as Error)?.message ?? "Network error.");
    } finally {
      setSubmittingForm(false);
    }
  }

  function onVerified(payload: SuccessPayload) {
    setSuccess(payload);
    setStep("success");
  }

  function onBackToForm() {
    setStep("form");
    setIntegratorId("");
    setOtpEmail("");
    setOtpExpiresAt("");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/5 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Get a sandbox key
        </h1>
        <p className="mt-2 text-muted-foreground">
          {step === "form" && "Verify your email. Get your first Bearer key. Ten thousand API calls per month, free forever."}
          {step === "otp" && `We sent a 6-digit code to ${otpEmail}.`}
          {step === "success" && "Your sandbox key is live."}
        </p>
      </div>

      {step === "form" && (
        <FormStep
          tos={tos}
          fullName={fullName}
          setFullName={setFullName}
          email={email}
          setEmail={setEmail}
          organisation={organisation}
          setOrganisation={setOrganisation}
          tosAccepted={tosAccepted}
          setTosAccepted={setTosAccepted}
          submitting={submittingForm}
          error={formError}
          onSubmit={onSubmitForm}
        />
      )}

      {step === "otp" && (
        <OtpStep
          integratorId={integratorId}
          email={otpEmail}
          expiresAtIso={otpExpiresAt}
          onVerified={onVerified}
          onResendExpiryUpdated={(iso) => setOtpExpiresAt(iso)}
          onBack={onBackToForm}
        />
      )}

      {step === "success" && success && <SuccessView payload={success} />}
    </div>
  );
}

// ─── Step 1 — form ────────────────────────────────────────────────────────

type FormStepProps = {
  tos: Tos | null;
  fullName: string;
  setFullName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  organisation: string;
  setOrganisation: (v: string) => void;
  tosAccepted: boolean;
  setTosAccepted: (v: boolean) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
};

function FormStep(p: FormStepProps) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <form onSubmit={p.onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              value={p.fullName}
              onChange={(e) => p.setFullName(e.target.value)}
              placeholder="Asiimwe Kintu"
              required
              disabled={p.submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              value={p.email}
              onChange={(e) => p.setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={p.submitting}
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send a 6-digit verification code here. Code expires in 15 minutes.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="organisation">
              Organisation <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="organisation"
              value={p.organisation}
              onChange={(e) => p.setOrganisation(e.target.value)}
              placeholder="Your company, MDA, or 'Personal'"
              disabled={p.submitting}
            />
          </div>

          {p.tos && (
            <div className="flex gap-3 rounded-md border border-border bg-surface-muted p-3">
              <input
                id="tos"
                type="checkbox"
                checked={p.tosAccepted}
                onChange={(e) => p.setTosAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                disabled={p.submitting}
                required
              />
              <label htmlFor="tos" className="cursor-pointer text-sm">
                I&apos;ve read and accept the{" "}
                <a
                  href={p.tos.document_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Sandbox Terms of Service
                </a>{" "}
                (<span className="font-mono text-[11px]">{p.tos.version}</span>).
                <p className="mt-1 text-xs text-muted-foreground">{p.tos.summary}</p>
              </label>
            </div>
          )}

          {p.error && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-destructive">{p.error}</div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={p.submitting || !p.tos || !p.tosAccepted}
          >
            {p.submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending verification code…
              </>
            ) : (
              "Send me a verification code"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link to="/docs" className="text-primary hover:underline">
              Read the docs
            </Link>{" "}
            or{" "}
            <a
              href="mailto:asatlabs@gmail.com"
              className="text-primary hover:underline"
            >
              contact ops
            </a>{" "}
            for a live-tier path.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Step 2 — OTP entry ───────────────────────────────────────────────────

type OtpStepProps = {
  integratorId: string;
  email: string;
  expiresAtIso: string;
  onVerified: (p: SuccessPayload) => void;
  onResendExpiryUpdated: (iso: string) => void;
  onBack: () => void;
};

function OtpStep(p: OtpStepProps) {
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [sendsRemaining, setSendsRemaining] = useState<number | null>(null);
  const [ttlSeconds, setTtlSeconds] = useState<number>(15 * 60);
  const tickRef = useRef<number | null>(null);

  // Compute initial TTL from server's expires_at_iso, then tick down once a second.
  useEffect(() => {
    if (!p.expiresAtIso) return;
    const tick = () => {
      const expiresMs = new Date(p.expiresAtIso).getTime();
      const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setTtlSeconds(remaining);
    };
    tick();
    tickRef.current = window.setInterval(tick, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [p.expiresAtIso]);

  // Resend cooldown counter — counts down 60s after the initial send / each resend.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await postV1<SuccessPayload>("/v1/signup/verify", {
        integrator_id: p.integratorId,
        otp,
      });
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Verification failed.");
        return;
      }
      p.onVerified(res.data);
    } catch (err) {
      setError((err as Error)?.message ?? "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    setResendBusy(true);
    try {
      const res = await postV1<ResendPayload>("/v1/signup/resend-otp", {
        integrator_id: p.integratorId,
      });
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Resend failed.");
        return;
      }
      p.onResendExpiryUpdated(res.data.expires_at_iso);
      setSendsRemaining(res.data.sends_remaining_today);
      setResendCooldown(60);
      setOtp("");
    } catch (err) {
      setError((err as Error)?.message ?? "Network error.");
    } finally {
      setResendBusy(false);
    }
  }

  const ttlMin = Math.floor(ttlSeconds / 60);
  const ttlSec = ttlSeconds % 60;

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <button
          type="button"
          onClick={p.onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Use a different email
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Enter the 6-digit code
            </h2>
            <p className="text-xs text-muted-foreground">
              Sent to <span className="font-mono">{p.email}</span> · integrator{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">
                {p.integratorId}
              </code>
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoComplete="one-time-code"
              required
              disabled={submitting}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
            <p className="text-xs text-muted-foreground">
              Code expires in{" "}
              <span className="font-mono text-foreground">
                {String(ttlMin).padStart(2, "0")}:{String(ttlSec).padStart(2, "0")}
              </span>
              .
            </p>
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
            disabled={submitting || otp.length !== 6 || ttlSeconds === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Verify and issue my key"
            )}
          </Button>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Didn&apos;t get it?{" "}
              {sendsRemaining !== null && (
                <span className="text-foreground">
                  ({sendsRemaining} resend{sendsRemaining === 1 ? "" : "s"} left today)
                </span>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResend}
              disabled={resendBusy || resendCooldown > 0}
            >
              {resendBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : resendCooldown > 0 ? (
                `Resend in ${resendCooldown}s`
              ) : (
                "Resend code"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Step 3 — success view (unchanged behaviour, modernised header) ──────

function SuccessView({ payload }: { payload: SuccessPayload }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Verified — your sandbox key is live
            </h2>
            <p className="text-xs text-muted-foreground">
              Integrator{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono">
                {payload.integrator.code}
              </code>{" "}
              · key {payload.key.name}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium text-foreground">
            <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
            {payload.plaintext_warning}
          </p>
        </div>

        <div className="mt-4 rounded-md border border-border bg-surface-muted p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Plaintext key
          </p>
          <div className="flex items-center gap-2">
            <code className="block flex-1 break-all rounded bg-background px-3 py-2 font-mono text-[12.5px]">
              {revealed
                ? payload.plaintext
                : `${payload.key.prefix}_••••••••••••••••••••••••••${payload.key.last4}`}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevealed((r) => !r)}
              type="button"
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={onCopy} type="button">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border border-border p-3">
            <p className="text-muted-foreground">Scopes</p>
            <p className="mt-1 font-mono text-[11px]">
              {payload.key.scopes.join(" · ")}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-muted-foreground">Expires</p>
            <p className="mt-1 font-mono text-[11px]">{payload.key.expires_at}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Next steps
          </p>
          <ul className="space-y-1.5 text-sm text-foreground">
            {payload.next_steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/docs/quick-start">
              Open the quick-start <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/docs">
              All docs <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
