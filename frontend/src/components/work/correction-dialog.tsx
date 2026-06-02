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
//
// CorrectionDialog — the void / refund confirmation modal.
//
// Void (unpaid assessment) needs only a reason. Refund (settled payment)
// additionally requires a supervisor's PIN — the clerk is logged in, but a
// supervisor must authorise giving money back.

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "void" | "refund" | "waiver";
  title: string;
  description: string;
  busy?: boolean;
  error?: string | null;
  /** For waiver mode: currency + the gross the waiver can't exceed. */
  currency?: string;
  maxAmount?: number;
  onSubmit: (reason: string, pin: string, amount: number) => void;
};

export function CorrectionDialog({
  open,
  onOpenChange,
  mode,
  title,
  description,
  busy,
  error,
  currency = "UGX",
  maxAmount,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [amount, setAmount] = useState("");
  const needsPin = mode === "refund" || mode === "waiver";
  const needsAmount = mode === "waiver";

  // Clear the fields whenever the dialog closes so a PIN never lingers.
  useEffect(() => {
    if (!open) {
      setReason("");
      setPin("");
      setAmount("");
    }
  }, [open]);

  const amountNum = Number(amount || 0);
  const amountValid =
    !needsAmount || (amount.trim().length > 0 && amountNum > 0 && (maxAmount == null || amountNum <= maxAmount));
  const canSubmit =
    reason.trim().length > 0 && (!needsPin || pin.trim().length > 0) && amountValid && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsAmount && (
            <div className="space-y-1.5">
              <Label htmlFor="corr-amount">Waiver amount ({currency})</Label>
              <Input
                id="corr-amount"
                type="number"
                inputMode="numeric"
                min={0}
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
              {maxAmount != null && (
                <p className="text-xs text-muted-foreground">
                  Up to {currency} {maxAmount.toLocaleString()} (the full fee).
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="corr-reason">Reason</Label>
            <Textarea
              id="corr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "refund"
                  ? "Why is this payment being refunded?"
                  : mode === "waiver"
                    ? "Why is this fee being waived?"
                    : "Why is this assessment being voided?"
              }
              rows={3}
              autoFocus={!needsAmount}
            />
          </div>

          {needsPin && (
            <div className="space-y-1.5">
              <Label htmlFor="corr-pin" className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-warning-foreground" /> Supervisor PIN
              </Label>
              <Input
                id="corr-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="A supervisor authorises this refund"
              />
              <p className="text-xs text-muted-foreground">
                A supervisor must enter their PIN to authorise giving money back.
              </p>
            </div>
          )}

          {error && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={mode === "refund" ? "destructive" : "default"}
            onClick={() => onSubmit(reason.trim(), pin.trim(), amountNum)}
            disabled={!canSubmit}
          >
            {busy ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Working…</>
            ) : mode === "refund" ? (
              "Refund payment"
            ) : mode === "waiver" ? (
              "Apply waiver"
            ) : (
              "Void assessment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
