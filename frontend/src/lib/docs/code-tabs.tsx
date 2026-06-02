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
// CodeTabs — tabbed code blocks for multi-language examples.
// Uses shadcn Tabs so visual language stays in sync with the rest of the
// workbench. Each tab payload uses CodeBlock under the hood.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./code-block";

export type CodeSample = {
  /** Tab label, e.g. "curl", "JavaScript", "Python". */
  label: string;
  /** Optional language tag for the CodeBlock header (defaults to label lowercased). */
  language?: string;
  code: string;
};

export type CodeTabsProps = {
  samples: CodeSample[];
  /** Optional banner caption above the tab bar (e.g. "Request"). */
  caption?: string;
};

export function CodeTabs({ samples, caption }: CodeTabsProps) {
  if (samples.length === 0) return null;
  const initial = samples[0].label;

  return (
    <div className="my-4">
      {caption && (
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {caption}
        </p>
      )}
      <Tabs defaultValue={initial}>
        <TabsList className="bg-surface-muted border border-border h-9">
          {samples.map((s) => (
            <TabsTrigger
              key={s.label}
              value={s.label}
              className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {samples.map((s) => (
          <TabsContent key={s.label} value={s.label} className="mt-2">
            <CodeBlock code={s.code} language={s.language ?? s.label.toLowerCase()} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
