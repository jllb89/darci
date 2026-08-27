import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  assertStripeObjectIsTestMode,
  getStripeClient,
  getStripeReturnUrl,
  STRIPE_API_VERSION,
} from "../src/config/stripe";

const PRICE_CODES = [
  "member_starter_monthly",
  "member_plus_monthly",
  "member_volume_monthly",
] as const;

type CatalogPrice = {
  id: string;
  price_code: string;
  display_name: string;
  currency_code: string;
  unit_amount_cents: number;
  billing_interval: string;
  interval_count: number;
  included_entitlement_quantity: number;
  usage_limit_quantity: number;
  product_id: string;
};

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const stripe = getStripeClient();

const loadCatalog = async () => {
  const { data, error } = await supabase
    .from("billing_catalog_prices")
    .select(
      "id, price_code, display_name, currency_code, unit_amount_cents, billing_interval, interval_count, included_entitlement_quantity, usage_limit_quantity, product_id",
    )
    .in("price_code", [...PRICE_CODES])
    .order("sort_order");
  if (error) throw new Error(`Unable to load DARCi catalog: ${error.message}`);
  if (!data || data.length !== PRICE_CODES.length) {
    throw new Error("DARCi member catalog is incomplete; apply Phase 1/2 migrations first");
  }

  const byCode = new Map(data.map((row) => [row.price_code, row as CatalogPrice]));
  return PRICE_CODES.map((code) => {
    const row = byCode.get(code);
    if (!row) throw new Error(`Missing catalog price ${code}`);
    if (
      row.unit_amount_cents <= 0 ||
      row.currency_code !== "USD" ||
      row.billing_interval !== "month" ||
      row.interval_count !== 1 ||
      row.included_entitlement_quantity !== row.usage_limit_quantity
    ) {
      throw new Error(`Catalog policy mismatch for ${code}`);
    }
    return row;
  });
};

const findOrCreateProduct = async () => {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const matches = products.data.filter(
    (product) =>
      !product.livemode &&
      product.metadata.darci_product_code === "member_membership" &&
      product.metadata.darci_environment === "test",
  );
  if (matches.length > 1) {
    throw new Error("Multiple active DARCi test member products exist in Stripe");
  }

  const product = matches[0]
    ? await stripe.products.update(matches[0].id, {
        active: true,
        name: "DARCi Member Membership",
        description: "Monthly DARCi membership; tiers differ only by included document workflows.",
        metadata: {
          darci_product_code: "member_membership",
          darci_environment: "test",
          darci_scope: "member_only",
        },
      })
    : await stripe.products.create(
        {
          active: true,
          name: "DARCi Member Membership",
          description: "Monthly DARCi membership; tiers differ only by included document workflows.",
          metadata: {
            darci_product_code: "member_membership",
            darci_environment: "test",
            darci_scope: "member_only",
          },
        },
        { idempotencyKey: "darci:test:catalog:member_membership:product:v1" },
      );
  assertStripeObjectIsTestMode(product, "Stripe member product");
  return product;
};

const findOrCreatePrices = async (productId: string, catalog: CatalogPrice[]) => {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const result = [];

  for (const internal of catalog) {
    const matches = prices.data.filter((price) => price.lookup_key === internal.price_code);
    if (matches.length > 1) throw new Error(`Multiple Stripe prices use ${internal.price_code}`);

    const existing = matches[0];
    const price = existing ?? (await stripe.prices.create(
      {
        active: true,
        product: productId,
        lookup_key: internal.price_code,
        nickname: internal.display_name,
        currency: internal.currency_code.toLowerCase(),
        unit_amount: internal.unit_amount_cents,
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        metadata: {
          darci_price_code: internal.price_code,
          darci_product_code: "member_membership",
          darci_environment: "test",
          darci_workflow_allowance: String(internal.included_entitlement_quantity),
        },
      },
      { idempotencyKey: `darci:test:catalog:${internal.price_code}:v1` },
    ));

    assertStripeObjectIsTestMode(price, `Stripe price ${internal.price_code}`);
    const stripeProductId = typeof price.product === "string" ? price.product : price.product.id;
    if (
      stripeProductId !== productId ||
      price.unit_amount !== internal.unit_amount_cents ||
      price.currency.toUpperCase() !== internal.currency_code ||
      price.type !== "recurring" ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1 ||
      price.lookup_key !== internal.price_code
    ) {
      throw new Error(`Stripe price policy mismatch for ${internal.price_code}`);
    }

    result.push({ internal, price });
  }
  return result;
};

const persistMapping = async (input: {
  internal: CatalogPrice;
  providerProductId: string;
  providerPriceId: string;
}) => {
  const { data: current, error: lookupError } = await supabase
    .from("billing_provider_price_mappings")
    .select("id")
    .eq("catalog_price_id", input.internal.id)
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .neq("status", "disabled")
    .maybeSingle();
  if (lookupError) throw new Error(`Unable to inspect provider mapping: ${lookupError.message}`);

  const payload = {
    catalog_price_id: input.internal.id,
    provider: "stripe",
    provider_environment: "test",
    provider_product_id: input.providerProductId,
    provider_price_id: input.providerPriceId,
    status: "verified",
    verified_at: new Date().toISOString(),
    disabled_at: null,
    metadata: {
      source: "stripe_catalog_sync",
      api_version: STRIPE_API_VERSION,
      verification_id: randomUUID(),
    },
  };

  const operation = current
    ? supabase.from("billing_provider_price_mappings").update(payload).eq("id", current.id)
    : supabase.from("billing_provider_price_mappings").insert(payload);
  const { error } = await operation;
  if (error) throw new Error(`Unable to persist ${input.internal.price_code} mapping: ${error.message}`);
};

const syncPortalConfiguration = async (productId: string, priceIds: string[]) => {
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
  const matches = configurations.data.filter(
    (configuration) =>
      !configuration.livemode &&
      configuration.metadata?.darci_configuration_kind === "member_membership_portal" &&
      configuration.metadata?.darci_environment === "test",
  );
  if (matches.length > 1) throw new Error("Multiple DARCi test Portal configurations exist");

  const params = {
    name: "DARCi Member Membership (Test)",
    default_return_url: getStripeReturnUrl().toString(),
    metadata: {
      darci_configuration_kind: "member_membership_portal",
      darci_environment: "test",
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email" as const, "address" as const] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" as const },
      subscription_update: {
        enabled: false,
      },
    },
  };

  const configuration = matches[0]
    ? await stripe.billingPortal.configurations.update(matches[0].id, { ...params, active: true })
    : await stripe.billingPortal.configurations.create(params, {
        idempotencyKey: "darci:test:portal:member_membership:v2",
      });
  assertStripeObjectIsTestMode(configuration, "Stripe Portal configuration");

  const { error } = await supabase.from("billing_provider_configurations").upsert(
    {
      provider: "stripe",
      provider_environment: "test",
      configuration_kind: "customer_portal",
      provider_configuration_id: configuration.id,
      status: "verified",
      verified_at: new Date().toISOString(),
      metadata: {
        source: "stripe_catalog_sync",
        api_version: STRIPE_API_VERSION,
        product_id: productId,
        price_ids: priceIds,
        plan_change_policy: "darci_server_controlled",
      },
    },
    { onConflict: "provider,provider_environment,configuration_kind" },
  );
  if (error) throw new Error(`Unable to persist Portal configuration: ${error.message}`);
  return configuration;
};

const main = async () => {
  const catalog = await loadCatalog();
  const product = await findOrCreateProduct();
  const mappedPrices = await findOrCreatePrices(product.id, catalog);

  for (const { internal, price } of mappedPrices) {
    await persistMapping({
      internal,
      providerProductId: product.id,
      providerPriceId: price.id,
    });
  }

  const { error: activateError } = await supabase
    .from("billing_catalog_prices")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .in("price_code", [...PRICE_CODES]);
  if (activateError) throw new Error(`Unable to activate DARCi prices: ${activateError.message}`);

  const portal = await syncPortalConfiguration(product.id, mappedPrices.map(({ price }) => price.id));
  console.log(JSON.stringify({
    environment: "test",
    apiVersion: STRIPE_API_VERSION,
    productId: product.id,
    prices: mappedPrices.map(({ internal, price }) => ({
      priceCode: internal.price_code,
      providerPriceId: price.id,
      amountCents: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval,
    })),
    portalConfigurationId: portal.id,
    verified: true,
  }, null, 2));
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
