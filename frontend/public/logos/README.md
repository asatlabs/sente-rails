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
# Workbench agency logos

Drop-in directory for real agency SVG logos. Files placed here are copied to
the dist root by Vite and served at `/logos/<filename>` by `serve.mjs`.

## How to add a logo

1. Source the SVG from the agency's official site / press kit (or via a
   government open-data portal). Don't recreate or reproduce — fetch the
   actual file the agency publishes.
2. Save it here as `<CODE>.svg`, where `<CODE>` is the MDA's `short_code`
   in uppercase. Examples: `URA.svg`, `NIRA.svg`, `NSSF.svg`, `UNEB.svg`,
   `KCCA.svg`, `URSB.svg`, `UCC.svg`, `NWSC.svg`, `UNBS.svg`.
3. Add the code to `AGENCIES_WITH_LOGOS` in
   `frontend/src/lib/agency-icon.tsx` so the component knows to render the
   image instead of the Lucide sector icon. (We use a static set rather
   than runtime probing so SSR paints the right markup on first render.)
4. `bun run build` and redeploy.

## SVG hygiene

- Square or near-square aspect ratio renders best (the badge slot is a
  rounded square).
- Keep the file small — strip Inkscape / Illustrator metadata if heavy.
- White or transparent backgrounds work in both light and dark themes.
- For agencies that publish only PNG / JPG, convert to SVG if you can, or
  drop the raster file as `<CODE>.png` and extend `agency-icon.tsx` to
  also accept `.png` — currently it only looks for `.svg`.

## Why this scaffold and no default logos in-repo

Government insignia are protected under each agency's IP regime. Logos
land here only when the operator has source-of-truth assets and the
right to ship them in this deployment. The workbench falls back to a
Lucide sector icon for every agency that doesn't have a logo dropped in,
so the catalogue stays comprehensive without any rights questions.
