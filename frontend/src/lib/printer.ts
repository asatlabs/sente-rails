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
// Counter-station printer service — a browser-only client for QZ Tray.
//
// QZ Tray runs on the operator's (Windows) counter PC and exposes a local
// WebSocket at wss://localhost:8181. We talk to it directly: list printers,
// print raw ESC/POS bytes, and pulse the cash drawer. Receipt bytes are
// rendered server-side (get_receipt_bytes) and streamed to the local printer
// here — the rail never touches the hardware, the browser bridges it.
//
// All functions are no-ops / reject on the server (SSR): printing only ever
// happens from a browser event handler.

const WS_URL = "wss://localhost:8181";
const REQUEST_TIMEOUT_MS = 30_000;
const PRINTER_KEY = "work.printer";

type Slot = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let socket: WebSocket | null = null;
let pending: Record<string, Slot> = Object.create(null);
let connectPromise: Promise<WebSocket> | null = null;

function uuid4(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function ensureSocket(): Promise<WebSocket> {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return Promise.reject(new Error("Printing is only available in the browser."));
  }
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (connectPromise) return connectPromise;
  connectPromise = new Promise<WebSocket>((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      connectPromise = null;
      reject(new Error(`QZ Tray not reachable at ${WS_URL} (${(e as Error).message})`));
      return;
    }
    ws.onopen = () => {
      socket = ws;
      connectPromise = null;
      resolve(ws);
    };
    ws.onerror = () => {
      connectPromise = null;
      reject(new Error("Can't reach QZ Tray — is it running on this counter PC?"));
    };
    ws.onclose = () => {
      socket = null;
      Object.values(pending).forEach((p) => {
        try {
          p.reject(new Error("QZ Tray connection closed"));
        } catch {
          /* ignore */
        }
      });
      pending = Object.create(null);
    };
    ws.onmessage = (msg) => {
      let parsed: { uuid?: string; result?: unknown; error?: string };
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        return;
      }
      const uid = parsed.uuid;
      if (!uid || !pending[uid]) return;
      const slot = pending[uid];
      delete pending[uid];
      if (parsed.error) slot.reject(new Error(parsed.error));
      else slot.resolve(parsed.result);
    };
  });
  return connectPromise;
}

function call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
  return ensureSocket().then(
    (ws) =>
      new Promise<T>((resolve, reject) => {
        const uid = uuid4();
        const timeout = setTimeout(() => {
          if (pending[uid]) {
            delete pending[uid];
            reject(new Error(`QZ Tray call ${method} timed out`));
          }
        }, REQUEST_TIMEOUT_MS);
        pending[uid] = {
          resolve: (v) => {
            clearTimeout(timeout);
            resolve(v as T);
          },
          reject: (e) => {
            clearTimeout(timeout);
            reject(e);
          },
        };
        try {
          ws.send(JSON.stringify({ call: method, params, uuid: uid }));
        } catch (e) {
          delete pending[uid];
          clearTimeout(timeout);
          reject(e as Error);
        }
      }),
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── QZ Tray surface ──────────────────────────────────────────────────────

export function connect(): Promise<void> {
  return ensureSocket().then(() => undefined);
}

export function listPrinters(): Promise<string[]> {
  return call<string[]>("printers.find", {});
}

export function getDefaultPrinter(): Promise<string> {
  return call<string>("printers.getDefault", {});
}

export function printRaw(printer: string, bytes: Uint8Array): Promise<void> {
  if (!printer) return Promise.reject(new Error("No printer selected."));
  return call<void>("print", {
    printer: { name: printer },
    options: { altPrinting: false },
    data: [{ type: "raw", format: "base64", data: toBase64(bytes) }],
  });
}

// ── Saved printer (per station) ──────────────────────────────────────────

export function getSavedPrinter(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(PRINTER_KEY);
}

export function setSavedPrinter(name: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(PRINTER_KEY, name);
}

// ── Receipts + drawer ────────────────────────────────────────────────────

const RECEIPT_ENDPOINT =
  "/api/method/sente_rails.sente_rails.doctype.payment_intent.payment_intent.get_receipt_bytes";

export async function fetchReceiptBytes(
  ref: string,
  opts: { kick?: boolean; reprint?: boolean } = {},
): Promise<Uint8Array> {
  const qs = new URLSearchParams({
    ref,
    lang: "en",
    kick_drawer: opts.kick ? "1" : "0",
    reprint: opts.reprint ? "1" : "0",
  });
  const res = await fetch(`${RECEIPT_ENDPOINT}?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Couldn't fetch the receipt (server ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Print a payment's receipt; on cash, the same job pops the drawer. */
export async function printReceipt(
  ref: string,
  opts: { kick?: boolean; reprint?: boolean; printer?: string } = {},
): Promise<void> {
  const printer = opts.printer ?? getSavedPrinter();
  if (!printer) throw new Error("No printer is set for this station — configure it in station setup.");
  const bytes = await fetchReceiptBytes(ref, opts);
  await printRaw(printer, bytes);
}

// ── Downloadable PDF receipt ─────────────────────────────────────────────

const RECEIPT_PDF_ENDPOINT =
  "/api/method/sente_rails.sente_rails.doctype.payment_intent.payment_intent.get_receipt_pdf";

/** Fetch the PDF receipt and trigger a browser download. */
export async function downloadReceiptPdf(ref: string): Promise<void> {
  const res = await fetch(`${RECEIPT_PDF_ENDPOINT}?ref=${encodeURIComponent(ref)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Couldn't generate the PDF receipt (server ${res.status}).`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ref}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Shift X / Z reports ──────────────────────────────────────────────────

const SHIFT_REPORT_ENDPOINT =
  "/api/method/sente_rails.sente_rails.doctype.counter_shift.counter_shift.get_shift_report_bytes";

export async function fetchShiftReportBytes(shift: string, kind: "X" | "Z"): Promise<Uint8Array> {
  const qs = new URLSearchParams({ shift, kind });
  const res = await fetch(`${SHIFT_REPORT_ENDPOINT}?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Couldn't fetch the ${kind}-report (server ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Print a shift's X (mid-shift) or Z (close-out) report. */
export async function printShiftReport(
  shift: string,
  kind: "X" | "Z",
  opts: { printer?: string } = {},
): Promise<void> {
  const printer = opts.printer ?? getSavedPrinter();
  if (!printer) throw new Error("No printer is set for this station — configure it in station setup.");
  const bytes = await fetchShiftReportBytes(shift, kind);
  await printRaw(printer, bytes);
}

/** Pop the cash drawer on its own (e.g. to make change) — ESC p 0 25 250. */
export async function kickDrawer(printer?: string): Promise<void> {
  const p = printer ?? getSavedPrinter();
  if (!p) throw new Error("No printer is set for this station.");
  await printRaw(p, new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]));
}

/** A tiny self-test slip to confirm the printer is alive and cutting. */
export async function testPrint(printer?: string): Promise<void> {
  const p = printer ?? getSavedPrinter();
  if (!p) throw new Error("No printer is set for this station.");
  const enc = new TextEncoder();
  const parts: number[] = [
    0x1b, 0x40, // ESC @ init
    0x1b, 0x61, 0x01, // centre
  ];
  const text = enc.encode(`Sente Rails\nPrinter OK\n${new Date().toLocaleString()}\n\n\n`);
  const tail: number[] = [0x1d, 0x56, 0x01]; // GS V 1 partial cut
  const out = new Uint8Array(parts.length + text.length + tail.length);
  out.set(parts, 0);
  out.set(text, parts.length);
  out.set(tail, parts.length + text.length);
  await printRaw(p, out);
}
