import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  assertStripeObjectIsTestMode,
  buildStripeCheckoutReturnUrls,
  getStripeClient,
} from "../config/stripe";
import {
  evaluateMemberBillingPolicy,
  getBillingEnforcementMode,
} from "./billingPolicyService";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const ALLOWED_PRICE_CODES = new Set([
  "member_starter_monthly",
  "member_plus_monthly",
  "member_volume_monthly",
]);

const EFFECTIVE_SUBSCRIPTION_STATUSES = [
  "pending",
  "trialing",
  "active",
  "past_due",
  "paused",
  "incomplete",
  "unpaid",
];

type AppUser = {
  id: string;
  email: string | null;
  status: string;
  email_confirmed_at: string | null;
};

type CatalogPrice = {
  id: string;
  product_id: string;
  price_code: string;
  display_name: string;
  currency_code: string;
  unit_amount_cents: number;
  included_entitlement_quantity: number;
  usage_limit_quantity: number;
};

export class MemberBillingServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MemberBillingServiceError";
  }
}

const getAppUser = async (dbUserId: string): Promise<AppUser> => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, status, email_confirmed_at")
    .eq("id", dbUserId)
    .single();
  if (error || !data) {
    throw new MemberBillingServiceError(404, "billing_user_not_found", "DARCi user not found");
  }
  if (data.status !== "active") {
    throw new MemberBillingServiceError(403, "billing_account_inactive", "DARCi account is not active");
  }
  if (!data.email || !data.email_confirmed_at) {
    throw new MemberBillingServiceError(
      403,
      "billing_email_confirmation_required",
      "Confirm your email before starting membership Checkout",
    );
  }
  return data as AppUser;
};

const getOrCreateBillingAccount = async (user: AppUser) => {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("billing_accounts")
    .select("id, owner_user_id, status")
    .eq("owner_user_id", user.id)
    .eq("account_key", "default")
    .maybeSingle();
  if (lookupError) throw new Error(`Billing account lookup failed: ${lookupError.message}`);
  if (existing) {
    if (existing.status !== "active") {
      throw new MemberBillingServiceError(403, "billing_account_inactive", "Billing account is not active");
    }
    return existing;
  }

  const { data, error } = await supabaseAdmin
    .from("billing_accounts")
    .insert({
      owner_user_id: user.id,
      account_key: "default",
      account_kind: "personal",
      status: "active",
      is_default: true,
      billing_email: user.email,
      default_currency: "USD",
      metadata: { source: "member_membership_checkout" },
    })
    .select("id, owner_user_id, status")
    .single();
  if (!error && data) return data;

  // A concurrent request may have inserted the unique default account.
  const { data: raced, error: racedError } = await supabaseAdmin
    .from("billing_accounts")
    .select("id, owner_user_id, status")
    .eq("owner_user_id", user.id)
    .eq("account_key", "default")
    .single();
  if (racedError || !raced) throw new Error(`Billing account creation failed: ${error?.message}`);
  return raced;
};

const loadPrice = async (priceCode: string) => {
  if (!ALLOWED_PRICE_CODES.has(priceCode)) {
    throw new MemberBillingServiceError(400, "billing_price_not_allowed", "Membership price is not allowed");
  }

  const { data: price, error } = await supabaseAdmin
    .from("billing_catalog_prices")
    .select("id, product_id, price_code, display_name, currency_code, unit_amount_cents, included_entitlement_quantity, usage_limit_quantity")
    .eq("price_code", priceCode)
    .eq("is_active", true)
    .single();
  if (error || !price) {
    throw new MemberBillingServiceError(409, "billing_price_unavailable", "Membership price is not available");
  }

  const { data: mapping, error: mappingError } = await supabaseAdmin
    .from("billing_provider_price_mappings")
    .select("provider_product_id, provider_price_id, status")
    .eq("catalog_price_id", price.id)
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("status", "verified")
    .single();
  if (mappingError || !mapping) {
    throw new MemberBillingServiceError(
      503,
      "billing_catalog_not_ready",
      "Stripe test catalog is not fully configured",
    );
  }

  return { price: price as CatalogPrice, mapping };
};

const getOrCreateStripeCustomer = async (input: {
  billingAccountId: string;
  user: AppUser;
}) => {
  const { data: existing, error } = await supabaseAdmin
    .from("billing_customers")
    .select("id, provider_customer_id")
    .eq("billing_account_id", input.billingAccountId)
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("is_default", true)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Billing customer lookup failed: ${error.message}`);
  if (existing) return existing;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    {
      email: input.user.email!,
      metadata: {
        darci_environment: "test",
        darci_billing_account_id: input.billingAccountId,
        darci_owner_user_id: input.user.id,
      },
    },
    { idempotencyKey: `darci:test:customer:${input.billingAccountId}` },
  );
  assertStripeObjectIsTestMode(customer, "Stripe Customer");

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("billing_customers")
    .insert({
      billing_account_id: input.billingAccountId,
      provider: "stripe",
      provider_environment: "test",
      provider_customer_id: customer.id,
      status: "active",
      is_default: true,
      metadata: { source: "member_membership_checkout" },
    })
    .select("id, provider_customer_id")
    .single();
  if (!insertError && inserted) return inserted;

  const { data: raced, error: racedError } = await supabaseAdmin
    .from("billing_customers")
    .select("id, provider_customer_id")
    .eq("billing_account_id", input.billingAccountId)
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("is_default", true)
    .single();
  if (racedError || !raced) throw new Error(`Billing customer creation failed: ${insertError?.message}`);
  return raced;
};

const ensureNoEffectiveSubscription = async (billingAccountId: string) => {
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, status")
    .eq("billing_account_id", billingAccountId)
    .eq("provider_environment", "test")
    .eq("role_context", "member")
    .in("status", EFFECTIVE_SUBSCRIPTION_STATUSES)
    .limit(1);
  if (error) throw new Error(`Subscription lookup failed: ${error.message}`);
  if (data && data.length > 0) {
    throw new MemberBillingServiceError(
      409,
      "billing_subscription_already_exists",
      "Manage the existing membership through the billing portal",
    );
  }
};

const readExistingIdempotentOrder = async (billingAccountId: string, idempotencyKey: string) => {
  const { data, error } = await supabaseAdmin
    .from("billing_orders")
    .select("id, status, provider_checkout_session_id, metadata, billing_order_items(price_code_snapshot)")
    .eq("billing_account_id", billingAccountId)
    .eq("provider_environment", "test")
    .eq("checkout_idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`Checkout idempotency lookup failed: ${error.message}`);
  return data;
};

export const createMemberMembershipCheckout = async (input: {
  dbUserId: string;
  priceCode: string;
  idempotencyKey: string;
}) => {
  const user = await getAppUser(input.dbUserId);
  const account = await getOrCreateBillingAccount(user);
  const { price, mapping } = await loadPrice(input.priceCode);

  const existingOrder = await readExistingIdempotentOrder(account.id, input.idempotencyKey);
  if (existingOrder) {
    const orderItems = Array.isArray(existingOrder.billing_order_items)
      ? existingOrder.billing_order_items
      : [];
    if (orderItems[0]?.price_code_snapshot !== input.priceCode) {
      throw new MemberBillingServiceError(
        409,
        "billing_idempotency_conflict",
        "The idempotency key was already used with another membership price",
      );
    }
    if (existingOrder.provider_checkout_session_id) {
      const session = await getStripeClient().checkout.sessions.retrieve(existingOrder.provider_checkout_session_id);
      assertStripeObjectIsTestMode(session, "Stripe Checkout Session");
      return {
        orderId: existingOrder.id,
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        expiresAt: new Date(session.expires_at * 1000).toISOString(),
        reused: true,
      };
    }
  }

  await ensureNoEffectiveSubscription(account.id);

  const { data: pendingOrders, error: pendingError } = await supabaseAdmin
    .from("billing_orders")
    .select("id, provider_checkout_session_id")
    .eq("billing_account_id", account.id)
    .eq("provider_environment", "test")
    .eq("order_kind", "subscription_checkout")
    .in("status", ["draft", "pending_payment"])
    .neq("checkout_idempotency_key", input.idempotencyKey)
    .order("created_at", { ascending: false })
    .limit(1);
  if (pendingError) throw new Error(`Pending Checkout lookup failed: ${pendingError.message}`);
  if (pendingOrders?.[0]) {
    throw new MemberBillingServiceError(
      409,
      "billing_checkout_already_pending",
      "A membership Checkout is already pending",
    );
  }

  const customer = await getOrCreateStripeCustomer({ billingAccountId: account.id, user });
  let orderId = existingOrder?.id as string | undefined;
  if (!orderId) {
    const { data: order, error: orderError } = await supabaseAdmin
      .from("billing_orders")
      .insert({
        billing_account_id: account.id,
        billing_customer_id: customer.id,
        requested_by_user_id: user.id,
        payer_user_id: user.id,
        beneficiary_user_id: user.id,
        role_context: "member",
        order_kind: "subscription_checkout",
        status: "draft",
        currency_code: price.currency_code,
        subtotal_amount_cents: price.unit_amount_cents,
        total_amount_cents: price.unit_amount_cents,
        provider_environment: "test",
        checkout_idempotency_key: input.idempotencyKey,
        metadata: { source: "member_membership_checkout" },
      })
      .select("id")
      .single();
    if (orderError || !order) throw new Error(`Checkout order creation failed: ${orderError?.message}`);
    orderId = order.id;

    const { error: itemError } = await supabaseAdmin.from("billing_order_items").insert({
      order_id: orderId,
      billing_account_id: account.id,
      product_id: price.product_id,
      price_id: price.id,
      beneficiary_user_id: user.id,
      role_context: "member",
      product_code_snapshot: "member_membership",
      price_code_snapshot: price.price_code,
      display_name_snapshot: price.display_name,
      quantity: 1,
      unit_amount_cents: price.unit_amount_cents,
      total_amount_cents: price.unit_amount_cents,
      fulfillment_state: "pending",
      metadata: {
        workflow_allowance: price.included_entitlement_quantity,
        usage_metric: "document_workflow",
      },
    });
    if (itemError) {
      await supabaseAdmin.from("billing_orders").update({ status: "failed" }).eq("id", orderId);
      throw new Error(`Checkout order item creation failed: ${itemError.message}`);
    }
  }

  if (!orderId) {
    throw new Error("Checkout order ID was not established");
  }

  const { successUrl, cancelUrl } = buildStripeCheckoutReturnUrls();
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "subscription",
      customer: customer.provider_customer_id,
      client_reference_id: orderId,
      line_items: [{ price: mapping.provider_price_id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
      payment_method_collection: "always",
      metadata: {
        darci_environment: "test",
        darci_order_id: orderId,
        darci_billing_account_id: account.id,
        darci_owner_user_id: user.id,
        darci_price_code: price.price_code,
      },
      subscription_data: {
        metadata: {
          darci_environment: "test",
          darci_order_id: orderId,
          darci_billing_account_id: account.id,
          darci_owner_user_id: user.id,
          darci_price_code: price.price_code,
        },
      },
    },
    { idempotencyKey: `darci:test:checkout:${orderId}` },
  );
  assertStripeObjectIsTestMode(session, "Stripe Checkout Session");
  if (!session.url) throw new Error("Stripe Checkout Session did not return a hosted URL");

  const { error: updateError } = await supabaseAdmin
    .from("billing_orders")
    .update({
      provider_checkout_session_id: session.id,
      status: "pending_payment",
      placed_at: new Date().toISOString(),
      metadata: {
        source: "member_membership_checkout",
        stripe_expires_at: new Date(session.expires_at * 1000).toISOString(),
      },
    })
    .eq("id", orderId);
  if (updateError) throw new Error(`Checkout order update failed: ${updateError.message}`);

  return {
    orderId,
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
    reused: false,
  };
};

export const createMemberCustomerPortalSession = async (input: { dbUserId: string }) => {
  const user = await getAppUser(input.dbUserId);
  const account = await getOrCreateBillingAccount(user);
  const { data: customer, error } = await supabaseAdmin
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("billing_account_id", account.id)
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("is_default", true)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Billing customer lookup failed: ${error.message}`);
  if (!customer) {
    throw new MemberBillingServiceError(409, "billing_customer_missing", "No Stripe membership customer exists");
  }

  const { data: configuration, error: configError } = await supabaseAdmin
    .from("billing_provider_configurations")
    .select("provider_configuration_id")
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("configuration_kind", "customer_portal")
    .eq("status", "verified")
    .single();
  if (configError || !configuration) {
    throw new MemberBillingServiceError(503, "billing_portal_not_ready", "Billing portal is not configured");
  }

  const { portalReturnUrl } = buildStripeCheckoutReturnUrls();
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: customer.provider_customer_id,
    configuration: configuration.provider_configuration_id,
    return_url: portalReturnUrl,
  });
  assertStripeObjectIsTestMode(session, "Stripe Customer Portal Session");
  return { portalUrl: session.url };
};

export const getMemberMembershipStatus = async (input: { dbUserId: string }) => {
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, status")
    .eq("id", input.dbUserId)
    .single();
  if (userError || !user) {
    throw new MemberBillingServiceError(404, "billing_user_not_found", "DARCi user not found");
  }
  if (user.status !== "active") {
    throw new MemberBillingServiceError(403, "billing_account_inactive", "DARCi account is not active");
  }

  const { data: rawCatalog, error: catalogError } = await supabaseAdmin
    .from("billing_catalog_prices")
    .select(
      "id, price_code, display_name, currency_code, unit_amount_cents, billing_interval, interval_count, included_entitlement_quantity, usage_limit_quantity, sort_order",
    )
    .in("price_code", Array.from(ALLOWED_PRICE_CODES))
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (catalogError) throw new Error(`Billing catalog status lookup failed: ${catalogError.message}`);

  const { data: account, error: accountError } = await supabaseAdmin
    .from("billing_accounts")
    .select("id, status")
    .eq("owner_user_id", input.dbUserId)
    .eq("account_key", "default")
    .eq("is_default", true)
    .maybeSingle();
  if (accountError) throw new Error(`Billing account status lookup failed: ${accountError.message}`);

  let subscription: Record<string, unknown> | null = null;
  let subscriptionItem: Record<string, unknown> | null = null;
  let entitlement: Record<string, unknown> | null = null;
  let activationPending = false;

  if (account) {
    const [{ data: subscriptionData, error: subscriptionError }, { count: pendingOrderCount, error: pendingError }] = await Promise.all([
      supabaseAdmin
        .from("billing_subscriptions")
        .select(
          "id, status, provider_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, updated_at",
        )
        .eq("billing_account_id", account.id)
        .eq("provider_environment", "test")
        .eq("role_context", "member")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("billing_orders")
        .select("id", { count: "exact", head: true })
        .eq("billing_account_id", account.id)
        .eq("provider_environment", "test")
        .eq("order_kind", "subscription_checkout")
        .in("status", ["draft", "pending_payment"]),
    ]);
    if (subscriptionError) throw new Error(`Subscription status lookup failed: ${subscriptionError.message}`);
    if (pendingError) throw new Error(`Pending Checkout status lookup failed: ${pendingError.message}`);
    subscription = subscriptionData as Record<string, unknown> | null;
    activationPending = !subscription && (pendingOrderCount ?? 0) > 0;

    if (subscription?.id) {
      const { data: itemData, error: itemError } = await supabaseAdmin
        .from("billing_subscription_items")
        .select("id, price_code_snapshot, display_name_snapshot, status, current_period_start, current_period_end")
        .eq("subscription_id", String(subscription.id))
        .eq("role_context", "member")
        .maybeSingle();
      if (itemError) throw new Error(`Subscription item status lookup failed: ${itemError.message}`);
      subscriptionItem = itemData as Record<string, unknown> | null;

      if (subscriptionItem?.id) {
        const { data: entitlementData, error: entitlementError } = await supabaseAdmin
          .from("billing_entitlements")
          .select("id, status, quantity_total, quantity_used, starts_at, ends_at")
          .eq("subscription_item_id", String(subscriptionItem.id))
          .eq("entitlement_type", "document_workflow_capacity")
          .order("starts_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (entitlementError) throw new Error(`Entitlement status lookup failed: ${entitlementError.message}`);
        entitlement = entitlementData as Record<string, unknown> | null;
      }
    }
  }

  const [{ count: heldFinalPackageCount, error: heldError }, policy] = await Promise.all([
    supabaseAdmin
      .from("document_release_controls")
      .select("id, documents!inner(owner_id)", { count: "exact", head: true })
      .eq("release_status", "billing_held")
      .eq("documents.owner_id", input.dbUserId),
    evaluateMemberBillingPolicy(input.dbUserId),
  ]);
  if (heldError) throw new Error(`Held final-package status lookup failed: ${heldError.message}`);

  const total = typeof entitlement?.quantity_total === "number" ? entitlement.quantity_total : null;
  const used = typeof entitlement?.quantity_used === "number" ? entitlement.quantity_used : 0;
  const remaining = total === null ? null : Math.max(total - used, 0);
  const subscriptionStatus = typeof subscription?.status === "string" ? subscription.status : null;

  return {
    providerEnvironment: "test" as const,
    paymentsReal: false,
    enforcementMode: getBillingEnforcementMode(),
    plans: (rawCatalog ?? []).map((price) => ({
      priceCode: price.price_code,
      displayName: price.display_name,
      currencyCode: price.currency_code,
      unitAmountCents: price.unit_amount_cents,
      billingInterval: price.billing_interval,
      intervalCount: price.interval_count,
      documentWorkflowAllowance:
        price.usage_limit_quantity ?? price.included_entitlement_quantity,
    })),
    membership: {
      state: activationPending ? "activation_pending" : subscriptionStatus ?? "none",
      subscriptionStatus,
      priceCode: typeof subscriptionItem?.price_code_snapshot === "string"
        ? subscriptionItem.price_code_snapshot
        : null,
      planName: typeof subscriptionItem?.display_name_snapshot === "string"
        ? subscriptionItem.display_name_snapshot
        : null,
      currentPeriodStart: typeof subscription?.current_period_start === "string"
        ? subscription.current_period_start
        : null,
      currentPeriodEnd: typeof subscription?.current_period_end === "string"
        ? subscription.current_period_end
        : null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
      allowance: {
        total,
        used,
        remaining,
        exhausted: total !== null && used >= total,
      },
      heldFinalPackageCount: heldFinalPackageCount ?? 0,
    },
    eligibility: {
      canCreateWorkflow: policy.canProceed,
      entitled: policy.allowed,
      wouldBlock: policy.wouldBlock,
      reasonCode: policy.reasonCode,
    },
    actions: {
      canCheckout: !subscription && !activationPending,
      canOpenPortal: Boolean(subscription),
      planChangeAvailable: false,
      planChangeReason: "plan_change_policy_pending",
    },
  };
};

export const generateCheckoutIdempotencyToken = () => randomUUID();
