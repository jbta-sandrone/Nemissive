export type BillingProductId = "theme.obsidian" | "theme.celestial" | "theme.sakura" | "theme.ember" | "theme.glacier" | "theme.verdant" | "elite.monthly";

export type BillingCatalogEntry = {
  productId: BillingProductId;
  variantId: number;
  billingType: "one_time" | "subscription";
};

export type BillingCatalogConfig = {
  storeId: number;
  testMode: boolean;
  products: readonly BillingCatalogEntry[];
};

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`missing-environment:${name}`);
  return value;
}

function positiveIntegerValue(name: string, value: string) {
  if (!/^\d+$/.test(value)) throw new Error(`invalid-environment:${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`invalid-environment:${name}`);
  return parsed;
}

function positiveIntegerEnvironment(name: string) {
  return positiveIntegerValue(name, requiredEnvironment(name));
}

function positiveIntegerEnvironmentWithLegacyFallback(canonicalName: string, legacyName: string) {
  const canonicalValue = Deno.env.get(canonicalName)?.trim();
  if (canonicalValue) return positiveIntegerValue(canonicalName, canonicalValue);
  const legacyValue = Deno.env.get(legacyName)?.trim();
  if (legacyValue) return positiveIntegerValue(legacyName, legacyValue);
  throw new Error(`missing-environment:${canonicalName}`);
}

export function getBillingCatalogConfig(): BillingCatalogConfig {
  const testModeValue = requiredEnvironment("LEMONSQUEEZY_TEST_MODE");
  if (testModeValue !== "true" && testModeValue !== "false") {
    throw new Error("invalid-environment:LEMONSQUEEZY_TEST_MODE");
  }

  const products: BillingCatalogEntry[] = [
    {
      productId: "theme.obsidian",
      variantId: positiveIntegerEnvironment("LEMONSQUEEZY_OBSIDIAN_VARIANT_ID"),
      billingType: "one_time",
    },
    {
      productId: "theme.celestial",
      // Temporary secret-name bridge for a zero-downtime deployment. Remove
      // after the canonical secret is present in every deployed environment.
      variantId: positiveIntegerEnvironmentWithLegacyFallback(
        "LEMONSQUEEZY_CELESTIAL_VARIANT_ID",
        "LEMONSQUEEZY_CELESTIA_VARIANT_ID",
      ),
      billingType: "one_time",
    },
    {
      productId: "theme.sakura",
      variantId: positiveIntegerEnvironment("LEMONSQUEEZY_SAKURA_VARIANT_ID"),
      billingType: "one_time",
    },
    {
      productId: "theme.ember",
      variantId: positiveIntegerEnvironment("LEMONSQUEEZY_EMBER_VARIANT_ID"),
      billingType: "one_time",
    },
    {
      productId: "theme.glacier",
      variantId: positiveIntegerEnvironment("LEMONSQUEEZY_GLACIER_VARIANT_ID"),
      billingType: "one_time",
    },
    {
      productId: "theme.verdant",
      variantId: positiveIntegerEnvironment("LEMONSQUEEZY_VERDANT_VARIANT_ID"),
      billingType: "one_time",
    },
    {
      productId: "elite.monthly",
      variantId: positiveIntegerEnvironment("LEMONSQUEEZY_ELITE_MONTHLY_VARIANT_ID"),
      billingType: "subscription",
    },
  ];

  if (new Set(products.map((product) => product.variantId)).size !== products.length) {
    throw new Error("invalid-environment:duplicate-variant-id");
  }

  return {
    storeId: positiveIntegerEnvironment("LEMONSQUEEZY_STORE_ID"),
    testMode: testModeValue === "true",
    products,
  };
}

export function getCheckoutServerConfig() {
  const catalog = getBillingCatalogConfig();
  const appUrl = new URL(requiredEnvironment("NEMISSIVE_APP_URL"));
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost" && appUrl.hostname !== "127.0.0.1") {
    throw new Error("invalid-environment:NEMISSIVE_APP_URL");
  }
  appUrl.pathname = "/";
  appUrl.search = "";
  appUrl.hash = "";

  return {
    ...catalog,
    apiKey: requiredEnvironment("LEMONSQUEEZY_API_KEY"),
    appUrl,
  };
}

export function getWebhookSecret() {
  return requiredEnvironment("LEMONSQUEEZY_WEBHOOK_SECRET");
}

export function resolveBillingProduct(value: unknown): BillingProductId | null {
  if (value === "theme.celestia") return "theme.celestial";
  if (value === "theme.obsidian" || value === "theme.celestial" || value === "theme.sakura" || value === "theme.ember" || value === "theme.glacier" || value === "theme.verdant" || value === "elite.monthly") return value;
  return null;
}

/** Temporary RPC compatibility for deploying canonical Edge code before the database rename. */
export function legacyDatabaseBillingProductId(productId: BillingProductId) {
  return productId === "theme.celestial" ? "theme.celestia" : null;
}

export function findBillingProductByVariant(config: BillingCatalogConfig, variantId: number) {
  return config.products.find((product) => product.variantId === variantId) ?? null;
}

export function checkoutReturnUrl(appUrl: URL, productId: BillingProductId) {
  const result = new URL("/dashboard", appUrl);
  result.searchParams.set("billing", "success");
  result.searchParams.set("product", productId);
  if (productId === "elite.monthly") result.searchParams.set("view", "elite");
  return result.toString();
}

export async function cancelLemonSqueezySubscription(subscriptionId: string, apiKey: string) {
  if (!/^\d+$/.test(subscriptionId)) throw new Error("invalid-subscription-id");
  const response = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`lemonsqueezy-cancel:${response.status}`);
}
