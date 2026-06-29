import Foundation

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var productCards = HomeProductCard.fallbackCards
    @Published private(set) var isLoadingProducts = false
    @Published private(set) var productLoadMessage: String?

    private let apiClient: HomeAPIProviding

    init(apiClient: HomeAPIProviding = HomeAPIClient()) {
        self.apiClient = apiClient
    }

    func loadProducts(for session: AuthSession?) async {
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            productCards = HomeProductCard.fallbackCards
            productLoadMessage = nil
            return
        }

        isLoadingProducts = true
        defer { isLoadingProducts = false }

        do {
            let response = try await apiClient.listProductFlowModes(accessToken: accessToken)
            let cards = (response.modes ?? [])
                .filter(\.isActive)
                .sorted { $0.sortOrder < $1.sortOrder }
                .map(HomeProductCard.init(mode:))

            productCards = cards.isEmpty ? HomeProductCard.fallbackCards : cards
            productLoadMessage = nil
        } catch AuthAPIError.unauthorized(_) {
            productCards = HomeProductCard.fallbackCards
            productLoadMessage = "Sign in again to refresh product options."
        } catch {
            productCards = HomeProductCard.fallbackCards
            productLoadMessage = "Showing saved product options."
        }
    }
}