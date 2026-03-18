/**
 * Cloudflare Worker — CORS Proxy for Log Downloader
 * ===================================================
 * Deploy steps:
 *   1. Go to https://workers.cloudflare.com → "Create a Service"
 *   2. Paste this entire file into the editor
 *   3. Click "Save and Deploy"
 *   4. Copy your worker URL (e.g. https://log-proxy.yourname.workers.dev)
 *   5. Paste it into the PROXY_BASE field in index.html
 *
 * This worker only proxies requests to the allowed origins below.
 * All other targets are rejected with 403.
 */

const ALLOWED_ORIGINS = [
  "files-io-preprod.eus1-n.itemoptix.com",
  "files-io-prod.eus1-n.itemoptix.com",
  "files-io-pr.eus1-n.itemoptix.com",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);

    // The target URL is everything after /proxy/
    // e.g. GET https://log-proxy.yourname.workers.dev/proxy/https://files-io-preprod.../path
    const prefix = "/proxy/";
    if (!incoming.pathname.startsWith(prefix)) {
      return new Response("Usage: /proxy/<target-url>", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const targetStr = incoming.pathname.slice(prefix.length) + incoming.search;

    let targetUrl;
    try {
      targetUrl = new URL(targetStr);
    } catch {
      return new Response("Invalid target URL: " + targetStr, {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Security: only proxy to the allowed log server hostnames
    if (!ALLOWED_ORIGINS.some((o) => targetUrl.hostname === o)) {
      return new Response("Target host not allowed: " + targetUrl.hostname, {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    try {
      const upstream = await fetch(targetUrl.toString(), {
        method:  "GET",
        headers: { "Accept-Encoding": "identity" }, // get raw bytes, not re-compressed
      });

      const responseHeaders = new Headers(CORS_HEADERS);

      // Forward content-type so the browser knows what it got
      const ct = upstream.headers.get("content-type");
      if (ct) responseHeaders.set("content-type", ct);

      // Forward content-length if present (helps progress indicators)
      const cl = upstream.headers.get("content-length");
      if (cl) responseHeaders.set("content-length", cl);

      return new Response(upstream.body, {
        status:  upstream.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response("Proxy fetch error: " + err.message, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
};
