import Foundation

protocol PushDeviceAPIProviding: Sendable {
    func registerDevice(installationId: String, request: PushDeviceRegistrationRequest, accessToken: String) async throws -> PushDeviceResponse
    func updatePermission(installationId: String, request: PushDevicePermissionRequest, accessToken: String) async throws -> PushDeviceResponse
    func deactivateDevice(installationId: String, accessToken: String) async throws -> PushDeviceDeactivationResponse
}

struct PushDeviceAPIClient: PushDeviceAPIProviding, Sendable {
    private let authClient: AuthAPIClient

    init(authClient: AuthAPIClient = AuthAPIClient()) {
        self.authClient = authClient
    }

    func registerDevice(installationId: String, request: PushDeviceRegistrationRequest, accessToken: String) async throws -> PushDeviceResponse {
        try await authClient.put(
            path: "/notifications/devices/\(installationId)",
            body: request,
            accessToken: accessToken
        )
    }

    func updatePermission(installationId: String, request: PushDevicePermissionRequest, accessToken: String) async throws -> PushDeviceResponse {
        try await authClient.patch(
            path: "/notifications/devices/\(installationId)/permission",
            body: request,
            accessToken: accessToken
        )
    }

    func deactivateDevice(installationId: String, accessToken: String) async throws -> PushDeviceDeactivationResponse {
        try await authClient.delete(
            path: "/notifications/devices/\(installationId)",
            accessToken: accessToken
        )
    }
}