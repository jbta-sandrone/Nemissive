import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  findBillingProductByVariant,
  getBillingCatalogConfig,
  getWebhookSecret,
} from "../_shared/lemonsqueezyBilling.ts";
import { readDefaultNamedKey } from "../_shared/mediaDelivery.ts";

const supportedEvents = new Set([
  "order_created",
  "order_refunded",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
]);

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
      ? Number(value)
      : null;
}

function nullableIsoDate(value: unknown) {
  if (value === null || value === undefined) return null;
  const candidate = stringValue(value);
  if (!candidate || Number.isNaN(Date.parse(candidate))) throw new Error("invalid-date");
  return candidate;
}

function uuidValue(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(first: string, second: string) {
  const normalizedFirst = first.toLowerCase();
  const normalizedSecond = second.toLowerCase();
  if (normalizedFirst.length !== normalizedSecond.length) return false;
  let difference = 0;
  for (let index = 0; index < normalizedFirst.length; index += 1) {
    difference |= normalizedFirst.charCodeAt(index) ^ normalizedSecond.charCodeAt(index);
  }
  return difference === 0;
}

async function verifySignature(body: Uint8Array, receivedSignature: string, secret: string) {
  if (!/^[0-9a-f]{64}$/i.test(receivedSignature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return constantTimeEqual(bytesToHex(digest), receivedSignature);
}

async function sha256Hex(body: Uint8Array) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", body)));
}

async function handleRequest(request: Request) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const rawBody = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get("X-Signature") ?? "";
  let webhookSecret: string;
  try { webhookSecret = getWebhookSecret(); } catch {
    console.error("lemonsqueezy-webhook is missing its signing secret");
    return jsonResponse(500, { error: "Webhook is not configured." });
  }
  if (!await verifySignature(rawBody, signature, webhookSecret)) {
    return jsonResponse(401, { error: "Invalid webhook signature." });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody)) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: "Invalid webhook payload." });
  }

  const eventNameHeader = request.headers.get("X-Event-Name") ?? "";
  const meta = objectValue(payload.meta);
  const eventName = stringValue(meta?.event_name);
  if (!eventName || eventName !== eventNameHeader) return jsonResponse(400, { error: "Webhook event name mismatch." });
  if (!supportedEvents.has(eventName)) return jsonResponse(200, { received: true, ignored: true });

  let catalogConfig: ReturnType<typeof getBillingCatalogConfig>;
  try { catalogConfig = getBillingCatalogConfig(); } catch (error) {
    console.error("lemonsqueezy-webhook has invalid provider configuration", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(500, { error: "Webhook is not configured." });
  }

  const data = objectValue(payload.data);
  const attributes = objectValue(data?.attributes);
  const resourceType = stringValue(data?.type);
  const resourceId = stringValue(data?.id);
  if (!data || !attributes || !resourceType || !resourceId) return jsonResponse(400, { error: "Webhook resource is incomplete." });

  const storeId = integerValue(attributes.store_id);
  const orderItem = objectValue(attributes.first_order_item);
  const variantId = resourceType === "orders" ? integerValue(orderItem?.variant_id) : integerValue(attributes.variant_id);
  const testMode = typeof attributes.test_mode === "boolean"
    ? attributes.test_mode
    : typeof orderItem?.test_mode === "boolean" ? orderItem.test_mode : null;
  if (storeId !== catalogConfig.storeId || testMode !== catalogConfig.testMode || variantId === null) {
    console.warn("Ignoring Lemon Squeezy webhook outside the configured store, mode, or variants", {
      eventName,
      resourceType,
      resourceId,
    });
    return jsonResponse(200, { received: true, ignored: true });
  }

  const billingProduct = findBillingProductByVariant(catalogConfig, variantId);
  if (!billingProduct
    || (resourceType === "orders" && billingProduct.billingType !== "one_time")
    || (resourceType === "subscriptions" && billingProduct.billingType !== "subscription")) {
    console.warn("Ignoring Lemon Squeezy webhook with an unmapped product", { eventName, resourceType, resourceId });
    return jsonResponse(200, { received: true, ignored: true });
  }

  if ((eventName.startsWith("order_") && resourceType !== "orders")
    || (eventName.startsWith("subscription_") && resourceType !== "subscriptions")) {
    return jsonResponse(400, { error: "Webhook event resource mismatch." });
  }

  const status = stringValue(attributes.status);
  const providerCreatedAt = nullableIsoDate(attributes.created_at);
  const providerUpdatedAt = nullableIsoDate(attributes.updated_at);
  if (!status || !providerCreatedAt || !providerUpdatedAt) return jsonResponse(400, { error: "Webhook state is incomplete." });

  const customData = objectValue(meta?.custom_data);
  const targetUserId = uuidValue(customData?.nemissive_user_id);
  const eventKey = await sha256Hex(rawBody);
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = readDefaultNamedKey("SUPABASE_SECRET_KEYS")
    || Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";
  if (!projectUrl || !secretKey) {
    console.error("lemonsqueezy-webhook is missing required Supabase server environment variables");
    return jsonResponse(500, { error: "Webhook database access is not configured." });
  }

  const amount = resourceType === "orders" ? integerValue(attributes.total) : null;
  const refundedAmount = resourceType === "orders" ? integerValue(attributes.refunded_amount) ?? 0 : null;
  const currency = resourceType === "orders" ? stringValue(attributes.currency)?.toUpperCase() ?? null : null;
  const customerId = resourceType === "subscriptions" ? integerValue(attributes.customer_id)?.toString() ?? null : null;
  const orderId = resourceType === "subscriptions" ? integerValue(attributes.order_id)?.toString() ?? null : resourceId;

  let normalizedDates: {
    renewsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
    refundedAt: string | null;
  };
  try {
    normalizedDates = {
      renewsAt: nullableIsoDate(attributes.renews_at),
      endsAt: nullableIsoDate(attributes.ends_at),
      trialEndsAt: nullableIsoDate(attributes.trial_ends_at),
      refundedAt: nullableIsoDate(attributes.refunded_at),
    };
  } catch {
    return jsonResponse(400, { error: "Webhook contains an invalid date." });
  }

  const admin = createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await admin.rpc("process_lemonsqueezy_webhook", {
    target_event_key: eventKey,
    target_event_name: eventName,
    target_resource_type: resourceType,
    target_resource_id: resourceId,
    target_store_id: storeId,
    target_variant_id: variantId,
    target_test_mode: testMode,
    target_user_id: targetUserId,
    target_local_product_id: billingProduct.productId,
    target_status: status,
    target_amount: amount,
    target_currency: currency,
    target_refunded_amount: refundedAmount,
    target_customer_id: customerId,
    target_order_id: orderId,
    target_renews_at: normalizedDates.renewsAt,
    target_ends_at: normalizedDates.endsAt,
    target_trial_ends_at: normalizedDates.trialEndsAt,
    target_provider_created_at: providerCreatedAt,
    target_provider_updated_at: providerUpdatedAt,
    target_refunded_at: normalizedDates.refundedAt,
  });
  if (result.error) {
    console.error("Lemon Squeezy webhook database processing failed", {
      code: result.error.code,
      eventName,
      resourceType,
      resourceId,
    });
    return jsonResponse(500, { error: "Webhook processing failed." });
  }

  return jsonResponse(200, { received: true, result: result.data });
}

Deno.serve((request: Request) => handleRequest(request).catch((error: unknown) => {
  console.error("lemonsqueezy-webhook failed unexpectedly", {
    error: error instanceof Error ? error.name : "unknown",
  });
  return jsonResponse(500, { error: "Webhook processing failed." });
}));
