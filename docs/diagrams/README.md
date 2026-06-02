<!--
─────────────────────────────────────────────────────────────────────────────
Copyright (c) 2026 Geoffrey Oketwangwu (asatlabs.org)
Author:  Geoffrey Oketwangwu <geoffreyoketwangwu@gmail.com>

CONFIDENTIAL AND PROPRIETARY

This source file is the original work of Geoffrey Oketwangwu and contains
confidential, proprietary information protected under copyright and trade-
secret law. No part may be reproduced, distributed, modified, reverse-
engineered, or used — in source or compiled form — without the prior
written permission of the author.

All rights reserved.
-->
# Sente Rails — diagram sources

Mermaid source for the five diagrams referenced by `PROGRAM_BRIEF.md`.

| File | Brief reference | Type | What it shows |
|---|---|---|---|
| `01-layered-architecture.mmd` | Figure 1 | flowchart | Edge → Gateway → API → Domain → Persistence → Integrations |
| `03-integration-map.mmd` | Figure 3 | flowchart | Mode A / B / C MDAs around the rail core; aggregators + citizens |
| `04-workflow-vertical-1-trading-licence.mmd` | Figure 4 | sequenceDiagram | Reference workflow 1 — Gulu trading licence renewal with MoMo |
| `05-workflow-vertical-2-lands-title.mmd` | Figure 5 | sequenceDiagram | Reference workflow 2 — Lands title transfer + EFRIS PRN + split |
| `06-workflow-vertical-3-cross-mda.mmd` | Figure 6 | sequenceDiagram | Reference workflow 3 — Cross-MDA business registration under 30 min |

## Rendering to SVG (for the brief PDF)

### Option A — Mermaid CLI (`mmdc`)

```bash
# One-time install (locally or on the dev box)
bun install -g @mermaid-js/mermaid-cli   # or: npm i -g @mermaid-js/mermaid-cli

# Render all six to SVG
for f in *.mmd; do
  mmdc -i "$f" -o "${f%.mmd}.svg" -b transparent
done

# Or PNG (1200px wide) if the brief PDF prefers raster
for f in *.mmd; do
  mmdc -i "$f" -o "${f%.mmd}.png" -b transparent -w 1200
done
```

### Option B — Mermaid Live Editor (no install)

1. Open https://mermaid.live/
2. Paste the `.mmd` source
3. Actions → Download SVG (or PNG)
4. Save as `<filename>.svg` next to the source

## Style notes

- Diagrams use the default Mermaid theme on rendering. If we land a brand
  palette we can switch to `themeVariables` via a `%%{init: ...}%%`
  directive at the top of each file.
- Node labels are kept ASCII-clean (no em-dashes / smart quotes) so the
  parser is happy across renderers.
- Workflow sequence diagrams (04 / 05 / 06) match exactly what the live
  demo at https://sente-rails.space/clerk and Postman against `/v1`
  exercise — the brief, the docs, and the diagrams stay
  in lockstep.
