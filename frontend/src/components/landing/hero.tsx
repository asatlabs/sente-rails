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
// Landing hero — text left, live code right. Contained to max-w-6xl,
// compact vertical rhythm.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroCode } from "./hero-code";

export function Hero() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8 lg:py-16">
        <div className="flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Republic of Uganda · Open source · Apache 2.0
          </p>
          <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[44px]">
            One API for every Uganda government fee, license, and payment.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Sente Rails connects 46 ministries, authorities, and local
            governments under a single rail. Build a payment integration once,
            reach every MDA. Sandbox is free and open.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="h-10">
              <Link to="/signup">
                Get a sandbox key
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <Link to="/docs/quick-start">Read the quick-start</Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center">
          <div className="w-full">
            <HeroCode />
          </div>
        </div>
      </div>
    </section>
  );
}
