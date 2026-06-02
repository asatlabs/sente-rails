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
// MarketingShell — sticky top-bar + content + footer.
//
// Wraps the public marketing surface (/, /signup, /signin/*) and the
// signed-in integrator hub (/dashboard/*, /docs/*) so the top-bar +
// footer stay consistent end-to-end. The kiosk-styled /work/* and the
// utility-dense /ops/* surfaces bring their own shells and are NOT
// wrapped by this.

import { ReactNode } from "react";
import { MarketingTopBar } from "@/components/marketing-top-bar";
import { MarketingFooter } from "@/components/marketing-footer";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingTopBar />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
