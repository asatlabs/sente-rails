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
/*
 * Sente Printer Service — vanilla JS wrapper for QZ Tray.
 *
 * Exposed as window.sentePrinterService with five methods:
 *   connect()                       -> Promise<void>
 *   disconnect()                    -> Promise<void>
 *   listPrinters()                  -> Promise<string[]>
 *   getDefaultPrinter()             -> Promise<string>
 *   printRaw(printerName, bytes)    -> Promise<void>
 *
 * Talks directly to QZ Tray's WebSocket interface at wss://localhost:8181.
 * QZ Tray must be running on the operator's workstation and configured
 * to accept connections from sente-rails.space (or wherever the
 * back-office is served). Unsigned-mode is sufficient for dev /
 * sandbox; production deployments register a signed cert via QZ Site
 * Manager and use the trustedSign callback (left as a TODO).
 *
 * No external dependencies. Fresh implementation — not derived from
 * any existing Sente / NXERP / third-party QZ client.
 */

(function (root) {
	'use strict';

	const WS_URL = 'wss://localhost:8181';
	const REQUEST_TIMEOUT_MS = 30000;

	// State held in module closure so window.sentePrinterService is a
	// pure facade — callers can't accidentally mutate internals.
	let socket = null;
	let pendingByUid = Object.create(null);
	let connectPromise = null;

	function uuid4() {
		// RFC4122 v4. crypto.getRandomValues when available, fall back
		// to Math.random for ancient browsers (dev-only acceptable).
		if (root.crypto && root.crypto.getRandomValues) {
			const buf = new Uint8Array(16);
			root.crypto.getRandomValues(buf);
			buf[6] = (buf[6] & 0x0f) | 0x40;
			buf[8] = (buf[8] & 0x3f) | 0x80;
			const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
			return hex.substr(0, 8) + '-' + hex.substr(8, 4) + '-' + hex.substr(12, 4) +
				'-' + hex.substr(16, 4) + '-' + hex.substr(20, 12);
		}
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	function ensureSocket() {
		if (socket && socket.readyState === WebSocket.OPEN) {
			return Promise.resolve(socket);
		}
		if (connectPromise) {
			return connectPromise;
		}
		connectPromise = new Promise((resolve, reject) => {
			let ws;
			try {
				ws = new WebSocket(WS_URL);
			} catch (e) {
				connectPromise = null;
				reject(new Error('QZ Tray not reachable at ' + WS_URL + ' (' + e.message + ')'));
				return;
			}
			ws.onopen = () => {
				socket = ws;
				resolve(ws);
				connectPromise = null;
			};
			ws.onerror = (ev) => {
				connectPromise = null;
				// Fail-soft: caller decides whether to surface to operator.
				reject(new Error('QZ Tray connection error — is QZ Tray running on this workstation?'));
			};
			ws.onclose = () => {
				socket = null;
				// Reject every pending call so callers don't hang forever.
				Object.values(pendingByUid).forEach((p) => {
					try { p.reject(new Error('QZ Tray connection closed')); } catch (_) {}
				});
				pendingByUid = Object.create(null);
			};
			ws.onmessage = (msg) => {
				let parsed;
				try { parsed = JSON.parse(msg.data); } catch (_) { return; }
				// QZ Tray sends back {uuid, result?, error?}; correlate to
				// the pending promise registered in pendingByUid.
				const uid = parsed.uuid;
				if (!uid || !pendingByUid[uid]) { return; }
				const slot = pendingByUid[uid];
				delete pendingByUid[uid];
				if (parsed.error) {
					slot.reject(new Error(parsed.error));
				} else {
					slot.resolve(parsed.result);
				}
			};
		});
		return connectPromise;
	}

	function call(method, params) {
		return ensureSocket().then((ws) => {
			return new Promise((resolve, reject) => {
				const uid = uuid4();
				const timeout = setTimeout(() => {
					if (pendingByUid[uid]) {
						delete pendingByUid[uid];
						reject(new Error('QZ Tray call ' + method + ' timed out after ' + REQUEST_TIMEOUT_MS + 'ms'));
					}
				}, REQUEST_TIMEOUT_MS);
				pendingByUid[uid] = {
					resolve: (v) => { clearTimeout(timeout); resolve(v); },
					reject: (e) => { clearTimeout(timeout); reject(e); },
				};
				const payload = { call: method, params: params || {}, uuid: uid };
				try {
					ws.send(JSON.stringify(payload));
				} catch (e) {
					delete pendingByUid[uid];
					clearTimeout(timeout);
					reject(e);
				}
			});
		});
	}

	// ------------------------------------------------------------ public API

	const sentePrinterService = {
		connect: function () {
			return ensureSocket().then(() => undefined);
		},

		disconnect: function () {
			if (!socket) { return Promise.resolve(); }
			return new Promise((resolve) => {
				try { socket.close(); } catch (_) {}
				socket = null;
				resolve();
			});
		},

		listPrinters: function () {
			return call('printers.find', {});
		},

		getDefaultPrinter: function () {
			return call('printers.getDefault', {});
		},

		/**
		 * Print raw ESC/POS bytes to the named printer.
		 *
		 * @param {string} printerName  Exact name as returned by listPrinters().
		 * @param {Uint8Array|ArrayBuffer|string} bytes  Raw ESC/POS payload.
		 *        Uint8Array / ArrayBuffer are base64-encoded for transport.
		 *        String is sent as-is (UTF-8 over the wire).
		 * @returns {Promise<void>}
		 */
		printRaw: function (printerName, bytes) {
			if (!printerName) {
				return Promise.reject(new Error('printRaw: printerName is required'));
			}
			let dataField;
			if (typeof bytes === 'string') {
				dataField = { type: 'raw', format: 'plain', data: bytes };
			} else if (bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes)) {
				const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
				// Base64-encode the bytes for transport.
				let binary = '';
				for (let i = 0; i < view.length; i++) {
					binary += String.fromCharCode(view[i]);
				}
				const b64 = root.btoa(binary);
				dataField = { type: 'raw', format: 'base64', data: b64 };
			} else {
				return Promise.reject(new Error('printRaw: bytes must be Uint8Array, ArrayBuffer, or string'));
			}
			return call('print', {
				printer: { name: printerName },
				options: { altPrinting: false },
				data: [dataField],
			});
		},
	};

	root.sentePrinterService = sentePrinterService;
})(window);
