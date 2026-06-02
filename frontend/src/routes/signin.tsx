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
// /login — layout shell for the login flow (form + sent + expired pages).
// Children render via <Outlet/>; pages handle their own framing.

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/signin")({
  component: LoginShell,
});

function LoginShell() {
  return <Outlet />;
}
