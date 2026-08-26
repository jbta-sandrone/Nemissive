export type BillingProductId = "theme.obsidian" | "theme.celestia" | "elite.monthly";

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

function positiveIntegerEnvironment(name: string) {
  const value = requiredEnvironment(name);
  if (!/^\d+$/.test(value)) throw new Error(`invalid-environment:${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`invalid-environment:${name}`);
  return parsed;
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
      productId: "theme.celestia",
      variantId: positiveIntegerEnvironment("LEMONSQUEEZY_CELESTIA_VARIANT_ID"),
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
  if (value === "theme.obsidian" || value === "theme.celestia" || value === "elite.monthly") return value;
  return null;
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
