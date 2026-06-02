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
// useScanner — global barcode/QR scanner dispatcher.
//
// A USB keyboard-wedge scanner "types" the scanned payload very fast and ends
// with Enter. This hook listens at the document level, distinguishes that
// machine-fast burst from human typing, and routes the payload by shape:
//   - a NIN (C[MF] + 12)             -> onNin   (citizen lookup)
//   - anything else                  -> onScan  (caller decides — e.g. a
//                                       receipt/verify ref for reprint)
// It deliberately does nothing while a text field is focused: there, the
// scanner just types into the field and the field handles Enter itself.

import { useEffect, useRef } from "react";

const NIN_RE = /^C[MF][A-Z0-9]{12}$/i;
const FAST_GAP_MS = 50; // max gap between keystrokes for a "machine" burst
const NEW_SEQ_MS = 250; // a gap longer than this starts a fresh sequence
const MIN_LEN = 6;

type Handlers = {
  onNin?: (nin: string) => void;
  onScan?: (raw: string) => void;
  enabled?: boolean;
};

export function useScanner({ onNin, onScan, enabled = true }: Handlers): void {
  const buf = useRef("");
  const last = useRef(0);
  const machineFast = useRef(true);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    function onKey(e: KeyboardEvent) {
      // A focused field handles its own scan (types + submits on Enter).
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      const now = Date.now();

      if (e.key === "Enter") {
        const payload = buf.current;
        const fast = machineFast.current;
        buf.current = "";
        machineFast.current = true;
        if (payload.length >= MIN_LEN && fast) {
          if (onNin && NIN_RE.test(payload)) {
            e.preventDefault();
            onNin(payload.toUpperCase());
          } else if (onScan) {
            e.preventDefault();
            onScan(payload);
          }
        }
        return;
      }

      if (e.key.length === 1) {
        const gap = now - last.current;
        if (gap > NEW_SEQ_MS) {
          buf.current = "";
          machineFast.current = true;
        } else if (gap > FAST_GAP_MS) {
          machineFast.current = false; // too slow between keys = a human typing
        }
        buf.current += e.key;
        last.current = now;
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onNin, onScan, enabled]);
}
