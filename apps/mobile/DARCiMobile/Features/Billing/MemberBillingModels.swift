import Foundation

enum MemberBillingPriceCode {
    static let starter = "member_starter_monthly"
    static let plus = "member_plus_monthly"
    static let volume = "member_volume_monthly"
}

struct MemberBillingPlan: Decodable, Equatable, Identifiable, Sendable {
    let priceCode: String
    let displayName: String
    let currencyCode: String
    let unitAmountCents: Int
    let billingInterval: String
    let intervalCount: Int
    let documentWorkflowAllowance: Int?
    var isUnlimited: Bool? = nil
    var availableForPurchase: Bool? = nil

    var allowanceDescription: String {
        isUnlimited == true ? "Unlimited documents" : "\(documentWorkflowAllowance.map(String.init) ?? "—") documents / month"
    }

    var id: String { priceCode }

    static let fallbackPlans = [
        MemberBillingPlan(
            priceCode: MemberBillingPriceCode.starter,
            displayName: "Starter",
            currencyCode: "USD",
            unitAmountCents: 4_900,
            billingInterval: "month",
            intervalCount: 1,
            documentWorkflowAllowance: 3
        ),
        MemberBillingPlan(
            priceCode: MemberBillingPriceCode.plus,
            displayName: "Plus",
            currencyCode: "USD",
            unitAmountCents: 9_900,
            billingInterval: "month",
            intervalCount: 1,
            documentWorkflowAllowance: 10
        ),
        MemberBillingPlan(
            priceCode: MemberBillingPriceCode.volume,
            displayName: "Volume",
            currencyCode: "USD",
            unitAmountCents: 19_900,
            billingInterval: "month",
            intervalCount: 1,
            documentWorkflowAllowance: 25
        ),
    ]
}

struct MemberMembershipPayload: Decodable, Equatable, Sendable {
    let providerEnvironment: String
    let paymentsReal: Bool
    let enforcementMode: String
    let plans: [MemberBillingPlan]
    let membership: Membership
    let eligibility: Eligibility
    let actions: Actions

    struct Membership: Decodable, Equatable, Sendable {
        let state: String
        let subscriptionStatus: String?
        let priceCode: String?
        let planName: String?
        let pendingPlanChange: PendingPlanChange?
        let currentPeriodStart: String?
        let currentPeriodEnd: String?
        let cancelAtPeriodEnd: Bool
        let allowance: Allowance
        let heldFinalPackageCount: Int

        struct PendingPlanChange: Decodable, Equatable, Sendable {
            let type: String
            let status: String
            let targetPriceCode: String
            let effectiveAt: String?
        }
    }

    struct Allowance: Decodable, Equatable, Sendable {
        let total: Int?
        let used: Int
        let remaining: Int?
        let exhausted: Bool
        var isUnlimited: Bool? = nil
        var periodStart: String? = nil
        var periodEnd: String? = nil
    }

    struct Eligibility: Decodable, Equatable, Sendable {
        let canCreateWorkflow: Bool
        let entitled: Bool
        let wouldBlock: Bool
        let reasonCode: String?
    }

    struct Actions: Decodable, Equatable, Sendable {
        let canCheckout: Bool
        let iosCheckoutAvailable: Bool?
        let canOpenPortal: Bool
        let planChangeAvailable: Bool
        let planChangeReason: String?
    }
}

extension MemberMembershipPayload.Membership {
    var isActive: Bool {
        state == "active" || state == "trialing"
    }

    var isPendingActivation: Bool {
        state == "activation_pending" || state == "pending"
    }

    var needsRecovery: Bool {
        ["past_due", "paused", "incomplete", "unpaid", "canceled", "expired", "incomplete_expired"].contains(state)
    }
}

struct MemberCheckoutRequest: Encodable, Equatable, Sendable {
    let priceCode: String
    let idempotencyToken: String
}

struct MemberCheckoutResponse: Decodable, Equatable, Sendable {
    let checkoutUrl: String
    let checkoutSessionId: String
}

struct MemberBillingPortalRequest: Encodable, Equatable, Sendable {}

struct MemberPlanChangeRequest: Encodable, Sendable {
    let targetPriceCode: String
    let idempotencyToken: String
}
struct MemberPlanChangeResponse: Decodable, Sendable {
    let changeType: String
    let status: String
    let effectiveAt: String?
}

struct MemberBillingPortalResponse: Decodable, Equatable, Sendable {
    let portalUrl: String
}

struct MemberBillingReturn: Equatable, Identifiable, Sendable {
    let id = UUID()
    let result: String
}

enum MemberBillingDeepLink {
    static func result(from url: URL, production: Bool = MobileEnvironment.isProduction) -> String? {
        guard MobileEnvironment.acceptsWebURL(url, production: production),
              url.path == "/app",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let result = components.queryItems?.first(where: { $0.name == "billing" })?.value?
                .trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              ["success", "canceled"].contains(result) else {
            return nil
        }

        return result
    }
}
