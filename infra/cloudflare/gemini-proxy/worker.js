// Cloudflare Worker: transparent reverse proxy for the Google Generative
// Language API (Gemini).
//
// WHY: Google returns HTTP 429 `RESOURCE_EXHAUSTED` with `limit: 0` for
// free-tier Gemini requests originating from blocked regions (e.g. RU server
// IPs). Routing the traffic through Cloudflare's egress presents a non-blocked
// IP to Google and removes the geo restriction. See worker README.
//
// SCOPE: forwards EVERYTHING the @tools GeminiClient calls — generateContent,
// the Files API and the resumable upload's second leg. The resumable upload
// returns an absolute `x-goog-upload-url` that points straight at Google; we
// rewrite it back through this worker so that leg also egresses via Cloudflare.
//
// ACCESS CONTROL: this is NOT an open proxy. The first path segment must equal
// the PROXY_SECRET binding, e.g.
//   https://<worker>.workers.dev/<SECRET>/v1beta/models/<model>:generateContent?key=<gemini_key>
// Configure the app's Gemini base URL to:  https://<worker>.workers.dev/<SECRET>
// The GeminiClient appends the real Google path (/v1beta/..., /upload/v1beta/...).

const UPSTREAM = "https://generativelanguage.googleapis.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- auth: secret as the first path segment ---
    const secret = env.PROXY_SECRET;
    const segments = url.pathname.split("/"); // ["", "<secret>", "v1beta", ...]
    const token = segments[1];
    if (!secret || token !== secret) {
      return new Response("Forbidden", { status: 403 });
    }

    // Real upstream path = everything after the secret segment.
    const upstreamPath = "/" + segments.slice(2).join("/");
    const upstreamUrl = UPSTREAM + upstreamPath + url.search;

    // Forward headers, dropping host / Cloudflare hop headers that must not leak.
    const headers = new Headers(request.headers);
    for (const h of [
      "host",
      "cf-connecting-ip",
      "cf-ipcountry",
      "cf-ray",
      "cf-visitor",
      "x-forwarded-for",
      "x-forwarded-proto",
      "x-real-ip",
    ]) {
      headers.delete(h);
    }

    const isBodyless = request.method === "GET" || request.method === "HEAD";
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: isBodyless ? undefined : request.body,
      redirect: "manual",
    });

    // Rewrite any absolute upstream URL handed back to the client so the
    // follow-up request (resumable upload / redirect) also routes through us.
    const responseHeaders = new Headers(upstreamResponse.headers);
    const selfOrigin = `${url.protocol}//${url.host}/${secret}`;
    for (const h of ["x-goog-upload-url", "location"]) {
      const value = responseHeaders.get(h);
      if (value && value.startsWith(UPSTREAM)) {
        responseHeaders.set(h, value.replace(UPSTREAM, selfOrigin));
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};
