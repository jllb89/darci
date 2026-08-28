import Combine
import Foundation

enum MemberBillingPresentationTrigger: String, Equatable, Sendable {
    case authenticationCompleted
    case productCreation
    case homePrompt
    case settings
    case billingReturn
}

struct MemberBillingPresentation: Identifiable, Equatable, Sendable {
    let id = UUID()
    let trigger: MemberBillingPresentationTrigger
    let returnEvent: MemberBillingReturn?
}

enum MemberBillingProductAccessDecision: Equatable, Sendable {
    case allowed
    case presentedMembership
}

struct MemberBillingHomePrompt: Equatable, Sendable {
    enum Kind: Equatable, Sendable {
        case subscribe
        case unavailable
        case activationPending
        case recovery
    }

    let kind: Kind
    let eyebrow: String
    let title: String
    let message: String
    let actionTitle: String
}

protocol MemberBillingPresentationStoring {
    func dismissedAt(for userId: String) -> Date?
    func setDismissedAt(_ date: Date, for userId: String)
}

struct UserDefaultsMemberBillingPresentationStore: MemberBillingPresentationStoring {
    private let defaults: UserDefaults
    private let keyPrefix = "darci.memberBilling.lastDismissedAt."

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func dismissedAt(for userId: String) -> Date? {
        let timestamp = defaults.double(forKey: keyPrefix + userId)
        return timestamp > 0 ? Date(timeIntervalSince1970: timestamp) : nil
    }

    func setDismissedAt(_ date: Date, for userId: String) {
        defaults.set(date.timeIntervalSince1970, forKey: keyPrefix + userId)
    }
}

@MainActor
final class MemberBillingPresentationCoordinator: ObservableObject {
    @Published private(set) var payload: MemberMembershipPayload?
    @Published private(set) var activePresentation: MemberBillingPresentation?
    @Published private(set) var isRefreshing = false

    private let apiClient: MemberBillingAPIProviding
    private let store: MemberBillingPresentationStoring
    private let now: () -> Date
    private let automaticPromptCooldown: TimeInterval
    private var presentedUserId: String?
    private var pendingProductModeKey: String?

    init(
        apiClient: MemberBillingAPIProviding,
        store: MemberBillingPresentationStoring = UserDefaultsMemberBillingPresentationStore(),
        automaticPromptCooldown: TimeInterval = 7 * 24 * 60 * 60,
        now: @escaping () -> Date = Date.init
    ) {
        self.apiClient = apiClient
        self.store = store
        self.automaticPromptCooldown = automaticPromptCooldown
        self.now = now
    }

    var homePrompt: MemberBillingHomePrompt? {
        guard let payload, payload.membership.isActive == false else { return nil }

        if payload.membership.isPendingActivation {
            return MemberBillingHomePrompt(
                kind: .activationPending,
                eyebrow: "DARCi MEMBERSHIP",
                title: "Activation pending",
                message: "Stripe is confirming your membership. We’ll update access after the signed webhook arrives.",
                actionTitle: "View status"
            )
        }

        if payload.membership.needsRecovery {
            return MemberBillingHomePrompt(
                kind: .recovery,
                eyebrow: "DARCi MEMBERSHIP",
                title: "Your membership needs attention",
                message: "Restore billing to create new document workflows. Existing accepted documents remain available.",
                actionTitle: "Restore membership"
            )
        }

        if payload.actions.iosCheckoutAvailable == true {
            return MemberBillingHomePrompt(
                kind: .subscribe,
                eyebrow: "DARCi MEMBERSHIP",
                title: "Make it official.",
                message: "Choose a monthly allowance for Trusts, POAs, and document notarization.",
                actionTitle: "View plans"
            )
        }

        return MemberBillingHomePrompt(
            kind: .unavailable,
            eyebrow: "DARCi MEMBERSHIP",
            title: "Make it official.",
            message: "View plans and membership status. Purchase remains unavailable in this iOS build.",
            actionTitle: "View membership"
        )
    }

    func handleAuthenticatedEntry(session: AuthSession, hasPriorityRoute: Bool) async {
        guard isMemberSession(session) else {
            reset()
            return
        }

        let payload = await refresh(session: session)
        guard hasPriorityRoute == false, let payload else { return }

        if payload.membership.isPendingActivation || payload.membership.needsRecovery {
            present(trigger: .authenticationCompleted, session: session)
            return
        }

        guard payload.membership.state == "none",
              payload.actions.iosCheckoutAvailable == true,
              automaticPromptCooldownHasElapsed(for: session.user.id) else {
            return
        }

        present(trigger: .authenticationCompleted, session: session)
    }

    func handleRestoredSession(_ session: AuthSession) async {
        guard isMemberSession(session) else {
            reset()
            return
        }
        _ = await refresh(session: session)
    }

    func handleRoleChange(_ session: AuthSession?) async {
        guard let session, isMemberSession(session) else {
            reset()
            return
        }
        dismiss(recordDismissal: false)
        _ = await refresh(session: session)
    }

    func requestProductCreation(modeKey: String, session: AuthSession?) async -> MemberBillingProductAccessDecision {
        guard let session, isMemberSession(session) else { return .allowed }
        let currentPayload: MemberMembershipPayload?
        if let payload {
            currentPayload = payload
        } else {
            currentPayload = await refresh(session: session)
        }
        guard let currentPayload else {
            // Product APIs remain the authoritative enforcement boundary if this read fails.
            return .allowed
        }

        if currentPayload.membership.isActive {
            guard currentPayload.eligibility.canCreateWorkflow,
                  currentPayload.membership.allowance.exhausted == false else {
                pendingProductModeKey = nil
                present(trigger: .productCreation, session: session)
                return .presentedMembership
            }
            return .allowed
        }

        if currentPayload.membership.state == "none",
           currentPayload.actions.iosCheckoutAvailable != true {
            // Never trap a member behind a screen that cannot complete a purchase.
            return .allowed
        }

        pendingProductModeKey = modeKey
        present(trigger: .productCreation, session: session)
        return .presentedMembership
    }

    func presentFromHome(session: AuthSession?) {
        guard let session, isMemberSession(session) else { return }
        pendingProductModeKey = nil
        present(trigger: .homePrompt, session: session)
    }

    func presentFromSettings(session: AuthSession?) {
        guard let session, isMemberSession(session) else { return }
        pendingProductModeKey = nil
        present(trigger: .settings, session: session)
    }

    func presentBillingReturn(_ returnEvent: MemberBillingReturn, session: AuthSession?) {
        guard let session, isMemberSession(session) else { return }
        activePresentation = MemberBillingPresentation(trigger: .billingReturn, returnEvent: returnEvent)
        presentedUserId = session.user.id
    }

    func recordMembershipUpdate(_ nextPayload: MemberMembershipPayload) -> String? {
        payload = nextPayload
        guard nextPayload.membership.isActive, let pendingProductModeKey else { return nil }
        self.pendingProductModeKey = nil
        activePresentation = nil
        presentedUserId = nil
        return pendingProductModeKey
    }

    func dismiss(recordDismissal: Bool = true) {
        if recordDismissal,
           let userId = presentedUserId,
           activePresentation?.trigger != .settings,
           activePresentation?.trigger != .billingReturn {
            store.setDismissedAt(now(), for: userId)
        }
        activePresentation = nil
        presentedUserId = nil
        pendingProductModeKey = nil
    }

    func suspendForPriorityRoute() {
        dismiss(recordDismissal: false)
    }

    func reset() {
        payload = nil
        isRefreshing = false
        activePresentation = nil
        presentedUserId = nil
        pendingProductModeKey = nil
    }

    @discardableResult
    func refresh(session: AuthSession) async -> MemberMembershipPayload? {
        guard isMemberSession(session), session.accessToken.isEmpty == false else {
            reset()
            return nil
        }

        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let nextPayload = try await apiClient.getMembership(accessToken: session.accessToken)
            payload = nextPayload
            return nextPayload
        } catch {
            return nil
        }
    }

    private func present(trigger: MemberBillingPresentationTrigger, session: AuthSession) {
        activePresentation = MemberBillingPresentation(trigger: trigger, returnEvent: nil)
        presentedUserId = session.user.id
    }

    private func automaticPromptCooldownHasElapsed(for userId: String) -> Bool {
        guard let dismissedAt = store.dismissedAt(for: userId) else { return true }
        return now().timeIntervalSince(dismissedAt) >= automaticPromptCooldown
    }

    private func isMemberSession(_ session: AuthSession) -> Bool {
        MobileProfileRole.activeRole(for: session.user) == .member
    }
}
