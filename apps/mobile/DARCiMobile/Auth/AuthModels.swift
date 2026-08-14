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

struct AuthLogoutRequest: Encodable, Equatable, Sendable {
    let refreshToken: String
}

struct AuthPasswordResetRequest: Encodable, Equatable, Sendable {
    let refreshToken: String
    let password: String
}

struct AuthProfileCompletionRequest: Encodable, Equatable, Sendable {
    let firstName: String
    let lastName: String
    let email: String
    let phone: String
}

struct AuthPersonalInfoUpdateRequest: Encodable, Equatable, Sendable {
    let firstName: String
    let lastName: String
    let email: String
    let phone: String
    let address: String?
}

struct AuthActiveRoleRequest: Encodable, Equatable, Sendable {
    let role: String
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
    let address: String?
    let role: String?
    let availableRoles: [String]?
    let status: String?
    let firstName: String?
    let lastName: String?
    let emailConfirmedAt: String?
    let phoneConfirmedAt: String?
    let lastSignInAt: String?
    let lastAuthSyncedAt: String?

    init(
        id: String,
        email: String,
        phone: String?,
        address: String? = nil,
        role: String?,
        availableRoles: [String]?,
        status: String?,
        firstName: String?,
        lastName: String?,
        emailConfirmedAt: String?,
        phoneConfirmedAt: String?,
        lastSignInAt: String?,
        lastAuthSyncedAt: String?
    ) {
        self.id = id
        self.email = email
        self.phone = phone
        self.address = address
        self.role = role
        self.availableRoles = availableRoles
        self.status = status
        self.firstName = firstName
        self.lastName = lastName
        self.emailConfirmedAt = emailConfirmedAt
        self.phoneConfirmedAt = phoneConfirmedAt
        self.lastSignInAt = lastSignInAt
        self.lastAuthSyncedAt = lastAuthSyncedAt
    }
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

struct AuthDeleteAccountResponse: Decodable, Equatable, Sendable {
    let status: String
    let message: String?
}

struct AuthValidationErrorResponse: Decodable, Equatable, Sendable {
    let code: String?
    let field: String?
    let message: String?
}

struct AuthErrorResponse: Decodable, Equatable, Sendable {
    let error: String?
    let message: String?
    let errors: [AuthValidationErrorResponse]?
}