import { createClient } from "@supabase/supabase-js";
import { assertStripeObjectIsTestMode, getStripeClient, getStripeEnvironment, STRIPE_API_VERSION } from "../src/config/stripe";

import { MEMBER_PRICING_V2 } from "../src/config/memberPricing";
const expected = new Map<string, (typeof MEMBER_PRICING_V2)[number]>(MEMBER_PRICING_V2.map(p => [p.priceCode, p]));

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
if (getStripeEnvironment() !== "test") throw new Error("This verification is test-mode only");
const stripe = getStripeClient();

const main = async () => {
  const { data, error } = await supabase
    .from("billing_provider_price_mappings")
    .select("provider_product_id, provider_price_id, status, billing_catalog_prices!inner(price_code, unit_amount_cents, currency_code, billing_interval, interval_count, included_entitlement_quantity, usage_limit_quantity, is_unlimited, is_active)")
    .in("billing_catalog_prices.price_code", [...expected.keys()])
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("status", "verified");
  if (error) throw new Error(`Unable to load mappings: ${error.message}`);
  if (!data || data.length !== expected.size) throw new Error("Expected six verified v2 test mappings (legacy mappings remain preserved)");

  const seenProducts = new Set<string>();
  for (const mapping of data) {
    const internalRaw = mapping.billing_catalog_prices;
    const internal = (Array.isArray(internalRaw) ? internalRaw[0] : internalRaw) as {
      price_code: string;
      unit_amount_cents: number;
      currency_code: string;
      billing_interval: string;
      interval_count: number;
      included_entitlement_quantity: number | null;
      usage_limit_quantity: number | null;
      is_unlimited: boolean;
      is_active: boolean;
    };
    const policy = expected.get(internal.price_code);
    if (!policy) throw new Error(`Unexpected mapped price ${internal.price_code}`);

    const price = await stripe.prices.retrieve(mapping.provider_price_id);
    assertStripeObjectIsTestMode(price, `Stripe price ${internal.price_code}`);
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    seenProducts.add(productId);

    if (
      productId !== mapping.provider_product_id ||
      !price.active ||
      price.lookup_key !== internal.price_code ||
      price.unit_amount !== policy.amount ||
      price.currency !== "usd" ||
      price.recurring?.interval !== policy.interval ||
      price.tax_behavior !== "exclusive" ||
      price.recurring.interval_count !== 1 ||
      internal.unit_amount_cents !== policy.amount ||
      internal.currency_code !== "USD" ||
      internal.billing_interval !== policy.interval ||
      internal.is_unlimited !== policy.unlimited ||
      internal.interval_count !== 1 ||
      internal.included_entitlement_quantity !== policy.allowance ||
      internal.usage_limit_quantity !== policy.allowance ||
      (!process.argv.includes("--prepared") && !internal.is_active)
    ) {
      throw new Error(`Verification mismatch for ${internal.price_code}`);
    }
  }

  if (seenProducts.size !== 1) throw new Error("Member prices do not share exactly one Stripe Product");
  const product = await stripe.products.retrieve([...seenProducts][0]!);
  assertStripeObjectIsTestMode(product, "Stripe member product");
  if (!product.active || product.metadata.darci_product_code !== "member_membership") {
    throw new Error("Stripe member Product policy mismatch");
  }

  const { data: portalRow, error: portalError } = await supabase
    .from("billing_provider_configurations")
    .select("provider_configuration_id, status")
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("configuration_kind", "customer_portal")
    .single();
  if (portalError) throw new Error(`Unable to load Portal mapping: ${portalError.message}`);
  const portal = await stripe.billingPortal.configurations.retrieve(portalRow.provider_configuration_id);
  assertStripeObjectIsTestMode(portal, "Stripe Portal configuration");
  if (
    portalRow.status !== "verified" ||
    !portal.active ||
    !portal.features.subscription_cancel.enabled ||
    portal.features.subscription_cancel.mode !== "at_period_end" ||
    portal.features.subscription_update.enabled
  ) {
    throw new Error("Stripe Portal policy mismatch");
  }

  console.log(JSON.stringify({
    environment: "test",
    apiVersion: STRIPE_API_VERSION,
    productId: product.id,
    verifiedPriceCount: data.length,
    portalConfigurationId: portal.id,
    verified: true,
  }, null, 2));
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
