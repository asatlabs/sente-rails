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
// Final CTA — last invitation before the footer. Same primary action
// as the hero so visitors who scrolled the page have a clear next step.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCTA() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Sandbox is free. Try the rail before you sign up.
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Sixty seconds from email to your first Bearer key. Ten thousand
            free API calls every month, forever.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button asChild className="h-10">
              <Link to="/signup">
                Get a sandbox key
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <Link to="/docs">Read the docs</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
