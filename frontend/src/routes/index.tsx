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
// / — landing page. Marketing surface for prospective integrators.
//
// Data flows through an SSR loader so /v1/{mdas,services,notices}
// land in the SSR-rendered HTML on first paint — no client-side flicker on
// the agency count, service count, or Service Notices strip.
//
// Composed from /v1/* live data. No hardcoded counts, no fake users, no
// placeholder JSON. Every number on this page reflects current rail state
// at the moment the visitor hit it.

import { createFileRoute } from "@tanstack/react-router";

import { Hero } from "@/components/landing/hero";
import { StatusStrip } from "@/components/landing/status-strip";
import { ServiceNoticesStrip } from "@/components/landing/service-notices";
import { Pillars } from "@/components/landing/pillars";
import { AudienceRouter } from "@/components/landing/audience-router";
import { CataloguePreview } from "@/components/landing/catalogue-preview";
import { Walkthrough } from "@/components/landing/walkthrough";
import { ComplianceStrip } from "@/components/landing/compliance-strip";
import { FinalCTA } from "@/components/landing/final-cta";
import { fetchAgencies } from "@/lib/agencies";
import { fetchServices } from "@/lib/services";
import { fetchNotices } from "@/lib/notices";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "Sente Rails — The open API for Uganda's government revenue rail",
      },
      {
        name: "description",
        content:
          "One API for every Uganda government fee, license, and payment. " +
          "Sandbox is free and open. Apache 2.0 open source.",
      },
    ],
  }),
  loader: async () => {
    // Parallel fetch — three independent /v1/* GETs. Any individual
    // failure resolves to an empty array so a single backend hiccup
    // doesn't break the whole page; child components render their
    // empty states gracefully.
    const [agencies, services, notices] = await Promise.all([
      fetchAgencies().catch(() => []),
      fetchServices().catch(() => []),
      fetchNotices().catch(() => []),
    ]);
    return { agencies, services, notices };
  },
  component: LandingPage,
});

function LandingPage() {
  const { agencies, services, notices } = Route.useLoaderData();
  return (
    <>
      <Hero />
      <StatusStrip agencies={agencies} services={services} />
      <ServiceNoticesStrip notices={notices} />
      <Pillars />
      <AudienceRouter />
      <CataloguePreview agencies={agencies} />
      <Walkthrough />
      <ComplianceStrip />
      <FinalCTA />
    </>
  );
}
