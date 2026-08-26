import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { corsHeaders } from "npm:@supabase/supabase-js@2.110.7/cors";
import {
  checkoutReturnUrl,
  getCheckoutServerConfig,
  resolveBillingProduct,
} from "../_shared/lemonsqueezyBilling.ts";
import { readDefaultNamedKey } from "../_shared/mediaDelivery.ts";

type CheckoutAuthorization = { allowed?: unknown; reason?: unknown };

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function checkoutAuthorizationMessage(reason: unknown) {
  if (reason === "already_owned") return "You already own this premium product.";
  if (reason === "elite_active") return "Your active Elite plan already includes this product.";
  if (reason === "account_unavailable") return "This account is not available for checkout.";
  return "This premium product is not available for checkout.";
}

async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = readDefaultNamedKey("SUPABASE_PUBLISHABLE_KEYS")
    || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    || Deno.env.get("SUPABASE_ANON_KEY")
    || "";
  const secretKey = readDefaultNamedKey("SUPABASE_SECRET_KEYS")
    || Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || "";
  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!projectUrl || !publishableKey || !secretKey) {
    console.error("billing-create-checkout is missing required Supabase server environment variables");
    return jsonResponse(500, { error: "Secure checkout is not configured." });
  }
  if (!accessToken) return jsonResponse(401, { error: "Authentication required." });

  let providerConfig: ReturnType<typeof getCheckoutServerConfig>;
  try {
    providerConfig = getCheckoutServerConfig();
  } catch (error) {
    console.error("billing-create-checkout has invalid provider configuration", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(500, { error: "Secure checkout is not configured." });
  }

  let requestBody: { productId?: unknown };
  try {
    requestBody = await request.json() as { productId?: unknown };
  } catch {
    return jsonResponse(400, { error: "Choose a valid premium product." });
  }
  const productId = resolveBillingProduct(requestBody.productId);
  if (!productId) return jsonResponse(400, { error: "Choose a valid premium product." });
  const product = providerConfig.products.find((candidate) => candidate.productId === productId);
  if (!product) return jsonResponse(400, { error: "This premium product is unavailable." });

  const userClient = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser(accessToken);
  const user = userResult.user;
  if (userError || !user) return jsonResponse(401, { error: "Your session has expired. Sign in and try again." });
  if (!user.email) return jsonResponse(409, { error: "A verified account email is required for checkout." });

  const authorizationResult = await admin.rpc("authorize_billing_checkout", {
    target_account_id: user.id,
    target_product_id: productId,
  });
  if (authorizationResult.error) {
    console.error("billing checkout authorization failed", { code: authorizationResult.error.code });
    return jsonResponse(500, { error: "Nemissive could not confirm checkout eligibility. Try again." });
  }
  const checkoutAuthorization = authorizationResult.data as CheckoutAuthorization | null;
  if (checkoutAuthorization?.allowed !== true) {
    return jsonResponse(409, { error: checkoutAuthorizationMessage(checkoutAuthorization?.reason) });
  }

  const checkoutResponse = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            enabled_variants: [product.variantId],
            redirect_url: checkoutReturnUrl(providerConfig.appUrl, productId),
          },
          checkout_options: {
            embed: false,
          },
          checkout_data: {
            email: user.email,
            custom: {
              nemissive_user_id: user.id,
            },
          },
          test_mode: providerConfig.testMode,
        },
        relationships: {
          store: { data: { type: "stores", id: String(providerConfig.storeId) } },
          variant: { data: { type: "variants", id: String(product.variantId) } },
        },
      },
    }),
  });

  let checkoutPayload: unknown;
  try { checkoutPayload = await checkoutResponse.json(); } catch { checkoutPayload = null; }
  const checkoutUrl = checkoutPayload && typeof checkoutPayload === "object"
    ? (((checkoutPayload as Record<string, unknown>).data as Record<string, unknown> | undefined)?.attributes as Record<string, unknown> | undefined)?.url
    : null;

  if (!checkoutResponse.ok || typeof checkoutUrl !== "string") {
    console.error("Lemon Squeezy checkout creation failed", {
      status: checkoutResponse.status,
      productId,
    });
    return jsonResponse(502, { error: "Secure checkout could not be prepared. Try again." });
  }

  try {
    const parsedCheckoutUrl = new URL(checkoutUrl);
    if (parsedCheckoutUrl.protocol !== "https:") throw new Error("checkout-protocol");
  } catch {
    console.error("Lemon Squeezy returned an invalid checkout URL", { productId });
    return jsonResponse(502, { error: "Secure checkout returned an invalid destination." });
  }

  return jsonResponse(200, { checkoutUrl });
}

Deno.serve((request: Request) => handleRequest(request).catch((error: unknown) => {
  console.error("billing-create-checkout failed unexpectedly", {
    error: error instanceof Error ? error.name : "unknown",
  });
  return jsonResponse(500, { error: "Secure checkout could not be prepared. Try again." });
}));
