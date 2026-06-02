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
// Sente Rails workbench — production Node entry.
//
// The Vite build (cloudflare:false target) produces:
//   dist/client/      static assets served at /wb-assets/* and /robots.txt
//   dist/server/      SSR fetch handler (server.js exports { fetch(req, env, ctx) })
//
// This file glues that fetch handler to Node 22's built-in http server so we
// can run under supervisor without bun, vite, or any external runtime.
//
// Env:
//   PORT (default 3001)
//   HOST (default 127.0.0.1)
//
// Usage:
//   node serve.mjs

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = join(__dirname, "dist/client");
const serverEntry = (await import("./dist/server/server.js")).default;

const port = parseInt(process.env.PORT || "3001", 10);
const host = process.env.HOST || "127.0.0.1";

const MIME = {
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".txt": "text/plain; charset=utf-8",
	".xml": "text/xml; charset=utf-8",
};

async function tryServeStatic(req, res) {
	const url = new URL(req.url, `http://${req.headers.host || host}`);
	const path = url.pathname;
	// Only serve files under /wb-assets/, /logos/ (agency logo overrides), or
	// specific known root-level statics. Anything else falls through to SSR.
	const isAssetPath =
		path.startsWith("/wb-assets/") ||
		path.startsWith("/logos/") ||
		path === "/robots.txt" ||
		path === "/favicon.ico";
	if (!isAssetPath) return false;

	const filePath = join(clientDir, path);
	try {
		const s = await stat(filePath);
		if (!s.isFile()) return false;
	} catch {
		return false;
	}

	const ext = path.match(/\.[^./]+$/)?.[0]?.toLowerCase() || "";
	const buf = await readFile(filePath);
	res.writeHead(200, {
		"content-type": MIME[ext] || "application/octet-stream",
		"cache-control": path.startsWith("/wb-assets/")
			? "public, max-age=31536000, immutable"
			: "public, max-age=3600",
	});
	res.end(buf);
	return true;
}

async function ssrHandle(req, res) {
	const url = new URL(req.url, `http://${req.headers.host || host}`);
	const headers = new Headers();
	for (const [k, v] of Object.entries(req.headers)) {
		if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
		else if (v !== undefined) headers.set(k, String(v));
	}

	let body;
	if (req.method !== "GET" && req.method !== "HEAD") {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		body = Buffer.concat(chunks);
	}

	const webReq = new Request(url, {
		method: req.method,
		headers,
		body,
		duplex: "half",
	});
	const webRes = await serverEntry.fetch(webReq, {}, {
		waitUntil: () => {},
		passThroughOnException: () => {},
	});

	const respHeaders = {};
	webRes.headers.forEach((v, k) => {
		respHeaders[k] = v;
	});
	res.writeHead(webRes.status, respHeaders);

	if (webRes.body) {
		const reader = webRes.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			res.write(value);
		}
	}
	res.end();
}

const httpServer = createServer(async (req, res) => {
	try {
		const servedStatic = await tryServeStatic(req, res);
		if (servedStatic) return;
		await ssrHandle(req, res);
	} catch (err) {
		console.error("[serve] error:", err);
		if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
		res.end("500 — workbench failed to render");
	}
});

httpServer.listen(port, host, () => {
	console.log(`Sente Rails workbench listening on http://${host}:${port}`);
});

// Graceful shutdown so supervisor restarts cleanly.
const shutdown = (sig) => {
	console.log(`[serve] received ${sig}, shutting down`);
	httpServer.close(() => process.exit(0));
	setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
