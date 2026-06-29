import Foundation

struct MockAuthAPIClient: AuthAPIProviding, Sendable {
    var otpLength = 8
    var cooldownSeconds = 60
    var profileCompletionRequired = true

    func requestEmailOTP(email: String, returnTo: String?) async throws -> AuthOTPStartResponse {
        AuthOTPStartResponse(status: "ok", message: "Email code sent", otpLength: otpLength, cooldownSeconds: cooldownSeconds)
    }

    func requestPhoneOTP(phone: String, returnTo: String?) async throws -> AuthOTPStartResponse {
        AuthOTPStartResponse(status: "ok", message: "Phone code sent", otpLength: otpLength, cooldownSeconds: cooldownSeconds)
    }

    func verifyEmailOTP(email: String, token: String, returnTo: String?) async throws -> AuthVerifyResponse {
        AuthVerifyResponse(
            accessToken: "mock-access-token",
            refreshToken: "mock-refresh-token",
            user: Self.mockUser(email: email, phone: nil),
            profileCompletionRequired: profileCompletionRequired
        )
    }

    func verifyPhoneOTP(phone: String, token: String, returnTo: String?) async throws -> AuthVerifyResponse {
        AuthVerifyResponse(
            accessToken: "mock-access-token",
            refreshToken: "mock-refresh-token",
            user: Self.mockUser(email: "", phone: phone),
            profileCompletionRequired: profileCompletionRequired
        )
    }

    func refresh(refreshToken: String) async throws -> AuthRefreshResponse {
        AuthRefreshResponse(
            accessToken: "mock-refreshed-access-token",
            refreshToken: "mock-refreshed-refresh-token",
            user: Self.mockUser(email: "", phone: nil)
        )
    }

    func completeProfile(_ profile: AuthProfileCompletionRequest, accessToken: String) async throws -> AuthUserResponse {
        AuthUserResponse(
            user: AuthenticatedUser(
                id: "mock-user",
                email: profile.email,
                phone: profile.phone,
                role: "member",
                availableRoles: ["member"],
                status: "active",
                firstName: profile.firstName,
                lastName: profile.lastName,
                emailConfirmedAt: "2026-06-26T00:00:00.000Z",
                phoneConfirmedAt: "2026-06-26T00:00:00.000Z",
                lastSignInAt: "2026-06-26T00:00:00.000Z",
                lastAuthSyncedAt: "2026-06-26T00:00:00.000Z"
            )
        )
    }

    static func mockSession() -> AuthSession {
        AuthSession(
            accessToken: "mock-stored-access-token",
            refreshToken: "mock-stored-refresh-token",
            user: mockUser(email: "member@example.com", phone: "+12025550147")
        )
    }

    private static func mockUser(email: String, phone: String?) -> AuthenticatedUser {
        AuthenticatedUser(
            id: "mock-user",
            email: email,
            phone: phone,
            role: "member",
            availableRoles: ["member"],
            status: "active",
            firstName: nil,
            lastName: nil,
            emailConfirmedAt: email.isEmpty ? nil : "2026-06-26T00:00:00.000Z",
            phoneConfirmedAt: phone == nil ? nil : "2026-06-26T00:00:00.000Z",
            lastSignInAt: "2026-06-26T00:00:00.000Z",
            lastAuthSyncedAt: "2026-06-26T00:00:00.000Z"
        )
    }
}