import { supabase } from "../../lib/supabase";
import type { BillingProductId } from "./premiumCatalog";

type CheckoutResponse = { checkoutUrl?: unknown; error?: unknown };

async function responseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const payload = await context.clone().json() as CheckoutResponse;
    return typeof payload.error === "string" ? payload.error : null;
  } catch {
    return null;
  }
}

export async function beginBillingCheckout(productId: BillingProductId) {
  const { data, error } = await supabase.functions.invoke("billing-create-checkout", {
    body: { productId },
  });
  if (error) {
    return await responseErrorMessage(error)
      ?? "Secure checkout could not be prepared. Please try again.";
  }

  const checkoutUrl = (data as CheckoutResponse | null)?.checkoutUrl;
  if (typeof checkoutUrl !== "string") return "Secure checkout returned an invalid destination.";
  try {
    const destination = new URL(checkoutUrl);
    if (destination.protocol !== "https:") return "Secure checkout returned an invalid destination.";
  } catch {
    return "Secure checkout returned an invalid destination.";
  }

  window.location.assign(checkoutUrl);
  return null;
}
