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
// TxnStatus — a single, consistent status chip for a counter transaction,
// derived from the assessment status + its payment status.

import { Badge } from "@/components/ui/badge";

export function TxnStatus({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  let label = status;
  let cls = "bg-muted text-muted-foreground";

  if (status === "Cancelled" && paymentStatus === "Refunded") {
    label = "Refunded";
    cls = "bg-warning/15 text-warning-foreground";
  } else if (status === "Cancelled") {
    label = "Voided";
    cls = "bg-muted text-muted-foreground";
  } else if (status === "Paid" || paymentStatus === "Confirmed") {
    label = "Paid";
    cls = "bg-success/15 text-success";
  } else if (status === "Assessed") {
    label = "Awaiting payment";
    cls = "bg-info/15 text-info";
  } else {
    label = "Draft";
    cls = "bg-muted text-muted-foreground";
  }

  return <Badge className={`border-0 ${cls}`}>{label}</Badge>;
}
