// Registration endpoint used when the Cloudflare Turnstile check is switched on.
// It verifies the Turnstile token, then saves the profile through submit_application.
// Secrets needed: TURNSTILE_SECRET_KEY (set with `supabase secrets set`).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED = new Set(["https://www.314tech.ai", "https://314tech.ai"]);

const cors = (origin: string | null) => ({
  "access-control-allow-origin": origin && ALLOWED.has(origin) ? origin : "https://www.314tech.ai",
  "access-control-allow-headers": "content-type, apikey, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
  "vary": "origin",
});

const reply = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "content-type": "application/json" } });

// Error codes raised by submit_application that the form knows how to explain.
const KNOWN = ["invalid_payload", "name_required", "email_invalid", "consent_required", "payload_too_large", "url_invalid", "modes_required", "try_later"];

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "method" }, origin);
  if (origin && !ALLOWED.has(origin)) return reply(403, { error: "origin" }, origin);

  let body: { payload?: unknown; token?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_payload" }, origin); }
  if (typeof body.token !== "string" || body.token.length < 10 || body.token.length > 4096) return reply(400, { error: "check_failed" }, origin);

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return reply(500, { error: "failed" }, origin);

  const form = new URLSearchParams({ secret, response: body.token });
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) form.set("remoteip", ip);
  let ok = false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    ok = !!(await r.json()).success;
  } catch { return reply(502, { error: "failed" }, origin); }
  if (!ok) return reply(400, { error: "check_failed" }, origin);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { error } = await db.rpc("submit_application", { payload: body.payload });
  if (error) {
    const code = KNOWN.find((k) => error.message.includes(k));
    return reply(code ? 400 : 500, { error: code || "failed" }, origin); // never echo raw database errors
  }
  return reply(200, { ok: true }, origin);
});
