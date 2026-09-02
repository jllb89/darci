import Foundation

enum AuthAPIError: Error, Equatable {
    case invalidURL(path: String)
    case invalidResponse
    case emptyResponse(statusCode: Int)
    case wrongCode(message: String?)
    case unauthorized(message: String?)
    case validation(message: String?)
    case rateLimited(message: String?)
    case server(statusCode: Int, message: String?)
    case unexpectedStatus(statusCode: Int, message: String?)
}

protocol AuthAPIProviding: Sendable {
    func requestEmailOTP(email: String, returnTo: String?) async throws -> AuthOTPStartResponse
    func requestPhoneOTP(phone: String, returnTo: String?) async throws -> AuthOTPStartResponse
    func verifyEmailOTP(email: String, token: String, returnTo: String?) async throws -> AuthVerifyResponse
    func verifyPhoneOTP(phone: String, token: String, returnTo: String?) async throws -> AuthVerifyResponse
    func refresh(refreshToken: String) async throws -> AuthRefreshResponse
    func logout(refreshToken: String, accessToken: String) async throws
    func completeProfile(_ profile: AuthProfileCompletionRequest, accessToken: String) async throws -> AuthUserResponse
    func updatePersonalInfo(_ profile: AuthPersonalInfoUpdateRequest, accessToken: String) async throws -> AuthUserResponse
    func resetPassword(_ password: String, refreshToken: String, accessToken: String) async throws -> AuthRefreshResponse
    func switchActiveRole(_ role: String, accessToken: String) async throws -> AuthUserResponse
    func deleteAccount(accessToken: String) async throws -> AuthDeleteAccountResponse
}

struct AuthAPIClient: Sendable {
    let config: AuthConfig

    private let urlSession: URLSession
    private let jsonEncoder: JSONEncoder
    private let jsonDecoder: JSONDecoder

    init(
        config: AuthConfig = .current(),
        urlSession: URLSession = .shared,
        jsonEncoder: JSONEncoder = JSONEncoder(),
        jsonDecoder: JSONDecoder = JSONDecoder()
    ) {
        self.config = config
        self.urlSession = urlSession
        self.jsonEncoder = jsonEncoder
        self.jsonDecoder = jsonDecoder
    }

    func requestEmailOTP(email: String, returnTo: String? = nil) async throws -> AuthOTPStartResponse {
        try await send(
            path: "/auth/otp/start",
            body: AuthEmailOTPStartRequest(email: email, returnTo: returnTo)
        )
    }

    func requestPhoneOTP(phone: String, returnTo: String? = nil) async throws -> AuthOTPStartResponse {
        try await send(
            path: "/auth/otp/phone/start",
            body: AuthPhoneOTPStartRequest(phone: phone, returnTo: returnTo)
        )
    }

    func verifyEmailOTP(email: String, token: String, returnTo: String? = nil) async throws -> AuthVerifyResponse {
        try await send(
            path: "/auth/otp/verify",
            body: AuthEmailOTPVerifyRequest(email: email, token: token, returnTo: returnTo)
        )
    }

    func verifyPhoneOTP(phone: String, token: String, returnTo: String? = nil) async throws -> AuthVerifyResponse {
        try await send(
            path: "/auth/otp/phone/verify",
            body: AuthPhoneOTPVerifyRequest(phone: phone, token: token, returnTo: returnTo)
        )
    }

    func refresh(refreshToken: String) async throws -> AuthRefreshResponse {
        try await send(
            path: "/auth/refresh",
            body: AuthRefreshRequest(refreshToken: refreshToken)
        )
    }

    func logout(refreshToken: String, accessToken: String) async throws {
        let request = try makeJSONRequest(
            path: "/auth/logout",
            body: AuthLogoutRequest(refreshToken: refreshToken),
            accessToken: accessToken
        )
        var statusCode: Int?
        do {
            let (data, response) = try await urlSession.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw AuthAPIError.invalidResponse
            }
            statusCode = httpResponse.statusCode

            if httpResponse.statusCode == 401 {
                return
            }

            try validateEmptyResponse(data: data, response: response)
        } catch {
            reportFailure(error, for: request, statusCode: statusCode)
            throw error
        }
    }

    func completeProfile(_ profile: AuthProfileCompletionRequest, accessToken: String) async throws -> AuthUserResponse {
        try await send(
            path: "/users/me",
            method: "PATCH",
            body: profile,
            accessToken: accessToken
        )
    }

    func updatePersonalInfo(_ profile: AuthPersonalInfoUpdateRequest, accessToken: String) async throws -> AuthUserResponse {
        try await send(
            path: "/users/me",
            method: "PATCH",
            body: profile,
            accessToken: accessToken
        )
    }

    func resetPassword(_ password: String, refreshToken: String, accessToken: String) async throws -> AuthRefreshResponse {
        try await send(
            path: "/auth/password/reset",
            body: AuthPasswordResetRequest(refreshToken: refreshToken, password: password),
            accessToken: accessToken
        )
    }

    func switchActiveRole(_ role: String, accessToken: String) async throws -> AuthUserResponse {
        try await send(
            path: "/users/me/active-role",
            method: "PATCH",
            body: AuthActiveRoleRequest(role: role),
            accessToken: accessToken
        )
    }

    func deleteAccount(accessToken: String) async throws -> AuthDeleteAccountResponse {
        try await delete(path: "/users/me", accessToken: accessToken)
    }

    func checkHealth() async throws {
        let request = try makeRequest(path: "/health", method: "GET")
        try await performEmptyRequest(request)
    }

    func get<Response: Decodable>(
        path: String,
        queryItems: [URLQueryItem] = [],
        accessToken: String? = nil
    ) async throws -> Response {
        let request = try makeRequest(path: path, method: "GET", queryItems: queryItems, accessToken: accessToken)
        return try await performDecodedRequest(request)
    }

    func post<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        accessToken: String? = nil
    ) async throws -> Response {
        try await send(path: path, body: body, accessToken: accessToken)
    }

    func put<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        accessToken: String? = nil
    ) async throws -> Response {
        try await send(path: path, method: "PUT", body: body, accessToken: accessToken)
    }

    func patch<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        accessToken: String? = nil
    ) async throws -> Response {
        try await send(path: path, method: "PATCH", body: body, accessToken: accessToken)
    }

    func delete<Response: Decodable>(
        path: String,
        accessToken: String? = nil
    ) async throws -> Response {
        let request = try makeRequest(path: path, method: "DELETE", accessToken: accessToken)
        return try await performDecodedRequest(request)
    }

    func makeRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = [],
        accessToken: String? = nil
    ) throws -> URLRequest {
        let url = try makeURL(path: path, queryItems: queryItems)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")

        if let accessToken, accessToken.isEmpty == false {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        return request
    }

    func makeJSONRequest<Body: Encodable>(
        path: String,
        method: String = "POST",
        queryItems: [URLQueryItem] = [],
        body: Body,
        accessToken: String? = nil
    ) throws -> URLRequest {
        var request = try makeRequest(path: path, method: method, queryItems: queryItems, accessToken: accessToken)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try jsonEncoder.encode(body)
        return request
    }

    private func send<Response: Decodable, Body: Encodable>(
        path: String,
        method: String = "POST",
        body: Body,
        accessToken: String? = nil
    ) async throws -> Response {
        let request = try makeJSONRequest(path: path, method: method, body: body, accessToken: accessToken)
        return try await performDecodedRequest(request)
    }

    private func performDecodedRequest<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        var statusCode: Int?
        do {
            let (data, response) = try await urlSession.data(for: request)
            statusCode = (response as? HTTPURLResponse)?.statusCode
            return try decode(data: data, response: response)
        } catch {
            reportFailure(error, for: request, statusCode: statusCode)
            throw error
        }
    }

    private func performEmptyRequest(_ request: URLRequest) async throws {
        var statusCode: Int?
        do {
            let (data, response) = try await urlSession.data(for: request)
            statusCode = (response as? HTTPURLResponse)?.statusCode
            try validateEmptyResponse(data: data, response: response)
        } catch {
            reportFailure(error, for: request, statusCode: statusCode)
            throw error
        }
    }

    private func reportFailure(_ error: Error, for request: URLRequest, statusCode: Int?) {
        let path = request.url?.path ?? ""
        let hasAccessCredential = request.value(forHTTPHeaderField: "Authorization") != nil
        guard path.contains("/auth/") || hasAccessCredential else {
            return
        }

        MobileAuthTelemetry.reportRequestFailure(
            operation: telemetryOperation(for: path, hasAccessCredential: hasAccessCredential),
            error: error,
            requestID: request.value(forHTTPHeaderField: "X-Request-Id"),
            statusCode: statusCode
        )
    }

    private func telemetryOperation(for path: String, hasAccessCredential: Bool) -> String {
        if path.hasSuffix("/auth/otp/phone/start") { return "phone_otp_start" }
        if path.hasSuffix("/auth/otp/phone/verify") { return "phone_otp_verify" }
        if path.hasSuffix("/auth/otp/start") { return "email_otp_start" }
        if path.hasSuffix("/auth/otp/verify") { return "email_otp_verify" }
        if path.hasSuffix("/auth/refresh") { return "session_refresh" }
        if path.hasSuffix("/auth/logout") { return "logout" }
        if path.hasSuffix("/auth/password/reset") { return "password_reset" }
        return hasAccessCredential ? "authenticated_request" : "auth_request"
    }

    private func makeURL(path: String, queryItems: [URLQueryItem] = []) throws -> URL {
        var components = URLComponents(url: config.apiBaseURL, resolvingAgainstBaseURL: false)
        let basePath = components?.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
        let endpointPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components?.path = "/" + [basePath, endpointPath]
            .filter { $0.isEmpty == false }
            .joined(separator: "/")
        if queryItems.isEmpty == false {
            components?.queryItems = queryItems
        }

        guard let url = components?.url else {
            throw AuthAPIError.invalidURL(path: path)
        }

        return url
    }

    private func decode<Response: Decodable>(data: Data, response: URLResponse) throws -> Response {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw mapError(statusCode: httpResponse.statusCode, data: data)
        }

        guard data.isEmpty == false else {
            throw AuthAPIError.emptyResponse(statusCode: httpResponse.statusCode)
        }

        return try jsonDecoder.decode(Response.self, from: data)
    }

    private func validateEmptyResponse(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw mapError(statusCode: httpResponse.statusCode, data: data)
        }
    }

    private func mapError(statusCode: Int, data: Data) -> AuthAPIError {
        let payload = try? jsonDecoder.decode(AuthErrorResponse.self, from: data)
        let message = errorMessage(from: payload)
        let error = payload?.error

        switch statusCode {
        case 400:
            return .validation(message: message)
        case 401:
            if isWrongCodeError(error: error, message: message) {
                return .wrongCode(message: message)
            }
            return .unauthorized(message: message)
        case 429:
            return .rateLimited(message: message)
        case 500...599:
            return .server(statusCode: statusCode, message: message)
        default:
            return .unexpectedStatus(statusCode: statusCode, message: message)
        }
    }

    private func errorMessage(from payload: AuthErrorResponse?) -> String? {
        let summary = payload?.message?.trimmingCharacters(in: .whitespacesAndNewlines)
        let details = payload?.errors?
            .compactMap { $0.message?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false } ?? []

        guard details.isEmpty == false else {
            return summary?.isEmpty == false ? summary : nil
        }

        let detailText = Array(NSOrderedSet(array: details)).compactMap { $0 as? String }.joined(separator: "\n")
        guard let summary, summary.isEmpty == false, summary != "Member form validation failed" else {
            return detailText
        }

        return "\(summary)\n\(detailText)"
    }

    private func isWrongCodeError(error: String?, message: String?) -> Bool {
        let combined = [error, message]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")

        return combined.contains("otp") || combined.contains("code") || combined.contains("token")
    }
}

extension AuthAPIClient: AuthAPIProviding {}
