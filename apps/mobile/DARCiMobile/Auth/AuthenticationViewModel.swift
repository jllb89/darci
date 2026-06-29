import Combine
import Foundation

struct AuthenticationChallenge: Equatable {
    let method: AuthIdentifierMethod
    let identifier: String
    let otpLength: Int
    let resendCooldownSeconds: Int?
}

enum AuthenticationVerificationRoute: Equatable {
    case completeProfile
    case success
}

@MainActor
final class AuthenticationViewModel: ObservableObject {
    @Published private(set) var challenge: AuthenticationChallenge?
    @Published private(set) var verifiedSession: AuthSession?
    @Published private(set) var isRequestingOTP = false
    @Published private(set) var isVerifyingOTP = false
    @Published private(set) var isCompletingProfile = false
    @Published private(set) var fieldError: String?
    @Published private(set) var globalError: String?
    @Published private(set) var resendCooldownSeconds: Int?

    private let apiClient: AuthAPIProviding
    private let sessionStore: AuthSessionStore
    private let defaultOTPLength: Int

    init(
        apiClient: AuthAPIProviding = AuthAPIClient(),
        sessionStore: AuthSessionStore = KeychainAuthSessionStore(),
        defaultOTPLength: Int = 8
    ) {
        self.apiClient = apiClient
        self.sessionStore = sessionStore
        self.defaultOTPLength = defaultOTPLength
    }

    var isBusy: Bool {
        isRequestingOTP || isVerifyingOTP || isCompletingProfile
    }

    var feedbackMessage: String? {
        fieldError ?? globalError
    }

    var verifiedContactMethod: AuthIdentifierMethod? {
        challenge?.method
    }

    var verifiedEmailAddress: String {
        if challenge?.method == .email {
            return challenge?.identifier ?? ""
        }

        return verifiedSession?.user.email ?? ""
    }

    var verifiedPhoneNumber: String {
        if challenge?.method == .phone {
            return challenge?.identifier ?? ""
        }

        return verifiedSession?.user.phone ?? ""
    }

    @discardableResult
    func requestOTP(method: AuthIdentifierMethod, rawIdentifier: String, returnTo: String? = nil) async -> Bool {
        guard isRequestingOTP == false else { return false }

        clearErrors()
        verifiedSession = nil

        guard let identifier = normalizedIdentifier(for: method, rawValue: rawIdentifier) else {
            fieldError = validationMessage(for: method)
            return false
        }

        isRequestingOTP = true
        defer { isRequestingOTP = false }

        do {
            let response: AuthOTPStartResponse
            switch method {
            case .email:
                response = try await apiClient.requestEmailOTP(email: identifier, returnTo: returnTo)
            case .phone:
                response = try await apiClient.requestPhoneOTP(phone: identifier, returnTo: returnTo)
            }

            let otpLength = normalizedOTPLength(response.otpLength)
            challenge = AuthenticationChallenge(
                method: method,
                identifier: identifier,
                otpLength: otpLength,
                resendCooldownSeconds: response.cooldownSeconds
            )
            resendCooldownSeconds = response.cooldownSeconds
            return true
        } catch {
            apply(error: error, wrongCodeIsFieldError: false)
            return false
        }
    }

    @discardableResult
    func verifyOTP(token: String, returnTo: String? = nil) async -> AuthenticationVerificationRoute? {
        guard isVerifyingOTP == false else { return nil }

        clearErrors()

        guard let challenge else {
            globalError = "Start by requesting a verification code."
            return nil
        }

        let sanitizedToken = String(token.filter(\.isNumber))
        guard sanitizedToken.count >= challenge.otpLength else {
            fieldError = "Enter the full verification code."
            return nil
        }

        isVerifyingOTP = true
        defer { isVerifyingOTP = false }

        do {
            let response: AuthVerifyResponse
            switch challenge.method {
            case .email:
                response = try await apiClient.verifyEmailOTP(
                    email: challenge.identifier,
                    token: sanitizedToken,
                    returnTo: returnTo
                )
            case .phone:
                response = try await apiClient.verifyPhoneOTP(
                    phone: challenge.identifier,
                    token: sanitizedToken,
                    returnTo: returnTo
                )
            }

            try save(session: response.session)
            return response.profileCompletionRequired ? .completeProfile : .success
        } catch {
            apply(error: error, wrongCodeIsFieldError: true)
            return nil
        }
    }

    @discardableResult
    func completeProfile(firstName: String, lastName: String, email: String, phone: String) async -> Bool {
        guard isCompletingProfile == false else { return false }

        clearErrors()

        guard let verifiedSession else {
            globalError = "Verify a code before completing your profile."
            return false
        }

        guard let request = makeProfileCompletionRequest(
            firstName: firstName,
            lastName: lastName,
            email: email,
            phone: phone
        ) else {
            return false
        }

        isCompletingProfile = true
        defer { isCompletingProfile = false }

        do {
            let response = try await completeProfile(request, using: verifiedSession)
            try save(
                session: AuthSession(
                    accessToken: verifiedSession.accessToken,
                    refreshToken: verifiedSession.refreshToken,
                    user: response.user
                )
            )
            return true
        } catch AuthAPIError.unauthorized {
            return await refreshThenCompleteProfile(request, currentSession: verifiedSession)
        } catch {
            apply(error: error, wrongCodeIsFieldError: false)
            return false
        }
    }

    func clearErrors() {
        fieldError = nil
        globalError = nil
    }

    func clearChallenge() {
        challenge = nil
        verifiedSession = nil
        resendCooldownSeconds = nil
        clearErrors()
    }

    private func makeProfileCompletionRequest(
        firstName: String,
        lastName: String,
        email: String,
        phone: String
    ) -> AuthProfileCompletionRequest? {
        let trimmedFirstName = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedLastName = lastName.trimmingCharacters(in: .whitespacesAndNewlines)

        guard trimmedFirstName.isEmpty == false,
              trimmedLastName.isEmpty == false else {
            fieldError = "Enter your first and last name."
            return nil
        }

        let resolvedEmail: String?
        let resolvedPhone: String?

        switch verifiedContactMethod {
        case .email:
            resolvedEmail = verifiedEmailAddress
            resolvedPhone = normalizedUSPhone(phone)
        case .phone:
            resolvedEmail = normalizedEmail(email)
            resolvedPhone = verifiedPhoneNumber
        case nil:
            resolvedEmail = normalizedEmail(email)
            resolvedPhone = normalizedUSPhone(phone)
        }

        guard let resolvedEmail else {
            fieldError = "Enter a valid email address."
            return nil
        }

        guard let resolvedPhone else {
            fieldError = "Enter a valid US phone number."
            return nil
        }

        return AuthProfileCompletionRequest(
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
            email: resolvedEmail,
            phone: resolvedPhone
        )
    }

    private func completeProfile(
        _ request: AuthProfileCompletionRequest,
        using session: AuthSession
    ) async throws -> AuthUserResponse {
        try await apiClient.completeProfile(request, accessToken: session.accessToken)
    }

    private func refreshThenCompleteProfile(
        _ request: AuthProfileCompletionRequest,
        currentSession: AuthSession
    ) async -> Bool {
        do {
            let refreshResponse = try await apiClient.refresh(refreshToken: currentSession.refreshToken)
            try save(session: refreshResponse.session)

            let profileResponse = try await completeProfile(request, using: refreshResponse.session)
            try save(
                session: AuthSession(
                    accessToken: refreshResponse.accessToken,
                    refreshToken: refreshResponse.refreshToken,
                    user: profileResponse.user
                )
            )
            return true
        } catch {
            apply(error: error, wrongCodeIsFieldError: false)
            return false
        }
    }

    private func save(session: AuthSession) throws {
        try sessionStore.save(session)
        verifiedSession = session
    }

    private func normalizedIdentifier(for method: AuthIdentifierMethod, rawValue: String) -> String? {
        switch method {
        case .email:
            return normalizedEmail(rawValue)
        case .phone:
            return normalizedUSPhone(rawValue)
        }
    }

    private func normalizedEmail(_ rawValue: String) -> String? {
        let email = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let parts = email.split(separator: "@", omittingEmptySubsequences: false)

        guard parts.count == 2,
              parts[0].isEmpty == false,
              parts[1].contains("."),
              parts[1].hasSuffix(".") == false else {
            return nil
        }

        return email
    }

    private func normalizedUSPhone(_ rawValue: String) -> String? {
        let digits = rawValue.filter(\.isNumber)

        if digits.count == 10 {
            return "+1\(digits)"
        }

        if digits.count == 11, digits.first == "1" {
            return "+\(digits)"
        }

        return nil
    }

    private func validationMessage(for method: AuthIdentifierMethod) -> String {
        switch method {
        case .email:
            return "Enter a valid email address."
        case .phone:
            return "Enter a valid US phone number."
        }
    }

    private func normalizedOTPLength(_ value: Int?) -> Int {
        max(1, value ?? defaultOTPLength)
    }

    private func apply(error: Error, wrongCodeIsFieldError: Bool) {
        if let authError = error as? AuthAPIError {
            apply(authError: authError, wrongCodeIsFieldError: wrongCodeIsFieldError)
            return
        }

        if error is URLError {
            globalError = "We couldn't reach DARCi. Check your connection and try again."
            return
        }

        globalError = "Something went wrong. Try again."
    }

    private func apply(authError: AuthAPIError, wrongCodeIsFieldError: Bool) {
        switch authError {
        case .wrongCode(let message):
            let resolvedMessage = message ?? "Wrong code. Check the code and try again."
            if wrongCodeIsFieldError {
                fieldError = resolvedMessage
            } else {
                globalError = resolvedMessage
            }
        case .validation(let message):
            fieldError = message ?? "Check the information and try again."
        case .rateLimited(let message):
            globalError = message ?? "Too many attempts. Try again shortly."
        case .unauthorized(let message):
            globalError = message ?? "Your session could not be verified. Try again."
        case .server(_, let message):
            globalError = message ?? "DARCi is having trouble right now. Try again."
        case .invalidURL, .invalidResponse, .emptyResponse, .unexpectedStatus:
            globalError = "Something went wrong. Try again."
        }
    }
}