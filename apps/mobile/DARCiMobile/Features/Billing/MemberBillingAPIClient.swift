import Foundation

protocol MemberBillingAPIProviding: Sendable {
    func getMembership(accessToken: String) async throws -> MemberMembershipPayload
    func createCheckout(priceCode: String, idempotencyToken: String, accessToken: String) async throws -> MemberCheckoutResponse
    func createPortalSession(accessToken: String) async throws -> MemberBillingPortalResponse
}

struct MemberBillingAPIClient: MemberBillingAPIProviding, Sendable {
    private let authClient: AuthAPIClient

    init(authClient: AuthAPIClient = AuthAPIClient()) {
        self.authClient = authClient
    }

    func getMembership(accessToken: String) async throws -> MemberMembershipPayload {
        try await authClient.get(
            path: "/billing/member-membership",
            accessToken: accessToken
        )
    }

    func createCheckout(
        priceCode: String,
        idempotencyToken: String,
        accessToken: String
    ) async throws -> MemberCheckoutResponse {
        try await authClient.post(
            path: "/billing/member-membership/checkout",
            body: MemberCheckoutRequest(
                priceCode: priceCode,
                idempotencyToken: idempotencyToken
            ),
            accessToken: accessToken
        )
    }

    func createPortalSession(accessToken: String) async throws -> MemberBillingPortalResponse {
        try await authClient.post(
            path: "/billing/customer-portal-session",
            body: MemberBillingPortalRequest(),
            accessToken: accessToken
        )
    }
}

struct MockMemberBillingAPIClient: MemberBillingAPIProviding, Sendable {
    func getMembership(accessToken: String) async throws -> MemberMembershipPayload {
        let environment = ProcessInfo.processInfo.environment
        let checkoutEnabled = environment["DARCI_MOCK_IOS_CHECKOUT_ENABLED"] == "1"
        let state = environment["DARCI_MOCK_MEMBER_BILLING_STATE"] ?? "none"
        let isActive = state == "active" || state == "trialing"

        return MemberMembershipPayload(
            providerEnvironment: "test",
            paymentsReal: false,
            enforcementMode: "observe",
            plans: MemberBillingPlan.fallbackPlans,
            membership: .init(
                state: state,
                subscriptionStatus: isActive ? state : nil,
                priceCode: isActive ? MemberBillingPriceCode.plus : nil,
                planName: isActive ? "Plus" : nil,
                pendingPlanChange: nil,
                currentPeriodStart: nil,
                currentPeriodEnd: nil,
                cancelAtPeriodEnd: false,
                allowance: .init(
                    total: isActive ? 10 : nil,
                    used: 0,
                    remaining: isActive ? 10 : nil,
                    exhausted: false
                ),
                heldFinalPackageCount: 0
            ),
            eligibility: .init(
                canCreateWorkflow: true,
                entitled: isActive,
                wouldBlock: false,
                reasonCode: isActive ? "billing_allowed" : "billing_observe_mode"
            ),
            actions: .init(
                canCheckout: isActive == false,
                iosCheckoutAvailable: checkoutEnabled,
                canOpenPortal: isActive,
                planChangeAvailable: isActive,
                planChangeReason: nil
            )
        )
    }

    func createCheckout(priceCode: String, idempotencyToken: String, accessToken: String) async throws -> MemberCheckoutResponse {
        MemberCheckoutResponse(
            checkoutUrl: "https://checkout.stripe.com/test",
            checkoutSessionId: "cs_test_mock"
        )
    }

    func createPortalSession(accessToken: String) async throws -> MemberBillingPortalResponse {
        MemberBillingPortalResponse(portalUrl: "https://billing.stripe.com/test")
    }
}
