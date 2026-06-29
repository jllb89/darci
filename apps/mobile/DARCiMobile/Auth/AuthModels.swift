import Foundation

enum AuthIdentifierMethod: String, Codable, Equatable, Sendable {
    case email
    case phone
}

struct AuthEmailOTPStartRequest: Encodable, Equatable, Sendable {
    let email: String
    let returnTo: String?
}

struct AuthPhoneOTPStartRequest: Encodable, Equatable, Sendable {
    let phone: String
    let returnTo: String?
}

struct AuthEmailOTPVerifyRequest: Encodable, Equatable, Sendable {
    let email: String
    let token: String
    let returnTo: String?
}

struct AuthPhoneOTPVerifyRequest: Encodable, Equatable, Sendable {
    let phone: String
    let token: String
    let returnTo: String?
}

struct AuthRefreshRequest: Encodable, Equatable, Sendable {
    let refreshToken: String
}

struct AuthProfileCompletionRequest: Encodable, Equatable, Sendable {
    let firstName: String
    let lastName: String
    let email: String
    let phone: String
}

struct AuthOTPStartResponse: Decodable, Equatable, Sendable {
    let status: String?
    let message: String?
    let otpLength: Int?
    let cooldownSeconds: Int?
}

struct AuthenticatedUser: Codable, Equatable, Sendable {
    let id: String
    let email: String
    let phone: String?
    let role: String?
    let availableRoles: [String]?
    let status: String?
    let firstName: String?
    let lastName: String?
    let emailConfirmedAt: String?
    let phoneConfirmedAt: String?
    let lastSignInAt: String?
    let lastAuthSyncedAt: String?
}

struct AuthSession: Codable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    let user: AuthenticatedUser
}

struct AuthVerifyResponse: Decodable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    let user: AuthenticatedUser
    let profileCompletionRequired: Bool

    var session: AuthSession {
        AuthSession(accessToken: accessToken, refreshToken: refreshToken, user: user)
    }
}

struct AuthRefreshResponse: Decodable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    let user: AuthenticatedUser

    var session: AuthSession {
        AuthSession(accessToken: accessToken, refreshToken: refreshToken, user: user)
    }
}

struct AuthUserResponse: Decodable, Equatable, Sendable {
    let user: AuthenticatedUser
}

struct AuthErrorResponse: Decodable, Equatable, Sendable {
    let error: String?
    let message: String?
}