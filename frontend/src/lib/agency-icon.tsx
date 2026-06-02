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
// Workbench agency badge — sector-mapped Lucide icon by default, with a
// per-agency SVG logo override when one is dropped under `public/logos/`.
//
// To add a real logo for any agency:
//   1. Save SVG to `apps/sente_rails/frontend/public/logos/<CODE>.svg`
//      (e.g. URA.svg, NIRA.svg, KCCA.svg). Use the agency's `short_code`
//      uppercase — must match exactly. Vite copies the file to the dist
//      root at build time and our `serve.mjs` serves it at `/logos/<CODE>.svg`.
//   2. Add the CODE to the `AGENCIES_WITH_LOGOS` set below. We use a static
//      set rather than runtime probing so SSR renders the right markup on
//      first paint without a fetch.
//   3. Rebuild + redeploy. The badge auto-switches from Lucide icon → SVG.
//
// No source-recreation of government insignia in this file. Logo SVGs come
// from official agency sources, dropped in as files; this module just maps
// the visual to the right slot in the workbench.

import {
  BadgeCheck,
  BarChart3,
  Building2,
  Bus,
  ClipboardCheck,
  Coins,
  Compass,
  Droplets,
  FileText,
  Fingerprint,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  Heart,
  Landmark,
  Leaf,
  type LucideIcon,
  Map as MapIcon,
  Plane,
  Radio,
  Scale,
  Server,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { Agency } from "./agencies";

// Codes for which we have a real SVG logo at /logos/<CODE>.svg. Empty until
// we drop logos in; safe default (every agency gets a Lucide sector icon).
const AGENCIES_WITH_LOGOS = new Set<string>([
  // populate as logos land in public/logos/
]);

const SECTOR_ICON: Record<string, LucideIcon> = {
  // Revenue & money flows
  Revenue: Coins,
  Fiscal: Coins,
  Treasury: Landmark,
  Audit: ClipboardCheck,
  // Identity & registration
  Identity: Fingerprint,
  Registration: FileText,
  "Internal Affairs": Shield,
  // Lands & real estate
  Lands: MapIcon,
  // Local government & cities
  "Local Government": Building2,
  // Sectoral ministries
  Health: Heart,
  Education: GraduationCap,
  Standards: BadgeCheck,
  Communications: Radio,
  "ICT Infrastructure": Server,
  Utilities: Droplets,
  Environment: Leaf,
  Transport: Bus,
  Aviation: Plane,
  Energy: Zap,
  Tourism: Compass,
  Justice: Scale,
  "Trade & Investment": TrendingUp,
  Statistics: BarChart3,
  Procurement: ShoppingCart,
  "Social Security": ShieldCheck,
  "Labour & Welfare": HeartHandshake,
  Agriculture: Sprout,
};

const DEFAULT_ICON: LucideIcon = HandCoins;

function getSectorIcon(sector: string | undefined): LucideIcon {
  if (!sector) return DEFAULT_ICON;
  return SECTOR_ICON[sector] ?? DEFAULT_ICON;
}

export type AgencyIconProps = {
  agency: Pick<Agency, "code" | "category">;
  /** Outer badge size in Tailwind class form. Default h-10 w-10. */
  size?: string;
  /** Override the inner icon size. Default 18px. */
  iconSize?: number;
  /** Override the badge color classes. Default bg-primary/5 border-primary/10 text-primary. */
  className?: string;
};

export function AgencyIcon({
  agency,
  size = "h-10 w-10",
  iconSize = 18,
  className = "bg-primary/5 border border-primary/10 text-primary",
}: AgencyIconProps) {
  const hasLogo = AGENCIES_WITH_LOGOS.has(agency.code);
  const Icon = getSectorIcon(agency.category);

  return (
    <div
      className={`${size} rounded-md ${className} flex items-center justify-center shrink-0`}
      aria-label={agency.code}
    >
      {hasLogo ? (
        <img
          src={`/logos/${agency.code}.svg`}
          alt={agency.code}
          className="h-3/5 w-3/5 object-contain"
        />
      ) : (
        <Icon size={iconSize} strokeWidth={1.75} />
      )}
    </div>
  );
}
