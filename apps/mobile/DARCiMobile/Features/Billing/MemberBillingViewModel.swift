import Combine
import Foundation

@MainActor
final class MemberBillingViewModel: ObservableObject {
    @Published private(set) var payload: MemberMembershipPayload?
    @Published private(set) var isLoading = false
    @Published private(set) var startingPriceCode: String?
    @Published private(set) var isOpeningPortal = false
    @Published private(set) var checkoutResult: String?
    @Published var errorMessage: String?
    @Published var selectedPriceCode = MemberBillingPriceCode.plus

    private let apiClient: MemberBillingAPIProviding
    private let refreshSession: () async -> AuthSession?
    private var accessToken: String
    private var pollingTask: Task<Void, Never>?

    init(
        accessToken: String,
        apiClient: MemberBillingAPIProviding,
        refreshSession: @escaping () async -> AuthSession? = { nil }
    ) {
        self.accessToken = accessToken
        self.apiClient = apiClient
        self.refreshSession = refreshSession
    }

    deinit {
        pollingTask?.cancel()
    }

    var plans: [MemberBillingPlan] {
        guard let plans = payload?.plans, plans.isEmpty == false else {
            return MemberBillingPlan.fallbackPlans
        }
        return plans
    }

    var membership: MemberMembershipPayload.Membership? {
        payload?.membership
    }

    var canCheckout: Bool {
        payload?.actions.canCheckout == true &&
            payload?.actions.iosCheckoutAvailable == true &&
            membership?.state == "none" &&
            isLoading == false
    }

    func updateAccessToken(_ nextAccessToken: String) {
        accessToken = nextAccessToken
    }

    func load(quietly: Bool = false) async {
        guard accessToken.isEmpty == false else {
            errorMessage = "Sign in again to manage your membership."
            return
        }

        if quietly == false {
            isLoading = true
        }

        do {
            let nextPayload = try await requestWithTokenRefresh { accessToken in
                try await apiClient.getMembership(accessToken: accessToken)
            }
            payload = nextPayload
            errorMessage = nil

            if nextPayload.membership.isPendingActivation {
                startPolling()
            } else {
                stopPolling()
            }
        } catch {
            errorMessage = Self.userFacingMessage(
                for: error,
                fallback: "We could not load your membership."
            )
        }

        if quietly == false {
            isLoading = false
        }
    }

    func createCheckout() async -> URL? {
        guard startingPriceCode == nil, canCheckout else { return nil }

        let priceCode = selectedPriceCode
        startingPriceCode = priceCode
        errorMessage = nil

        do {
            let idempotencyToken = UUID().uuidString
            let response = try await requestWithTokenRefresh { accessToken in
                try await apiClient.createCheckout(
                    priceCode: priceCode,
                    idempotencyToken: idempotencyToken,
                    accessToken: accessToken
                )
            }
            guard let url = URL(string: response.checkoutUrl), url.scheme == "https" else {
                throw AuthAPIError.invalidURL(path: response.checkoutUrl)
            }
            startingPriceCode = nil
            return url
        } catch {
            startingPriceCode = nil
            errorMessage = Self.userFacingMessage(
                for: error,
                fallback: "We could not open Stripe Checkout."
            )
            return nil
        }
    }

    func createPortalSession() async -> URL? {
        guard isOpeningPortal == false else { return nil }

        isOpeningPortal = true
        errorMessage = nil

        do {
            let response = try await requestWithTokenRefresh { accessToken in
                try await apiClient.createPortalSession(accessToken: accessToken)
            }
            guard let url = URL(string: response.portalUrl), url.scheme == "https" else {
                throw AuthAPIError.invalidURL(path: response.portalUrl)
            }
            isOpeningPortal = false
            return url
        } catch {
            isOpeningPortal = false
            errorMessage = Self.userFacingMessage(
                for: error,
                fallback: "We could not open your billing portal."
            )
            return nil
        }
    }

    func handleReturn(_ result: String) async {
        checkoutResult = result
        if result == "success" {
            startPolling()
        }
        await load()
    }

    func refreshAfterReturningToApp() async {
        guard payload != nil else { return }
        await load(quietly: true)
    }

    private func startPolling() {
        guard pollingTask == nil else { return }

        pollingTask = Task { [weak self] in
            while Task.isCancelled == false {
                try? await Task.sleep(for: .seconds(2.5))
                guard Task.isCancelled == false, let self else { return }
                await self.load(quietly: true)
                if self.membership?.isPendingActivation != true {
                    self.pollingTask = nil
                    return
                }
            }
        }
    }

    private func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    private func requestWithTokenRefresh<Response>(
        _ request: (String) async throws -> Response
    ) async throws -> Response {
        do {
            return try await request(accessToken)
        } catch {
            guard case AuthAPIError.unauthorized = error,
                  let refreshedSession = await refreshSession(),
                  refreshedSession.accessToken.isEmpty == false else {
                throw error
            }

            accessToken = refreshedSession.accessToken
            return try await request(refreshedSession.accessToken)
        }
    }

    private static func userFacingMessage(for error: Error, fallback: String) -> String {
        switch error {
        case let AuthAPIError.validation(message),
             let AuthAPIError.unauthorized(message),
             let AuthAPIError.rateLimited(message),
             let AuthAPIError.server(_, message),
             let AuthAPIError.unexpectedStatus(_, message):
            return message?.isEmpty == false ? message ?? fallback : fallback
        default:
            return fallback
        }
    }
}
