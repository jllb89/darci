import Foundation

protocol HomeAPIProviding: Sendable {
    func listProductFlowModes(accessToken: String) async throws -> HomeProductFlowModesResponse
}

struct HomeAPIClient: HomeAPIProviding, Sendable {
    private let authClient: AuthAPIClient

    init(authClient: AuthAPIClient = AuthAPIClient()) {
        self.authClient = authClient
    }

    func listProductFlowModes(accessToken: String) async throws -> HomeProductFlowModesResponse {
        try await authClient.get(path: "/rules/product-flow-modes", accessToken: accessToken)
    }
}

struct MockHomeAPIClient: HomeAPIProviding, Sendable {
    var response = HomeProductFlowModesResponse.preview

    func listProductFlowModes(accessToken: String) async throws -> HomeProductFlowModesResponse {
        response
    }
}