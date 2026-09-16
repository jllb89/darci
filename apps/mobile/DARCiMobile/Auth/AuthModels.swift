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

enum AccessTokenClaims {
    static func payload(_ token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var value = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        value += String(repeating: "=", count: (4 - value.count % 4) % 4)
        guard let data = Data(base64Encoded: value) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    // These hints only schedule refresh and match the local account. The server
    // remains responsible for verifying signatures, expiry and authorization.
    static func expiresSoon(_ token: String, now: Date = Date()) -> Bool {
        guard let expiry = payload(token)?["exp"] as? Double else { return false }
        return expiry <= now.timeIntervalSince1970 + 120
    }

    static func sameAccount(_ first: String, _ second: String) -> Bool {
        guard let subject = payload(first)?["sub"] as? String, !subject.isEmpty else { return false }
        return subject == (payload(second)?["sub"] as? String)
    }
}

struct AuthVerifyResponse: Decodable, Equatable, Sendable {
    let accessToken: String?
    let refreshToken: String?
    let user: AuthenticatedUser?
    let profileCompletionRequired: Bool?
    let stepUp: AuthStepUpChallenge?

    var session: AuthSession? {
        guard let accessToken, let refreshToken, let user else { return nil }
        return AuthSession(accessToken: accessToken, refreshToken: refreshToken, user: user)
    }
}

struct AuthStepUpChallenge: Decodable, Equatable, Sendable {
    let method: AuthIdentifierMethod
    let identifier: String
    let otpLength: Int?
    let cooldownSeconds: Int?
    let message: String?
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
