import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { processScheduledMedia, readDefaultNamedKey, readSecretKeys } from "../_shared/mediaDelivery.ts";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function equalSecret(first: string, second: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(first);
  const right = encoder.encode(second);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return mismatch === 0;
}

async function handleRequest(request: Request) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });
  const providedKey = request.headers.get("apikey") ?? "";
  if (!providedKey || !readSecretKeys().some((key) => equalSecret(key, providedKey))) return jsonResponse(401, { error: "Authentication required." });

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = readDefaultNamedKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!projectUrl || !secretKey) return jsonResponse(500, { error: "Scheduled multimedia delivery is not configured." });
  const admin = createClient(projectUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const results = await processScheduledMedia(admin);
    return jsonResponse(200, { processed: results.length });
  } catch (error) {
    console.error("scheduled-message-worker failed", { phase: error instanceof Error ? error.message.split(":", 1)[0] : "unknown" });
    return jsonResponse(500, { error: "Scheduled multimedia processing failed.", retryable: true });
  }
}

Deno.serve((request) => handleRequest(request).catch((error: unknown) => {
  console.error("scheduled-message-worker request failed unexpectedly", { error: error instanceof Error ? error.name : "unknown" });
  return jsonResponse(500, { error: "Scheduled multimedia processing failed.", retryable: true });
}));
