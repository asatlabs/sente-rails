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
// CodeBlock — single block of code with copy-to-clipboard + optional language label.
// Lives inside the workbench's existing visual language (border-border, bg-muted, font-mono).
// Wraps a <pre> so the copy button doesn't interfere with the code text layout.

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export type CodeBlockProps = {
  code: string;
  language?: string;
  /** Optional caption above the block (e.g. "Request" or "Response"). */
  label?: string;
  /** Compact mode trims vertical padding — for use inside tables. */
  compact?: boolean;
};

export function CodeBlock({ code, language, label, compact = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard API blocked (e.g. non-HTTPS dev) — fail quietly.
    }
  };

  return (
    <div className="my-4 rounded-md border border-border bg-surface-muted">
      {(label || language) && (
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
            {label && language ? " · " : ""}
            {language && <span className="font-mono">{language}</span>}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Copy code"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <pre
        className={`overflow-x-auto font-mono text-[12.5px] leading-relaxed text-foreground ${
          compact ? "px-3.5 py-2" : "px-4 py-3.5"
        }`}
      >
        <code>{code}</code>
      </pre>
      {!(label || language) && (
        <button
          type="button"
          onClick={onCopy}
          className="absolute right-2 top-2 hidden rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors group-hover:inline-flex"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}
