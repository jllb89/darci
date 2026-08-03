import XCTest
@testable import DARCiMobile

#if canImport(UIKit)
import UIKit
#endif

final class AuthURLProtocolStub: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let requestHandler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try requestHandler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

struct TestAuthAPIClient: AuthAPIProviding {
    var otpStartResponse = AuthOTPStartResponse(status: "ok", message: "Code sent", otpLength: 8, cooldownSeconds: 60)
    var verifyResponse: AuthVerifyResponse = AuthVerifyResponse(
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: AuthenticatedUser(
            id: "user-1",
            email: "member@example.com",
            phone: "+15555550123",
            role: "member",
            availableRoles: ["member"],
            status: "active",
            firstName: nil,
            lastName: nil,
            emailConfirmedAt: "2026-06-26T00:00:00.000Z",
            phoneConfirmedAt: nil,
            lastSignInAt: "2026-06-26T00:00:00.000Z",
            lastAuthSyncedAt: "2026-06-26T00:00:00.000Z"
        ),
        profileCompletionRequired: true
    )
    var otpStartError: Error?
    var verifyError: Error?
    var refreshResponse: AuthRefreshResponse = AuthRefreshResponse(
        accessToken: "refreshed-access-token",
        refreshToken: "refreshed-refresh-token",
        user: AuthenticatedUser(
            id: "user-1",
            email: "member@example.com",
            phone: "+15555550123",
            role: "member",
            availableRoles: ["member"],
            status: "active",
            firstName: nil,
            lastName: nil,
            emailConfirmedAt: "2026-06-26T00:00:00.000Z",
            phoneConfirmedAt: nil,
            lastSignInAt: "2026-06-26T00:00:00.000Z",
            lastAuthSyncedAt: "2026-06-26T00:00:00.000Z"
        )
    )
    var profileResponse: AuthUserResponse = AuthUserResponse(
        user: AuthenticatedUser(
            id: "user-1",
            email: "member@example.com",
            phone: "+15555550123",
            role: "member",
            availableRoles: ["member"],
            status: "active",
            firstName: "Ada",
            lastName: "Lovelace",
            emailConfirmedAt: "2026-06-26T00:00:00.000Z",
            phoneConfirmedAt: nil,
            lastSignInAt: "2026-06-26T00:00:00.000Z",
            lastAuthSyncedAt: "2026-06-26T00:00:00.000Z"
        )
    )
    var refreshError: Error?
    var profileErrors: [Error] = []

    nonisolated(unsafe) static var requestedEmail: String?
    nonisolated(unsafe) static var requestedPhone: String?
    nonisolated(unsafe) static var verifiedEmail: String?
    nonisolated(unsafe) static var verifiedPhone: String?
    nonisolated(unsafe) static var verifiedToken: String?
    nonisolated(unsafe) static var refreshedToken: String?
    nonisolated(unsafe) static var completedProfiles: [AuthProfileCompletionRequest] = []
    nonisolated(unsafe) static var profileAccessTokens: [String] = []

    static func reset() {
        requestedEmail = nil
        requestedPhone = nil
        verifiedEmail = nil
        verifiedPhone = nil
        verifiedToken = nil
        refreshedToken = nil
        completedProfiles = []
        profileAccessTokens = []
    }

    func requestEmailOTP(email: String, returnTo: String?) async throws -> AuthOTPStartResponse {
        Self.requestedEmail = email
        if let otpStartError { throw otpStartError }
        return otpStartResponse
    }

    func requestPhoneOTP(phone: String, returnTo: String?) async throws -> AuthOTPStartResponse {
        Self.requestedPhone = phone
        if let otpStartError { throw otpStartError }
        return otpStartResponse
    }

    func verifyEmailOTP(email: String, token: String, returnTo: String?) async throws -> AuthVerifyResponse {
        Self.verifiedEmail = email
        Self.verifiedToken = token
        if let verifyError { throw verifyError }
        return verifyResponse
    }

    func verifyPhoneOTP(phone: String, token: String, returnTo: String?) async throws -> AuthVerifyResponse {
        Self.verifiedPhone = phone
        Self.verifiedToken = token
        if let verifyError { throw verifyError }
        return verifyResponse
    }

    func refresh(refreshToken: String) async throws -> AuthRefreshResponse {
        Self.refreshedToken = refreshToken
        if let refreshError { throw refreshError }
        return refreshResponse
    }

    func logout(refreshToken: String, accessToken: String) async throws {}

    func completeProfile(_ profile: AuthProfileCompletionRequest, accessToken: String) async throws -> AuthUserResponse {
        Self.completedProfiles.append(profile)
        Self.profileAccessTokens.append(accessToken)

        if let error = profileErrors.dropFirst(Self.completedProfiles.count - 1).first {
            throw error
        }

        return profileResponse
    }

    func updatePersonalInfo(_ profile: AuthPersonalInfoUpdateRequest, accessToken: String) async throws -> AuthUserResponse {
        profileResponse
    }

    func resetPassword(_ password: String, refreshToken: String, accessToken: String) async throws -> AuthRefreshResponse {
        refreshResponse
    }

    func switchActiveRole(_ role: String, accessToken: String) async throws -> AuthUserResponse {
        profileResponse
    }
}

extension NotaryProfileAPIProviding {
    func resolveNotaryRequest(idn: String, accessToken: String) async throws -> NotaryIdnResolveResponse {
        throw URLError(.unsupportedURL)
    }

    func getIdentityDocumentSchema(documentType: String, accessToken: String) async throws -> NotaryIdentityDocumentSchemaResponse {
        throw URLError(.unsupportedURL)
    }

    func startInPersonSession(requestId: String, request: NotarySessionStartRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func recordNotaryCheckIn(requestId: String, request: NotaryMeetingCheckInRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func recordProximityEvaluation(requestId: String, request: NotaryProximityEvaluationRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func recordIdentityVerification(requestId: String, request: NotaryIdentityVerificationRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func reverseGeocodeVenue(requestId: String, request: NotaryReverseGeocodeRequest, accessToken: String) async throws -> NotaryReverseGeocodeResponse {
        throw URLError(.unsupportedURL)
    }

    func recordVenue(requestId: String, request: NotaryVenueCaptureRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func signAcknowledgment(requestId: String, request: NotarySignRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func advanceSession(requestId: String, request: NotarySessionAdvanceRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func submitFinalPackage(requestId: String, request: NotaryFinalPackageSubmitRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw URLError(.unsupportedURL)
    }

    func getMyNotaryProfile(accessToken: String) async throws -> MyNotaryProfileResponse {
        throw URLError(.unsupportedURL)
    }

    func updateMyNotaryProfile(_ request: NotaryProfileUpdateRequest, accessToken: String) async throws -> MyNotaryProfileResponse {
        throw URLError(.unsupportedURL)
    }

    func listNotaryProfileJurisdictions(accessToken: String) async throws -> MemberFormJurisdictionsResponse {
        throw URLError(.unsupportedURL)
    }

    func listServiceAreas(jurisdiction: String, accessToken: String) async throws -> NotaryServiceAreasResponse {
        throw URLError(.unsupportedURL)
    }
}

struct FailingNotaryProfileAPIClient: NotaryProfileAPIProviding {
    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse {
        throw URLError(.notConnectedToInternet)
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        throw URLError(.notConnectedToInternet)
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        throw URLError(.notConnectedToInternet)
    }
}

actor TestNotaryProfileCacheStore: NotaryProfileCacheStoring {
    private let entry: NotaryProfileCacheEntry?

    init(entry: NotaryProfileCacheEntry?) {
        self.entry = entry
    }

    func read(cacheKey: NotaryProfileCacheKey) async -> NotaryProfileCacheEntry? {
        entry
    }

    func write(_ response: NotaryQueueResponse, cacheKey: NotaryProfileCacheKey) async {}
}

actor PagingNotaryProfileAPIClient: NotaryProfileAPIProviding {
    private let responsesByOffset: [Int: NotaryQueueResponse]
    private var calls: [String] = []

    init(responsesByOffset: [Int: NotaryQueueResponse]) {
        self.responsesByOffset = responsesByOffset
    }

    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse {
        calls.append("\(limit):\(offset)")
        return responsesByOffset[offset] ?? .empty
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        NotaryRequestContextResponse(context: nil)
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        NotaryReviewDecisionResponse(message: nil)
    }

    func recordedCalls() -> [String] {
        calls
    }
}

actor SequentialNotaryProfileAPIClient: NotaryProfileAPIProviding {
    private var responses: [NotaryQueueResponse]

    init(responses: [NotaryQueueResponse]) {
        self.responses = responses
    }

    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse {
        guard responses.isEmpty == false else { return .empty }
        return responses.removeFirst()
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        NotaryRequestContextResponse(context: nil)
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        NotaryReviewDecisionResponse(message: nil)
    }
}

actor OpeningNotaryReviewAPIClient: NotaryProfileAPIProviding {
    private let initialContext: NotaryRequestReviewContext
    private let resolvedContext: NotaryRequestReviewContext
    private var resolvedIdns: [String] = []

    init(initialContext: NotaryRequestReviewContext, resolvedContext: NotaryRequestReviewContext) {
        self.initialContext = initialContext
        self.resolvedContext = resolvedContext
    }

    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse {
        .empty
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        NotaryRequestContextResponse(context: initialContext)
    }

    func resolveNotaryRequest(idn: String, accessToken: String) async throws -> NotaryIdnResolveResponse {
        resolvedIdns.append(idn)
        return NotaryIdnResolveResponse(requestId: resolvedContext.request.id, context: resolvedContext)
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        NotaryReviewDecisionResponse(message: nil)
    }

    func recordedResolvedIdns() -> [String] {
        resolvedIdns
    }
}

actor RecoveringNotarySessionAPIClient: NotaryProfileAPIProviding {
    private let contexts: [NotaryRequestReviewContext]
    private var contextIndex = 0

    init(contexts: [NotaryRequestReviewContext]) {
        self.contexts = contexts
    }

    func listNotaryRequests(limit: Int, offset: Int, accessToken: String) async throws -> NotaryQueueResponse {
        .empty
    }

    func getNotaryRequestContext(requestId: String, accessToken: String) async throws -> NotaryRequestContextResponse {
        let index = min(contextIndex, max(contexts.count - 1, 0))
        contextIndex += 1
        return NotaryRequestContextResponse(context: contexts[index])
    }

    func submitReviewDecision(requestId: String, request: NotaryReviewDecisionRequest, accessToken: String) async throws -> NotaryReviewDecisionResponse {
        NotaryReviewDecisionResponse(message: nil)
    }

    func getMyNotaryProfile(accessToken: String) async throws -> MyNotaryProfileResponse {
        MyNotaryProfileResponse(profile: nil)
    }

    func advanceSession(requestId: String, request: NotarySessionAdvanceRequest, accessToken: String) async throws -> NotarySessionActionResponse {
        throw AuthAPIError.unexpectedStatus(statusCode: 409, message: "Ledger provider unavailable")
    }

    func recordedContextCallCount() -> Int {
        contextIndex
    }
}

@MainActor
final class TestNotarySessionRealtimeClient: NotarySessionRealtimeProviding {
    private(set) var startedRequestId: String?
    private(set) var startedAccessToken: String?
    private(set) var stopCallCount = 0
    private var onStateChange: (@MainActor @Sendable (NotarySessionRealtimeState) -> Void)?
    private var onInvalidate: (@MainActor @Sendable () async -> Void)?

    func start(
        requestId: String,
        accessToken: String,
        onStateChange: @escaping @MainActor @Sendable (NotarySessionRealtimeState) -> Void,
        onInvalidate: @escaping @MainActor @Sendable () async -> Void
    ) {
        startedRequestId = requestId
        startedAccessToken = accessToken
        self.onStateChange = onStateChange
        self.onInvalidate = onInvalidate
        onStateChange(.connecting)
    }

    func stop() {
        stopCallCount += 1
        onStateChange?(.idle)
        onStateChange = nil
        onInvalidate = nil
    }

    func emitState(_ state: NotarySessionRealtimeState) {
        onStateChange?(state)
    }

    func emitInvalidation() async {
        await onInvalidate?()
    }
}

@MainActor
final class TestNotaryQueueRealtimeClient: NotaryQueueRealtimeProviding {
    private(set) var startedQueueUserId: String?
    private(set) var startedAccessToken: String?
    private(set) var stopCallCount = 0
    private var onStateChange: (@MainActor @Sendable (NotarySessionRealtimeState) -> Void)?
    private var onInvalidate: (@MainActor @Sendable () async -> Void)?

    func start(
        queueUserId: String,
        accessToken: String,
        onStateChange: @escaping @MainActor @Sendable (NotarySessionRealtimeState) -> Void,
        onInvalidate: @escaping @MainActor @Sendable () async -> Void
    ) {
        startedQueueUserId = queueUserId
        startedAccessToken = accessToken
        self.onStateChange = onStateChange
        self.onInvalidate = onInvalidate
        onStateChange(.connecting)
    }

    func stop() {
        stopCallCount += 1
        onStateChange?(.idle)
        onStateChange = nil
        onInvalidate = nil
    }

    func emitState(_ state: NotarySessionRealtimeState) {
        onStateChange?(state)
    }

    func emitInvalidation() async {
        await onInvalidate?()
    }
}

final class DARCiMobileTests: XCTestCase {
    func testLaunchStartsAtOnboarding() {
        XCTAssertEqual(AppLaunchPhase.initial, .onboarding)
    }

    func testOnboardingSplashContentIsStable() {
        XCTAssertEqual(OnboardingScreenContent.splash.brand, "DARCi")
        XCTAssertEqual(
            OnboardingScreenContent.splash.headline,
            "Illuminotarization\nthat keeps up with your workflow."
        )
        XCTAssertEqual(
            OnboardingScreenContent.splash.accessibilityHeadline,
            "Illuminotarization that keeps up with your workflow."
        )
        XCTAssertEqual(OnboardingScreenContent.splash.ctaTitle, "Start")
    }

    func testAuthenticationSignInContentIsStable() {
        XCTAssertEqual(AuthenticationSignInContent.signIn.brand, "DARCi")
        XCTAssertEqual(AuthenticationSignInContent.signIn.headline, "Welcome\nSign in")
        XCTAssertEqual(AuthenticationSignInContent.signIn.accessibilityHeadline, "Welcome Sign in")
        XCTAssertEqual(AuthenticationSignInContent.signIn.supportingText, "To access the app,\ncontinue below.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.accessibilitySupportingText, "To access the app, continue below.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.countryCode, "+1")
        XCTAssertEqual(AuthenticationSignInContent.signIn.phonePlaceholder, "Enter your phone number.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.emailPlaceholder, "Enter your email here")
        XCTAssertEqual(AuthenticationSignInContent.signIn.continueTitle, "Continue")
        XCTAssertEqual(AuthenticationSignInContent.signIn.verifyCodeTitle, "Verify code")
        XCTAssertEqual(AuthenticationSignInContent.signIn.completeInfoTitle, "Please complete the following information:")
        XCTAssertEqual(AuthenticationSignInContent.signIn.nameTitle, "Name")
        XCTAssertEqual(AuthenticationSignInContent.signIn.lastNameTitle, "Last name")
        XCTAssertEqual(AuthenticationSignInContent.signIn.emailFieldTitle, "Email")
        XCTAssertEqual(AuthenticationSignInContent.signIn.phoneNumberTitle, "Phone number")
        XCTAssertEqual(AuthenticationSignInContent.signIn.successTitle, "Welcome to DARCi!")
        XCTAssertEqual(AuthenticationSignInContent.signIn.emailTitle, "Use email instead.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.phoneTitle, "Use phone number instead.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.browseTitle, "I just want to browse the app.")
    }

    func testOnboardingStoriesAreStable() {
        XCTAssertEqual(OnboardingStoryContent.all.count, 4)
        XCTAssertEqual(OnboardingStoryContent.all.map(\.imageName), ["onboarding1", "onboarding2", "onboarding3", "onboarding4"])
        XCTAssertEqual(
            OnboardingStoryContent.all.first?.message,
            "Members get documents notarized in seconds not hours. Notaries handle more work without burning out."
        )
        XCTAssertEqual(
            OnboardingStoryContent.all.map(\.message),
            [
                "Members get documents notarized in seconds not hours. Notaries handle more work without burning out.",
                "Every step meets legal standards. Watermarking, sealing, hashing, and ledger anchoring happen automatically so compliance is never a question.",
                "Watermarking, sealing, hashing, and ledger anchoring happen automatically. Compliance isn't something you chase—it's something you get.",
                "Members complete notarization faster. Notaries handle more volume without exhaustion. The work moves at a pace that feels natural, not rushed."
            ]
        )
    }

    #if canImport(UIKit)
    func testOnboardingBackgroundImageIsBundled() {
        for story in OnboardingStoryContent.all {
            let url = Bundle.main.url(forResource: story.imageName, withExtension: "png")

            XCTAssertNotNil(url)
            XCTAssertNotNil(url.flatMap { UIImage(contentsOfFile: $0.path) })
        }
    }
    #endif

    func testMaisonNeueFontFilesAreKnown() {
        XCTAssertEqual(
            DARCiFont.maisonNeueFontFiles,
            [
                "MaisonNeue-Bold.ttf",
                "MaisonNeue-BoldItalic.ttf",
                "MaisonNeue-Book.ttf",
                "MaisonNeue-BookItalic.ttf",
                "MaisonNeue-Demi.ttf",
                "MaisonNeue-DemiItalic.ttf",
                "MaisonNeue-Light.ttf",
                "MaisonNeue-LightItalic.ttf",
                "MaisonNeue-Medium.ttf",
                "MaisonNeue-MediumItalic.ttf",
                "MaisonNeue-Mono.ttf",
                "MaisonNeue-MonoItalic.ttf"
            ]
        )
    }

    #if canImport(UIKit)
    func testMaisonNeueFontsAreRegistered() {
        for face in DARCiFont.MaisonNeue.allCases {
            XCTAssertNotNil(
                UIFont(name: face.postScriptName, size: 12),
                "Expected \(face.postScriptName) to be registered from app resources."
            )
        }
    }
    #endif

    func testTabConfigurationIsStable() {
        XCTAssertEqual(
            AppTab.allCases.map(\.title),
            ["Home", "Documents", "Generate", "Requests", "Notary"]
        )
    }

    func testProductSectionsAreRepresented() {
        XCTAssertEqual(
            AppSection.allCases.map(\.title),
            [
                "Onboarding",
                "Sign in / up",
                "Home",
                "Documents",
                "Document Generator",
                "Requests",
                "In-person Meeting",
                "Notary Profile"
            ]
        )
    }

    func testAuthConfigUsesEnvironmentBaseURL() {
        let config = AuthConfig.current(
            environment: ["DARCI_API_BASE_URL": "https://staging.example.test/api/"]
        )

        XCTAssertEqual(config.apiBaseURL.absoluteString, "https://staging.example.test/api")
    }

    func testAuthConfigFallsBackToLocalDevelopmentURL() {
        let config = AuthConfig.current(
            bundle: Bundle(for: DARCiMobileTests.self),
            environment: ["DARCI_API_BASE_URL": "$(DARCI_API_BASE_URL)"]
        )

        XCTAssertEqual(config.apiBaseURL, AuthConfig.defaultLocalBaseURL)
    }

    func testAuthAPIClientBuildsJSONRequestWithoutBrowserHeaders() throws {
        let client = AuthAPIClient(config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test/v1/")!))
        let request = try client.makeJSONRequest(
            path: "/auth/otp/start",
            body: AuthEmailOTPStartRequest(email: "member@example.com", returnTo: "darci://auth")
        )

        XCTAssertEqual(request.url?.absoluteString, "https://api.example.test/v1/auth/otp/start")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(request.value(forHTTPHeaderField: "Origin"))
        XCTAssertNil(request.value(forHTTPHeaderField: "X-CSRF-Token"))

        let body = try XCTUnwrap(request.httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as? [String: String]
        XCTAssertEqual(payload?["email"], "member@example.com")
        XCTAssertEqual(payload?["returnTo"], "darci://auth")
    }

    func testAuthAPIClientAddsBearerTokenForProtectedRequests() throws {
        let client = AuthAPIClient(config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!))
        let request = try client.makeJSONRequest(
            path: "/users/me",
            method: "PATCH",
            body: AuthProfileCompletionRequest(
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ada@example.com",
                phone: "+15555550123"
            ),
            accessToken: "access-token"
        )

        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
    }

    func testHomeAPIClientLoadsProductFlowModesWithBearerToken() async throws {
        let urlSession = makeStubbedURLSession { request in
            XCTAssertEqual(request.url?.path, "/rules/product-flow-modes")
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

            return (
                try XCTUnwrap(HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )),
                Data(#"{"modes":[{"modeKey":"poa_only","displayName":"Power of Attorney","description":"Authorize someone you trust.","isActive":true,"sortOrder":10}]}"#.utf8)
            )
        }
        let authClient = AuthAPIClient(
            config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
            urlSession: urlSession
        )
        let client = HomeAPIClient(authClient: authClient)

        let response = try await client.listProductFlowModes(accessToken: "access-token")

        XCTAssertEqual(response.modes?.first?.modeKey, "poa_only")
        XCTAssertEqual(response.modes?.first?.displayName, "Power of Attorney")
    }

    func testNotaryProfileAPIClientLoadsFirstPageWithLimitAndOffset() async throws {
        let urlSession = makeStubbedURLSession { request in
            XCTAssertEqual(request.url?.path, "/notary/requests")
            let queryItems = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems
            XCTAssertEqual(queryItems?.first(where: { $0.name == "limit" })?.value, "20")
            XCTAssertEqual(queryItems?.first(where: { $0.name == "offset" })?.value, "0")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

            return (
                try XCTUnwrap(HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )),
                Data(#"{"requests":[],"meetings":[],"counts":{"pending":0,"scheduled":0,"readyForInPerson":0,"completed":0,"total":0}}"#.utf8)
            )
        }
        let authClient = AuthAPIClient(
            config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
            urlSession: urlSession
        )
        let client = NotaryProfileAPIClient(authClient: authClient)

        let response = try await client.listNotaryRequests(limit: 20, offset: 0, accessToken: "access-token")

        XCTAssertTrue(response.requests.isEmpty)
        XCTAssertEqual(response.counts.total, 0)
    }

    func testNotaryProfileAPIClientResolvesAssignedRequestByIDN() async throws {
        let urlSession = makeStubbedURLSession { request in
            XCTAssertEqual(request.url?.path, "/notary/idn/resolve")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

            let body = try JSONSerialization.jsonObject(with: self.requestBodyData(for: request)) as? [String: Any]
            XCTAssertEqual(body?["idn"] as? String, "IDN-123")

            return (
                try XCTUnwrap(HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )),
                Data(#"{"requestId":"request-1","context":null}"#.utf8)
            )
        }
        let client = NotaryProfileAPIClient(
            authClient: AuthAPIClient(
                config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
                urlSession: urlSession
            )
        )

        let response = try await client.resolveNotaryRequest(idn: "IDN-123", accessToken: "access-token")

        XCTAssertEqual(response.requestId, "request-1")
        XCTAssertNil(response.context)
    }

    func testNotaryProfileAPIClientStartsSessionWithActorCorrectGeolocation() async throws {
        let urlSession = makeStubbedURLSession { request in
            XCTAssertEqual(request.url?.path, "/notary/requests/request-1/meeting/start")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

            let body = try JSONSerialization.jsonObject(with: self.requestBodyData(for: request)) as? [String: Any]
            let geolocation = body?["geolocation"] as? [String: Any]
            XCTAssertEqual(body?["participantRole"] as? String, "notary")
            XCTAssertEqual(body?["recordedAt"] as? String, "2026-07-31T15:00:00Z")
            XCTAssertEqual(geolocation?["latitude"] as? Double, 41.4993)
            XCTAssertEqual(geolocation?["longitude"] as? Double, -81.6944)
            XCTAssertEqual(geolocation?["accuracyMeters"] as? Double, 8)
            XCTAssertEqual(geolocation?["sampleKind"] as? String, "device_gps")
            XCTAssertEqual(geolocation?["captureStage"] as? String, "meeting_start")

            return (
                try XCTUnwrap(HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 201,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )),
                Data(#"{"status":"ok"}"#.utf8)
            )
        }
        let client = NotaryProfileAPIClient(
            authClient: AuthAPIClient(
                config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
                urlSession: urlSession
            )
        )

        let response = try await client.startInPersonSession(
            requestId: "request-1",
            request: NotarySessionStartRequest(
                recordedAt: "2026-07-31T15:00:00Z",
                notes: nil,
                geolocation: NotaryGeolocationPayload(
                    latitude: 41.4993,
                    longitude: -81.6944,
                    accuracyMeters: 8,
                    altitudeMeters: nil,
                    sampleKind: "device_gps",
                    captureStage: "meeting_start"
                )
            ),
            accessToken: "access-token"
        )

        XCTAssertEqual(response.status, "ok")
    }

    func testNotaryInPersonSessionStepFollowsCanonicalEvidenceOrder() {
        XCTAssertEqual(NotaryInPersonSessionViewModel.resolveStep(context: makeNotarySessionContext()), .start)
        XCTAssertEqual(
            NotaryInPersonSessionViewModel.resolveStep(
                context: makeNotarySessionContext(meetingStatus: "in_progress")
            ),
            .samePlace
        )
        XCTAssertEqual(
            NotaryInPersonSessionViewModel.resolveStep(
                context: makeNotarySessionContext(meetingStatus: "in_progress", hasPassedSamePlace: true)
            ),
            .identity
        )
        XCTAssertEqual(
            NotaryInPersonSessionViewModel.resolveStep(
                context: makeNotarySessionContext(
                    meetingStatus: "in_progress",
                    hasPassedSamePlace: true,
                    hasVerifiedIdentity: true
                )
            ),
            .venue
        )
        XCTAssertEqual(
            NotaryInPersonSessionViewModel.resolveStep(
                context: makeNotarySessionContext(
                    meetingStatus: "in_progress",
                    hasPassedSamePlace: true,
                    hasVerifiedIdentity: true,
                    hasVenue: true
                )
            ),
            .seal
        )
        XCTAssertEqual(
            NotaryInPersonSessionViewModel.resolveStep(
                context: makeNotarySessionContext(
                    meetingStatus: "in_progress",
                    hasPassedSamePlace: true,
                    hasVerifiedIdentity: true,
                    hasVenue: true,
                    hasAcknowledgment: true
                )
            ),
            .complete
        )
        XCTAssertEqual(
            NotaryInPersonSessionViewModel.resolveStep(
                context: makeNotarySessionContext(
                    meetingStatus: "completed",
                    hasPassedSamePlace: true,
                    hasVerifiedIdentity: true,
                    hasVenue: true,
                    hasAcknowledgment: true
                )
            ),
            .finalize
        )
        XCTAssertEqual(
            NotaryInPersonSessionViewModel.resolveStep(
                context: makeNotarySessionContext(
                    meetingStatus: "completed",
                    hasPassedSamePlace: true,
                    hasVerifiedIdentity: true,
                    hasVenue: true,
                    hasAcknowledgment: true,
                    isAnchored: true
                )
            ),
            .done
        )
    }

    func testNotaryIdentitySelectContentMatchesWebCatalogs() {
        XCTAssertEqual(NotaryIdentitySelectContent.usStates.count, 51)
        XCTAssertEqual(NotaryIdentitySelectContent.usStates.first, "Alabama")
        XCTAssertEqual(NotaryIdentitySelectContent.usStates.last, "Wyoming")
        XCTAssertTrue(NotaryIdentitySelectContent.countries.contains("United States"))
        XCTAssertTrue(NotaryIdentitySelectContent.countries.contains("Palestine, State of"))
        XCTAssertEqual(NotaryIdentitySelectContent.countries.first, "Afghanistan")
        XCTAssertEqual(NotaryIdentitySelectContent.countries.last, "Zimbabwe")
    }

    @MainActor
    func testNotarySessionRefreshesAfterRecoverableLedgerFailure() async {
        let inProgressContext = makeNotarySessionContext(
            meetingStatus: "in_progress",
            hasPassedSamePlace: true,
            hasVerifiedIdentity: true,
            hasVenue: true,
            hasAcknowledgment: true
        )
        let completedContext = makeNotarySessionContext(
            meetingStatus: "completed",
            hasPassedSamePlace: true,
            hasVerifiedIdentity: true,
            hasVenue: true,
            hasAcknowledgment: true
        )
        let viewModel = NotaryInPersonSessionViewModel(
            requestId: "request-1",
            apiClient: RecoveringNotarySessionAPIClient(contexts: [inProgressContext, completedContext])
        )

        await viewModel.load(session: makeAuthSession())
        XCTAssertEqual(viewModel.step, .complete)

        await viewModel.completeSession(session: makeAuthSession())

        XCTAssertEqual(viewModel.step, .finalize)
        XCTAssertEqual(viewModel.errorMessage, "Ledger provider unavailable")
        viewModel.stop()
    }

    func testSupabaseRealtimeConfigurationUsesInjectedBuildValues() {
        let configuration = DARCiSupabaseConfiguration.current(
            environment: [
                "DARCI_SUPABASE_URL": "https://project-ref.supabase.co/",
                "DARCI_SUPABASE_ANON_KEY": "publishable-key",
            ]
        )

        XCTAssertEqual(configuration?.url.absoluteString, "https://project-ref.supabase.co/")
        XCTAssertEqual(configuration?.anonKey, "publishable-key")
        XCTAssertNil(
            DARCiSupabaseConfiguration.current(
                environment: [
                    "DARCI_SUPABASE_URL": "$(DARCI_SUPABASE_URL)",
                    "DARCI_SUPABASE_ANON_KEY": "$(DARCI_SUPABASE_ANON_KEY)",
                ]
            )
        )
    }

    func testNotaryCommissionParserAcceptsFractionalSecondAPITimestamp() {
        XCTAssertTrue(
            NotaryInPersonSessionViewModel.isCurrentCommission(
                "2093-05-06T23:59:59.999+00:00",
                now: Date(timeIntervalSince1970: 1_786_000_000)
            )
        )
        XCTAssertFalse(
            NotaryInPersonSessionViewModel.isCurrentCommission(
                "2025-05-06T23:59:59.999+00:00",
                now: Date(timeIntervalSince1970: 1_786_000_000)
            )
        )
    }

    @MainActor
    func testNotarySessionRealtimeInvalidationRefetchesCanonicalContext() async {
        let initialContext = makeNotarySessionContext(meetingStatus: "in_progress")
        let updatedContext = makeNotarySessionContext(
            meetingStatus: "in_progress",
            hasPassedSamePlace: true
        )
        let apiClient = RecoveringNotarySessionAPIClient(contexts: [initialContext, updatedContext])
        let realtimeClient = TestNotarySessionRealtimeClient()
        let session = makeAuthSession()
        let viewModel = NotaryInPersonSessionViewModel(
            requestId: "request-1",
            apiClient: apiClient,
            realtimeClient: realtimeClient
        )

        await viewModel.load(session: session)

        XCTAssertEqual(viewModel.step, .samePlace)
        XCTAssertEqual(viewModel.realtimeState, .connecting)
        XCTAssertEqual(realtimeClient.startedRequestId, "request-1")
        XCTAssertEqual(realtimeClient.startedAccessToken, session.accessToken)

        realtimeClient.emitState(.live)
        await realtimeClient.emitInvalidation()

        XCTAssertEqual(viewModel.realtimeState, .live)
        XCTAssertEqual(viewModel.step, .identity)
        let contextCallCount = await apiClient.recordedContextCallCount()
        XCTAssertEqual(contextCallCount, 2)

        viewModel.stop()
        XCTAssertEqual(realtimeClient.stopCallCount, 1)
        XCTAssertEqual(viewModel.realtimeState, .idle)
    }

    @MainActor
    func testNotarySessionForegroundRefreshRecoversMissedRealtimeEvent() async {
        let initialContext = makeNotarySessionContext(meetingStatus: "in_progress")
        let updatedContext = makeNotarySessionContext(
            meetingStatus: "in_progress",
            hasPassedSamePlace: true
        )
        let apiClient = RecoveringNotarySessionAPIClient(contexts: [initialContext, updatedContext])
        let realtimeClient = TestNotarySessionRealtimeClient()
        let session = makeAuthSession()
        let viewModel = NotaryInPersonSessionViewModel(
            requestId: "request-1",
            apiClient: apiClient,
            realtimeClient: realtimeClient
        )

        await viewModel.load(session: session)
        XCTAssertEqual(viewModel.step, .samePlace)

        await viewModel.refreshFromForeground(session: session)

        XCTAssertEqual(viewModel.step, .identity)
        let contextCallCount = await apiClient.recordedContextCallCount()
        XCTAssertEqual(contextCallCount, 2)
    }

    @MainActor
    func testNotaryReviewOpensAssignedPendingRequestBeforeEnablingDecision() async {
        let initialContext = makeNotarySessionContext(
            requestStatus: "code_delivered",
            canReviewRequest: false
        )
        let resolvedContext = makeNotarySessionContext(
            requestStatus: "in_review",
            canReviewRequest: true
        )
        let apiClient = OpeningNotaryReviewAPIClient(
            initialContext: initialContext,
            resolvedContext: resolvedContext
        )
        let viewModel = NotaryRequestReviewViewModel(
            requestId: "request-1",
            apiClient: apiClient
        )

        await viewModel.load(session: makeAuthSession())

        let resolvedIdns = await apiClient.recordedResolvedIdns()
        XCTAssertEqual(resolvedIdns, ["IDN-1"])
        XCTAssertEqual(viewModel.context?.request.queueStatus, "in_review")
        XCTAssertTrue(viewModel.canSubmitDecision)
        XCTAssertNil(viewModel.decisionNotice)
        XCTAssertNil(viewModel.errorMessage)
    }

    @MainActor
    func testNotaryProfileViewModelKeepsCachedRequestsWhenRefreshFails() async throws {
        let cachedResponse = try JSONDecoder().decode(
            NotaryQueueResponse.self,
            from: Data(#"{"requests":[{"request":{"id":"request-1","documentId":"document-1","workflowId":null,"status":"submitted","queueStatus":"submitted","submittedAt":"2026-07-24T12:00:00.000Z"},"document":{"id":"document-1","idn":"IDN-1","status":"pending_notary","documentType":"affidavit","jurisdiction":"US-OH","createdAt":"2026-07-24T12:00:00.000Z","summary":null},"owner":null,"workflow":null,"latestCodeDelivery":null,"meeting":null,"finalization":{"latestStatus":null,"latestStatusAt":null,"isAnchored":false,"isVerificationChecked":false,"isWatermarked":false,"isHashRecorded":false,"verificationStatus":null,"anchoredAt":null,"lastCheckedAt":null,"publicVerifyPath":null},"nextAction":null}],"meetings":[],"counts":{"pending":1,"scheduled":0,"readyForInPerson":0,"completed":0,"total":1}}"#.utf8)
        )
        let cacheStore = TestNotaryProfileCacheStore(
            entry: NotaryProfileCacheEntry(response: cachedResponse)
        )
        let viewModel = NotaryProfileViewModel(
            apiClient: FailingNotaryProfileAPIClient(),
            cacheStore: cacheStore
        )

        await viewModel.load(session: makeAuthSession())

        XCTAssertEqual(viewModel.requests.map(\.id), ["request-1"])
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertFalse(viewModel.isLoading)
    }

    @MainActor
    func testNotaryProfileViewModelRemovesCachedRequestsMissingFromSuccessfulRefresh() async {
        let cachedResponse = makeNotaryQueueResponse(start: 0, count: 1, total: 1)
        let cacheStore = TestNotaryProfileCacheStore(
            entry: NotaryProfileCacheEntry(response: cachedResponse)
        )
        let apiClient = PagingNotaryProfileAPIClient(responsesByOffset: [0: .empty])
        let viewModel = NotaryProfileViewModel(apiClient: apiClient, cacheStore: cacheStore)

        await viewModel.load(session: makeAuthSession())

        XCTAssertTrue(viewModel.requests.isEmpty)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertFalse(viewModel.isLoading)
    }

    @MainActor
    func testNotaryProfileViewModelDoesNotRetainPreviousUsersRequests() async {
        let apiClient = SequentialNotaryProfileAPIClient(
            responses: [makeNotaryQueueResponse(start: 0, count: 1, total: 1), .empty]
        )
        let viewModel = NotaryProfileViewModel(
            apiClient: apiClient,
            cacheStore: TestNotaryProfileCacheStore(entry: nil)
        )

        await viewModel.load(session: makeAuthSession())
        XCTAssertEqual(viewModel.requests.map(\.id), ["request-0"])

        let nextSession = AuthSession(
            accessToken: "next-access-token",
            refreshToken: "next-refresh-token",
            user: makeAuthenticatedUser(id: "user-2", email: "other-notary@example.com")
        )
        await viewModel.load(session: nextSession)

        XCTAssertTrue(viewModel.requests.isEmpty)
        XCTAssertNil(viewModel.errorMessage)
    }

    @MainActor
    func testNotaryProfileViewModelShowsServerAuthorizedRequestWithDatabaseNotaryId() async {
        let baseRequest = makeNotaryQueueResponse(start: 0, count: 1, total: 1).requests[0]
        let assignedRequest = NotaryQueueRequestSummary(
            request: NotaryRequestSummary(
                id: baseRequest.request.id,
                documentId: baseRequest.request.documentId,
                workflowId: baseRequest.request.workflowId,
                status: "in_review",
                queueStatus: "in_review",
                submittedAt: baseRequest.request.submittedAt
            ),
            document: baseRequest.document,
            owner: baseRequest.owner,
            workflow: NotaryWorkflowSummary(
                id: "workflow-1",
                status: "in_review",
                latestStatus: "in_review",
                latestStatusAt: "2026-07-24T12:00:00.000Z",
                reviewStartedAt: nil,
                closedAt: nil,
                selectedNotaryUserId: "database-notary-id",
                assignedNotaryUserId: "database-notary-id",
                lastCodeGeneratedAt: nil
            ),
            latestCodeDelivery: baseRequest.latestCodeDelivery,
            meeting: baseRequest.meeting,
            finalization: baseRequest.finalization,
            nextAction: baseRequest.nextAction
        )
        let cachedResponse = NotaryQueueResponse(
            realtimeQueueUserId: "database-notary-id",
            requests: [assignedRequest],
            meetings: [],
            counts: NotaryQueueCounts(pending: 1, scheduled: 0, readyForInPerson: 0, completed: 0, total: 1)
        )
        let viewModel = NotaryProfileViewModel(
            apiClient: FailingNotaryProfileAPIClient(),
            cacheStore: TestNotaryProfileCacheStore(
                entry: NotaryProfileCacheEntry(response: cachedResponse)
            )
        )

        await viewModel.load(session: makeAuthSession())

        XCTAssertEqual(viewModel.requests.map(\.id), [assignedRequest.id])
        XCTAssertEqual(viewModel.requests(for: .inReview).map(\.id), [assignedRequest.id])
        XCTAssertNil(viewModel.errorMessage)
    }

    @MainActor
    func testNotaryProfileRealtimeInvalidationRefetchesCanonicalQueue() async {
        let updatedResponse = makeNotaryQueueResponse(start: 0, count: 1, total: 1)
        let apiClient = SequentialNotaryProfileAPIClient(responses: [.empty, updatedResponse])
        let realtimeClient = TestNotaryQueueRealtimeClient()
        let session = makeAuthSession()
        let viewModel = NotaryProfileViewModel(
            apiClient: apiClient,
            cacheStore: TestNotaryProfileCacheStore(entry: nil),
            realtimeClient: realtimeClient
        )

        await viewModel.load(session: session)

        XCTAssertTrue(viewModel.requests.isEmpty)
        XCTAssertEqual(viewModel.realtimeState, .connecting)
        XCTAssertEqual(realtimeClient.startedQueueUserId, "notary-db-user")
        XCTAssertEqual(realtimeClient.startedAccessToken, session.accessToken)

        realtimeClient.emitState(.live)
        await realtimeClient.emitInvalidation()

        XCTAssertEqual(viewModel.realtimeState, .live)
        XCTAssertEqual(viewModel.requests.map(\.id), updatedResponse.requests.map(\.id))

        viewModel.stop()
        XCTAssertEqual(realtimeClient.stopCallCount, 1)
        XCTAssertEqual(viewModel.realtimeState, .idle)
    }

    @MainActor
    func testNotaryProfileForegroundRefreshRecoversMissedQueueEvent() async {
        let updatedResponse = makeNotaryQueueResponse(start: 0, count: 1, total: 1)
        let apiClient = SequentialNotaryProfileAPIClient(responses: [.empty, updatedResponse])
        let realtimeClient = TestNotaryQueueRealtimeClient()
        let session = makeAuthSession()
        let viewModel = NotaryProfileViewModel(
            apiClient: apiClient,
            cacheStore: TestNotaryProfileCacheStore(entry: nil),
            realtimeClient: realtimeClient
        )

        await viewModel.load(session: session)
        XCTAssertTrue(viewModel.requests.isEmpty)

        await viewModel.refreshFromForeground(session: session)

        XCTAssertEqual(viewModel.requests.map(\.id), updatedResponse.requests.map(\.id))
    }

    func testNotaryProfileDegradedPollingBacksOffAndCapsAtTenMinutes() {
        XCTAssertEqual(NotaryProfileViewModel.degradedPollDelay(for: 0), .seconds(45))
        XCTAssertEqual(NotaryProfileViewModel.degradedPollDelay(for: 1), .seconds(120))
        XCTAssertEqual(NotaryProfileViewModel.degradedPollDelay(for: 2), .seconds(300))
        XCTAssertEqual(NotaryProfileViewModel.degradedPollDelay(for: 3), .seconds(600))
        XCTAssertEqual(NotaryProfileViewModel.degradedPollDelay(for: 20), .seconds(600))
    }

    @MainActor
    func testNotaryProfileViewModelPrefetchesRemainingRequestsInTwentyRowPages() async {
        let apiClient = PagingNotaryProfileAPIClient(
            responsesByOffset: [
                0: makeNotaryQueueResponse(start: 0, count: 20, total: 65),
                20: makeNotaryQueueResponse(start: 20, count: 20, total: 65),
                40: makeNotaryQueueResponse(start: 40, count: 20, total: 65),
                60: makeNotaryQueueResponse(start: 60, count: 5, total: 65)
            ]
        )
        let viewModel = NotaryProfileViewModel(
            apiClient: apiClient,
            cacheStore: TestNotaryProfileCacheStore(entry: nil)
        )

        await viewModel.load(session: makeAuthSession())

        for _ in 0..<100 {
            let callCount = await apiClient.recordedCalls().count
            if callCount >= 4 {
                break
            }
            await Task.yield()
        }

        let recordedCalls = await apiClient.recordedCalls()
        XCTAssertEqual(recordedCalls, ["20:0", "20:20", "20:40", "5:60"])
        XCTAssertEqual(viewModel.requests.count, 65)
    }

    func testDocumentIntakeAPIClientLoadsJurisdictionsWithModeQuery() async throws {
        let urlSession = makeStubbedURLSession { request in
            XCTAssertEqual(request.url?.path, "/rules/member-form")
            XCTAssertEqual(request.url?.query, "mode=poa_only")
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

            return (
                try XCTUnwrap(HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )),
                Data(#"{"jurisdictions":[{"code":"CA","label":"California"}]}"#.utf8)
            )
        }
        let authClient = AuthAPIClient(
            config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
            urlSession: urlSession
        )
        let client = DocumentIntakeAPIClient(authClient: authClient)

        let response = try await client.listMemberFormJurisdictions(modeKey: "poa_only", accessToken: "access-token")

        XCTAssertEqual(response.jurisdictions?.first?.code, "CA")
        XCTAssertEqual(response.jurisdictions?.first?.label, "California")
    }

    func testDocumentIntakeAPIClientBootstrapsAndSavesRevisionedDraft() async throws {
        var requestIndex = 0
        let urlSession = makeStubbedURLSession { request in
            requestIndex += 1
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

            switch requestIndex {
            case 1:
                XCTAssertEqual(request.url?.path, "/documents/intake/bootstrap")
                XCTAssertEqual(request.httpMethod, "POST")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["productFlowMode"] as? String, "poa_only")
                XCTAssertEqual(json["jurisdiction"] as? String, "CA")
                XCTAssertEqual(json["rulesSnapshotVersion"] as? String, "member_form_rules_contract_v1")
                XCTAssertEqual(json["resumeLatestDraft"] as? Bool, true)

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"created":true,"document":{"id":"document-1"},"draft":{"documentId":"document-1","ownerId":"user-1","productFlowMode":"poa_only","jurisdiction":"CA","currentStep":"general_information","rulesSnapshotVersion":"member_form_rules_contract_v1","answers":{},"canonicalAnswers":{},"revision":0,"createdAt":"2026-07-13T00:00:00.000Z","updatedAt":"2026-07-13T00:00:00.000Z"}}"#.utf8)
                )
            case 2:
                XCTAssertEqual(request.url?.path, "/documents/document-1/intake-draft")
                XCTAssertEqual(request.httpMethod, "PUT")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["currentStep"] as? String, "poa_requirements")
                XCTAssertEqual(json["expectedRevision"] as? Int, 0)
                let answers = try XCTUnwrap(json["answers"] as? [String: Any])
                XCTAssertEqual(answers["principal_full_legal_name"] as? String, "Ada Lovelace")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"draft":{"documentId":"document-1","ownerId":"user-1","productFlowMode":"poa_only","jurisdiction":"CA","currentStep":"poa_requirements","rulesSnapshotVersion":"member_form_rules_contract_v1","answers":{"principal_full_legal_name":"Ada Lovelace"},"canonicalAnswers":{},"revision":1,"createdAt":"2026-07-13T00:00:00.000Z","updatedAt":"2026-07-13T00:00:00.000Z"}}"#.utf8)
                )
            default:
                throw URLError(.badServerResponse)
            }
        }
        let authClient = AuthAPIClient(
            config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
            urlSession: urlSession
        )
        let client = DocumentIntakeAPIClient(authClient: authClient)

        let bootstrapResponse = try await client.bootstrapDocumentIntake(
            DocumentIntakeBootstrapRequest(
                productFlowMode: "poa_only",
                jurisdiction: "CA",
                rulesSnapshotVersion: "member_form_rules_contract_v1",
                resumeLatestDraft: true
            ),
            accessToken: "access-token"
        )
        let saveResponse = try await client.saveDocumentIntakeDraft(
            documentId: "document-1",
            request: DocumentIntakeDraftUpsertRequest(
                currentStep: "poa_requirements",
                rulesSnapshotVersion: "member_form_rules_contract_v1",
                answers: ["principal_full_legal_name": .string("Ada Lovelace")],
                expectedRevision: bootstrapResponse.draft?.revision
            ),
            accessToken: "access-token"
        )

        XCTAssertEqual(bootstrapResponse.document?.id, "document-1")
        XCTAssertEqual(saveResponse.draft?.revision, 1)
        XCTAssertEqual(requestIndex, 2)
    }

    func testDocumentIntakeAPIClientCreatesUploadsAndFinalizesNotarizationDocument() async throws {
        var requestIndex = 0
        let urlSession = makeStubbedURLSession { request in
            requestIndex += 1

            switch requestIndex {
            case 1:
                XCTAssertEqual(request.url?.path, "/documents")
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["productFlowMode"] as? String, "notarize_document")
                XCTAssertEqual(json["documentType"] as? String, "notarize_document")
                XCTAssertEqual(json["jurisdiction"] as? String, "CA")
                XCTAssertEqual(json["fileName"] as? String, "trust.pdf")
                XCTAssertEqual(json["fileSize"] as? Int, 7)
                XCTAssertEqual(json["mimeType"] as? String, "application/pdf")
                XCTAssertEqual(json["documentDescription"] as? String, "Trust certification")
                XCTAssertEqual(json["requesterName"] as? String, "Ada Lovelace")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"document":{"id":"document-upload-1"},"version":{"id":"version-1","version":1,"fileName":"trust.pdf","mimeType":"application/pdf","sizeBytes":7,"isFinal":false},"upload":{"signedUrl":"https://upload.example.test/document.pdf"}}"#.utf8)
                )
            case 2:
                XCTAssertEqual(request.url?.absoluteString, "https://upload.example.test/document.pdf")
                XCTAssertEqual(request.httpMethod, "PUT")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/pdf")
                XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
                let body = try self.requestBodyData(for: request)
                XCTAssertEqual(body, Data("pdfdata".utf8))

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: nil
                    )),
                    Data()
                )
            case 3:
                XCTAssertEqual(request.url?.path, "/documents/document-upload-1/upload-finalize")
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["documentVersionId"] as? String, "version-1")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"document":{"id":"document-upload-1"}}"#.utf8)
                )
            default:
                throw URLError(.badServerResponse)
            }
        }
        let authClient = AuthAPIClient(
            config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
            urlSession: urlSession
        )
        let client = DocumentIntakeAPIClient(authClient: authClient, urlSession: urlSession)

        let createResponse = try await client.createDocumentUpload(
            DocumentUploadCreateRequest(
                productFlowMode: "notarize_document",
                documentType: "notarize_document",
                jurisdiction: "CA",
                fileName: "trust.pdf",
                fileSize: 7,
                mimeType: "application/pdf",
                documentDescription: "Trust certification",
                notarizationReason: "Bank request",
                requesterName: "Ada Lovelace",
                requesterEmail: "ada@example.com",
                requesterPhone: "+15555550123",
                requesterPhoneCountryCode: "+1"
            ),
            accessToken: "access-token"
        )
        try await client.uploadDocument(
            data: Data("pdfdata".utf8),
            mimeType: "application/pdf",
            to: try XCTUnwrap(URL(string: createResponse.upload?.signedUrl ?? ""))
        )
        let finalizeResponse = try await client.finalizeDocumentUpload(
            documentId: "document-upload-1",
            request: DocumentUploadFinalizeRequest(documentVersionId: "version-1"),
            accessToken: "access-token"
        )

        XCTAssertEqual(createResponse.document?.id, "document-upload-1")
        XCTAssertEqual(finalizeResponse.document?.id, "document-upload-1")
        XCTAssertEqual(requestIndex, 3)
    }

    func testDocumentIntakeAPIClientRunsSigningWorkflowRequests() async throws {
        var requestIndex = 0
        let urlSession = makeStubbedURLSession { request in
            requestIndex += 1

            switch requestIndex {
            case 1:
                XCTAssertEqual(request.url?.path, "/documents/document-1/signing")
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"document":{"id":"document-1","createdAt":"2026-06-05T12:00:00.000Z"},"signing":{"state":"ready","reviewApproval":null,"signingExecution":null,"approvedOutputKeys":["poa_document"],"outputs":[],"pendingOutputs":[],"missingOutputKeys":[],"requiresGeneration":false,"allOutputsReady":true,"signatures":[],"groups":[],"completion":{"requiredSignatureCount":1,"capturedRequiredSignatureCount":0,"allRequiredSignaturesComplete":false,"canConfirm":false}}}"#.utf8)
                )
            case 2:
                XCTAssertEqual(request.url?.path, "/documents/document-1/signatures/saved")
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"savedSignatures":[{"id":"saved-1","captureMethod":"type","typedValue":"Ada Lovelace","typedKind":"name","assetDownloadUrl":null,"mimeType":null,"sizeBytes":null,"capturedAt":"2026-06-05T12:20:00.000Z","createdAt":"2026-06-05T12:20:00.000Z"}]}"#.utf8)
                )
            case 3:
                XCTAssertEqual(request.url?.path, "/documents/document-1/signatures")
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["generationRunId"] as? String, "run-1")
                XCTAssertEqual(json["outputSignerId"] as? String, "output-signer-1")
                XCTAssertEqual(json["captureMethod"] as? String, "type")
                XCTAssertEqual(json["typedValue"] as? String, "Ada Lovelace")
                XCTAssertEqual(json["typedKind"] as? String, "name")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"signature":{"id":"signature-1","status":"captured"}}"#.utf8)
                )
            case 4:
                XCTAssertEqual(request.url?.path, "/documents/document-1/signatures/request")
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["generationRunId"] as? String, "run-1")
                XCTAssertEqual(json["outputSignerId"] as? String, "output-signer-1")
                XCTAssertEqual(json["fileName"] as? String, "signature.png")
                XCTAssertEqual(json["fileSize"] as? Int, 9)
                XCTAssertEqual(json["mimeType"] as? String, "image/png")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"signature":{"id":"signature-upload-1","documentId":"document-1","generationRunId":"run-1","outputSignerId":"output-signer-1","status":"pending_upload"},"upload":{"signedUrl":"https://upload.example.test/signature.png"}}"#.utf8)
                )
            case 5:
                XCTAssertEqual(request.url?.absoluteString, "https://upload.example.test/signature.png")
                XCTAssertEqual(request.httpMethod, "PUT")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "image/png")
                XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
                let body = try self.requestBodyData(for: request)
                XCTAssertEqual(body, Data("imagedata".utf8))

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: nil
                    )),
                    Data()
                )
            case 6:
                XCTAssertEqual(request.url?.path, "/documents/document-1/signatures/finalize")
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["signatureId"] as? String, "signature-upload-1")
                XCTAssertEqual(json["generationRunId"] as? String, "run-1")
                XCTAssertEqual(json["outputSignerId"] as? String, "output-signer-1")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"signature":{"id":"signature-upload-1","status":"captured"}}"#.utf8)
                )
            case 7:
                XCTAssertEqual(request.url?.path, "/documents/document-1/signatures/saved/saved-1")
                XCTAssertEqual(request.httpMethod, "DELETE")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"message":"deleted"}"#.utf8)
                )
            case 8:
                XCTAssertEqual(request.url?.path, "/documents/document-1/sign")
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-token")
                let body = try self.requestBodyData(for: request)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                XCTAssertEqual(json["confirmed"] as? Bool, true)

                return (
                    try XCTUnwrap(HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: nil,
                        headerFields: ["Content-Type": "application/json"]
                    )),
                    Data(#"{"message":"confirmed"}"#.utf8)
                )
            default:
                throw URLError(.badServerResponse)
            }
        }
        let authClient = AuthAPIClient(
            config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!),
            urlSession: urlSession
        )
        let client = DocumentIntakeAPIClient(authClient: authClient, urlSession: urlSession)

        let signingResponse = try await client.getDocumentSigning(documentId: "document-1", accessToken: "access-token")
        let savedResponse = try await client.listSavedSignatures(documentId: "document-1", accessToken: "access-token")
        let captureResponse = try await client.captureSignature(
            documentId: "document-1",
            request: DocumentSignatureCaptureRequest(
                generationRunId: "run-1",
                outputSignerId: "output-signer-1",
                captureMethod: "type",
                typedValue: "Ada Lovelace",
                typedKind: "name",
                imageDataUrl: nil,
                savedSignatureId: nil
            ),
            accessToken: "access-token"
        )
        let uploadResponse = try await client.requestSignatureUpload(
            documentId: "document-1",
            request: DocumentSignatureUploadRequest(
                generationRunId: "run-1",
                outputSignerId: "output-signer-1",
                fileName: "signature.png",
                fileSize: 9,
                mimeType: "image/png"
            ),
            accessToken: "access-token"
        )
        try await client.uploadSignatureAsset(
            data: Data("imagedata".utf8),
            mimeType: "image/png",
            to: try XCTUnwrap(URL(string: uploadResponse.upload?.signedUrl ?? ""))
        )
        let finalizeResponse = try await client.finalizeSignatureUpload(
            documentId: "document-1",
            request: DocumentSignatureFinalizeRequest(
                signatureId: try XCTUnwrap(uploadResponse.signature?.id),
                generationRunId: "run-1",
                outputSignerId: "output-signer-1"
            ),
            accessToken: "access-token"
        )
        let deleteResponse = try await client.deleteSavedSignature(documentId: "document-1", signatureId: "saved-1", accessToken: "access-token")
        let confirmResponse = try await client.confirmDocumentSigning(
            documentId: "document-1",
            request: DocumentSignConfirmRequest(confirmed: true),
            accessToken: "access-token"
        )

        XCTAssertEqual(signingResponse.document?.id, "document-1")
        XCTAssertEqual(savedResponse.savedSignatures?.first?.id, "saved-1")
        XCTAssertEqual(captureResponse.signature?.id, "signature-1")
        XCTAssertEqual(finalizeResponse.signature?.id, "signature-upload-1")
        XCTAssertEqual(deleteResponse.message, "deleted")
        XCTAssertEqual(confirmResponse.message, "confirmed")
        XCTAssertEqual(requestIndex, 8)
    }

    @MainActor
    func testHomeViewModelUsesActiveProductFlowModes() async {
        let response = HomeProductFlowModesResponse(
            modes: [
                HomeProductFlowMode(
                    modeKey: "notarize_document",
                    displayName: "Document Notarization",
                    description: "Prepare an existing document for formal acceptance.",
                    isActive: true,
                    sortOrder: 30
                ),
                HomeProductFlowMode(
                    modeKey: "trust_bundle",
                    displayName: "Trust Registration",
                    description: "Protect family assets.",
                    isActive: false,
                    sortOrder: 20
                ),
                HomeProductFlowMode(
                    modeKey: "poa_only",
                    displayName: "Power of Attorney",
                    description: "Authorize someone you trust.",
                    isActive: true,
                    sortOrder: 10
                )
            ],
            message: nil
        )
        let viewModel = HomeViewModel(apiClient: TestHomeAPIClient(response: response))

        await viewModel.loadProducts(for: makeAuthSession())

        XCTAssertEqual(viewModel.productCards.map(\.modeKey), ["poa_only", "notarize_document"])
        XCTAssertNil(viewModel.productLoadMessage)
    }

    func testHomeProfileContentDerivesInitialsAndRoleCount() {
        let user = AuthenticatedUser(
            id: "user-1",
            email: "jorge@example.com",
            phone: "+15555550123",
            role: "pro",
            availableRoles: ["pro", "member", "notary"],
            status: "active",
            firstName: "Jorge",
            lastName: "Lovelace",
            emailConfirmedAt: nil,
            phoneConfirmedAt: nil,
            lastSignInAt: nil,
            lastAuthSyncedAt: nil
        )

        let profile = HomeProfileContent(user: user)

        XCTAssertEqual(profile.initials, "JL")
        XCTAssertEqual(profile.displayName, "Jorge Lovelace")
        XCTAssertEqual(profile.roleLabel, "Member")
        XCTAssertEqual(profile.availableProfileCount, 2)
    }

    func testAuthVerifyResponseDecodesSessionAndProfileRequirement() throws {
        let data = Data(
            #"""
            {
              "accessToken": "access-token",
              "refreshToken": "refresh-token",
              "profileCompletionRequired": true,
              "user": {
                "id": "user-1",
                "email": "member@example.com",
                "phone": "+15555550123",
                "role": "member",
                "availableRoles": ["member"],
                "status": "active",
                "firstName": null,
                "lastName": null,
                "emailConfirmedAt": "2026-06-26T00:00:00.000Z",
                "phoneConfirmedAt": null,
                "lastSignInAt": "2026-06-26T00:00:00.000Z",
                "lastAuthSyncedAt": "2026-06-26T00:00:00.000Z"
              }
            }
            """#.utf8
        )

        let response = try JSONDecoder().decode(AuthVerifyResponse.self, from: data)

        XCTAssertTrue(response.profileCompletionRequired)
        XCTAssertEqual(response.session.accessToken, "access-token")
        XCTAssertEqual(response.session.refreshToken, "refresh-token")
        XCTAssertEqual(response.session.user.email, "member@example.com")
        XCTAssertEqual(response.session.user.availableRoles, ["member"])
    }

    func testAuthAPIClientMapsWrongCodeError() async throws {
        let urlSession = makeStubbedURLSession { request in
            XCTAssertEqual(request.url?.path, "/auth/otp/verify")
            return (
                try XCTUnwrap(HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 401,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )),
                Data(#"{"error":"invalid_otp","message":"Wrong code. Check the code and try again."}"#.utf8)
            )
        }
        let client = AuthAPIClient(config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!), urlSession: urlSession)

        do {
            _ = try await client.verifyEmailOTP(email: "member@example.com", token: "00000000")
            XCTFail("Expected wrong-code error")
        } catch let error as AuthAPIError {
            XCTAssertEqual(error, .wrongCode(message: "Wrong code. Check the code and try again."))
        }
    }

    func testAuthAPIClientDecodesOTPStartResponse() async throws {
        let urlSession = makeStubbedURLSession { request in
            XCTAssertEqual(request.url?.path, "/auth/otp/phone/start")
            return (
                try XCTUnwrap(HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )),
                Data(#"{"status":"ok","message":"Phone code sent","otpLength":8,"cooldownSeconds":60}"#.utf8)
            )
        }
        let client = AuthAPIClient(config: AuthConfig(apiBaseURL: URL(string: "https://api.example.test")!), urlSession: urlSession)

        let response = try await client.requestPhoneOTP(phone: "+15555550123")

        XCTAssertEqual(response.status, "ok")
        XCTAssertEqual(response.message, "Phone code sent")
        XCTAssertEqual(response.otpLength, 8)
        XCTAssertEqual(response.cooldownSeconds, 60)
    }

    func testInMemorySessionStoreRoundTripsAndClears() throws {
        let store = InMemoryAuthSessionStore()
        let session = makeAuthSession()

        XCTAssertNil(try store.load())
        try store.save(session)
        XCTAssertEqual(try store.load(), session)
        try store.clear()
        XCTAssertNil(try store.load())
    }

    func testKeychainSessionStoreRoundTripsAndClears() throws {
        let store = KeychainAuthSessionStore(
            service: "dev.mobile.darci.tests.\(UUID().uuidString)",
            account: "current"
        )
        let session = makeAuthSession()

        try store.clear()
        XCTAssertNil(try store.load())
        try store.save(session)
        XCTAssertEqual(try store.load(), session)
        try store.clear()
        XCTAssertNil(try store.load())
    }

    @MainActor
    func testAuthenticationViewModelStartsPhoneChallengeAndCooldown() async {
        TestAuthAPIClient.reset()
        let viewModel = AuthenticationViewModel(apiClient: TestAuthAPIClient())

        let didStart = await viewModel.requestOTP(method: .phone, rawIdentifier: "(202) 555-0147")

        XCTAssertTrue(didStart)
        XCTAssertEqual(TestAuthAPIClient.requestedPhone, "+12025550147")
        XCTAssertEqual(viewModel.challenge?.method, .phone)
        XCTAssertEqual(viewModel.challenge?.identifier, "+12025550147")
        XCTAssertEqual(viewModel.challenge?.otpLength, 8)
        XCTAssertEqual(viewModel.resendCooldownSeconds, 60)
        XCTAssertNil(viewModel.feedbackMessage)
    }

    @MainActor
    func testAuthenticationViewModelStartsEmailChallenge() async {
        TestAuthAPIClient.reset()
        let viewModel = AuthenticationViewModel(apiClient: TestAuthAPIClient())

        let didStart = await viewModel.requestOTP(method: .email, rawIdentifier: " Member@Example.COM ")

        XCTAssertTrue(didStart)
        XCTAssertEqual(TestAuthAPIClient.requestedEmail, "member@example.com")
        XCTAssertEqual(viewModel.challenge?.method, .email)
        XCTAssertEqual(viewModel.challenge?.identifier, "member@example.com")
    }

    @MainActor
    func testAuthenticationViewModelRejectsInvalidIdentifier() async {
        TestAuthAPIClient.reset()
        let viewModel = AuthenticationViewModel(apiClient: TestAuthAPIClient())

        let didStart = await viewModel.requestOTP(method: .email, rawIdentifier: "not-email")

        XCTAssertFalse(didStart)
        XCTAssertNil(TestAuthAPIClient.requestedEmail)
        XCTAssertEqual(viewModel.fieldError, "Enter a valid email address.")
    }

    @MainActor
    func testAuthenticationViewModelMapsNetworkFailure() async {
        let client = TestAuthAPIClient(otpStartError: URLError(.notConnectedToInternet))
        let viewModel = AuthenticationViewModel(apiClient: client)

        let didStart = await viewModel.requestOTP(method: .phone, rawIdentifier: "2025550147")

        XCTAssertFalse(didStart)
        XCTAssertEqual(viewModel.globalError, "We couldn't reach DARCi. Check your connection and try again.")
    }

    @MainActor
    func testAuthenticationViewModelVerifiesChallengeToCompleteProfile() async {
        TestAuthAPIClient.reset()
        let store = InMemoryAuthSessionStore()
        let viewModel = AuthenticationViewModel(apiClient: TestAuthAPIClient(), sessionStore: store)

        let didStart = await viewModel.requestOTP(method: .phone, rawIdentifier: "2025550147")
        XCTAssertTrue(didStart)
        let route = await viewModel.verifyOTP(token: "1234 5678")

        XCTAssertEqual(route, .completeProfile)
        XCTAssertEqual(TestAuthAPIClient.verifiedPhone, "+12025550147")
        XCTAssertEqual(TestAuthAPIClient.verifiedToken, "12345678")
        XCTAssertEqual(viewModel.verifiedSession?.accessToken, "access-token")
        XCTAssertEqual(try? store.load()?.accessToken, "access-token")
    }

    @MainActor
    func testAuthenticationViewModelVerifiesChallengeToSuccess() async {
        let response = AuthVerifyResponse(
            accessToken: "access-token",
            refreshToken: "refresh-token",
            user: makeAuthenticatedUser(),
            profileCompletionRequired: false
        )
        let viewModel = AuthenticationViewModel(apiClient: TestAuthAPIClient(verifyResponse: response))

        let didStart = await viewModel.requestOTP(method: .email, rawIdentifier: "member@example.com")
        XCTAssertTrue(didStart)
        let route = await viewModel.verifyOTP(token: "12345678")

        XCTAssertEqual(route, .success)
    }

    @MainActor
    func testAuthenticationViewModelMapsWrongCode() async {
        let client = TestAuthAPIClient(verifyError: AuthAPIError.wrongCode(message: "Wrong code. Check the code and try again."))
        let viewModel = AuthenticationViewModel(apiClient: client)

        let didStart = await viewModel.requestOTP(method: .phone, rawIdentifier: "2025550147")
        XCTAssertTrue(didStart)
        let route = await viewModel.verifyOTP(token: "00000000")

        XCTAssertNil(route)
        XCTAssertEqual(viewModel.fieldError, "Wrong code. Check the code and try again.")
    }

    @MainActor
    func testAuthenticationViewModelCompletesPhoneVerifiedProfile() async throws {
        TestAuthAPIClient.reset()
        let store = InMemoryAuthSessionStore()
        let responseUser = makeAuthenticatedUser(
            email: "new@example.com",
            phone: "+12025550147",
            firstName: "Ada",
            lastName: "Lovelace"
        )
        let client = TestAuthAPIClient(profileResponse: AuthUserResponse(user: responseUser))
        let viewModel = AuthenticationViewModel(apiClient: client, sessionStore: store)

        let didStart = await viewModel.requestOTP(method: .phone, rawIdentifier: "2025550147")
        XCTAssertTrue(didStart)
        let route = await viewModel.verifyOTP(token: "12345678")
        XCTAssertEqual(route, .completeProfile)
        let didComplete = await viewModel.completeProfile(
            firstName: " Ada ",
            lastName: " Lovelace ",
            email: "New@Example.COM",
            phone: "9999999999"
        )

        XCTAssertTrue(didComplete)
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.count, 1)
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.first?.firstName, "Ada")
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.first?.lastName, "Lovelace")
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.first?.email, "new@example.com")
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.first?.phone, "+12025550147")
        XCTAssertEqual(TestAuthAPIClient.profileAccessTokens, ["access-token"])
        XCTAssertEqual(try store.load()?.user.firstName, "Ada")
    }

    @MainActor
    func testAuthenticationViewModelCompletesEmailVerifiedProfileWithLockedEmail() async {
        TestAuthAPIClient.reset()
        let client = TestAuthAPIClient(
            verifyResponse: AuthVerifyResponse(
                accessToken: "access-token",
                refreshToken: "refresh-token",
                user: makeAuthenticatedUser(email: "member@example.com", phone: nil),
                profileCompletionRequired: true
            )
        )
        let viewModel = AuthenticationViewModel(apiClient: client, sessionStore: InMemoryAuthSessionStore())

        let didStart = await viewModel.requestOTP(method: .email, rawIdentifier: "Member@Example.COM")
        XCTAssertTrue(didStart)
        let route = await viewModel.verifyOTP(token: "12345678")
        XCTAssertEqual(route, .completeProfile)
        let didComplete = await viewModel.completeProfile(
            firstName: "Ada",
            lastName: "Lovelace",
            email: "attacker@example.com",
            phone: "(202) 555-0147"
        )

        XCTAssertTrue(didComplete)
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.first?.email, "member@example.com")
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.first?.phone, "+12025550147")
    }

    @MainActor
    func testAuthenticationViewModelRejectsInvalidProfileContactBeforeSubmitting() async {
        TestAuthAPIClient.reset()
        let viewModel = AuthenticationViewModel(apiClient: TestAuthAPIClient(), sessionStore: InMemoryAuthSessionStore())

        let didStart = await viewModel.requestOTP(method: .phone, rawIdentifier: "2025550147")
        XCTAssertTrue(didStart)
        let route = await viewModel.verifyOTP(token: "12345678")
        XCTAssertEqual(route, .completeProfile)
        let didComplete = await viewModel.completeProfile(
            firstName: "Ada",
            lastName: "Lovelace",
            email: "not-email",
            phone: "2025550147"
        )

        XCTAssertFalse(didComplete)
        XCTAssertEqual(viewModel.fieldError, "Enter a valid email address.")
        XCTAssertTrue(TestAuthAPIClient.completedProfiles.isEmpty)
    }

    @MainActor
    func testAuthenticationViewModelRefreshesOnceWhenProfileCompletionIsUnauthorized() async throws {
        TestAuthAPIClient.reset()
        let store = InMemoryAuthSessionStore()
        let responseUser = makeAuthenticatedUser(
            email: "member@example.com",
            phone: "+12025550147",
            firstName: "Ada",
            lastName: "Lovelace"
        )
        let client = TestAuthAPIClient(
            refreshResponse: AuthRefreshResponse(
                accessToken: "refreshed-access-token",
                refreshToken: "refreshed-refresh-token",
                user: makeAuthenticatedUser()
            ),
            profileResponse: AuthUserResponse(user: responseUser),
            profileErrors: [AuthAPIError.unauthorized(message: "expired")]
        )
        let viewModel = AuthenticationViewModel(apiClient: client, sessionStore: store)

        let didStart = await viewModel.requestOTP(method: .phone, rawIdentifier: "2025550147")
        XCTAssertTrue(didStart)
        let route = await viewModel.verifyOTP(token: "12345678")
        XCTAssertEqual(route, .completeProfile)
        let didComplete = await viewModel.completeProfile(
            firstName: "Ada",
            lastName: "Lovelace",
            email: "member@example.com",
            phone: "2025550147"
        )

        XCTAssertTrue(didComplete)
        XCTAssertEqual(TestAuthAPIClient.refreshedToken, "refresh-token")
        XCTAssertEqual(TestAuthAPIClient.completedProfiles.count, 2)
        XCTAssertEqual(TestAuthAPIClient.profileAccessTokens, ["access-token", "refreshed-access-token"])
        XCTAssertEqual(try store.load()?.accessToken, "refreshed-access-token")
        XCTAssertEqual(try store.load()?.user.firstName, "Ada")
    }

    @MainActor
    func testAppSessionCoordinatorRestoresStoredSessionWithRefresh() async throws {
        TestAuthAPIClient.reset()
        let store = InMemoryAuthSessionStore(session: makeAuthSession())
        let refreshedUser = makeAuthenticatedUser(firstName: "Grace", lastName: "Hopper")
        let refreshedSession = AuthSession(accessToken: "new-access", refreshToken: "new-refresh", user: refreshedUser)
        let client = TestAuthAPIClient(
            refreshResponse: AuthRefreshResponse(
                accessToken: refreshedSession.accessToken,
                refreshToken: refreshedSession.refreshToken,
                user: refreshedSession.user
            )
        )
        let coordinator = AppSessionCoordinator(apiClient: client, sessionStore: store)

        let result = await coordinator.restoreSessionOnLaunch()

        XCTAssertEqual(result, .restored(refreshedSession))
        XCTAssertEqual(TestAuthAPIClient.refreshedToken, "refresh-token")
        XCTAssertEqual(coordinator.currentSession, refreshedSession)
        XCTAssertEqual(try store.load(), refreshedSession)
    }

    @MainActor
    func testAppSessionCoordinatorClearsStoredSessionWhenRefreshFails() async throws {
        TestAuthAPIClient.reset()
        let store = InMemoryAuthSessionStore(session: makeAuthSession())
        let client = TestAuthAPIClient(refreshError: AuthAPIError.unauthorized(message: "expired"))
        let coordinator = AppSessionCoordinator(apiClient: client, sessionStore: store)

        let result = await coordinator.restoreSessionOnLaunch()

        XCTAssertEqual(result, .clearedStoredSession)
        XCTAssertEqual(TestAuthAPIClient.refreshedToken, "refresh-token")
        XCTAssertNil(coordinator.currentSession)
        XCTAssertNil(try store.load())
    }

    @MainActor
    func testAppSessionCoordinatorPersistsPersonalInfoUpdate() async throws {
        let originalSession = makeAuthSession()
        let updatedUser = makeAuthenticatedUser(
            firstName: "Grace",
            lastName: "Hopper",
            address: "5 Prince St. Soho, NY."
        )
        let store = InMemoryAuthSessionStore(session: originalSession)
        let coordinator = AppSessionCoordinator(
            apiClient: TestAuthAPIClient(profileResponse: AuthUserResponse(user: updatedUser)),
            sessionStore: store
        )
        XCTAssertTrue(coordinator.acceptAuthenticatedSession(originalSession))

        try await coordinator.updatePersonalInfo(
            AuthPersonalInfoUpdateRequest(
                firstName: "Grace",
                lastName: "Hopper",
                email: updatedUser.email,
                phone: updatedUser.phone ?? "",
                address: updatedUser.address
            ),
            password: nil
        )

        XCTAssertEqual(coordinator.currentSession?.user, updatedUser)
        XCTAssertEqual(try store.load()?.user.address, "5 Prince St. Soho, NY.")
    }

    @MainActor
    func testAppSessionCoordinatorSignOutClearsLocalSession() async throws {
        let store = InMemoryAuthSessionStore(session: makeAuthSession())
        let coordinator = AppSessionCoordinator(apiClient: TestAuthAPIClient(), sessionStore: store)

        let didSignOut = await coordinator.signOut()

        XCTAssertTrue(didSignOut)

        XCTAssertNil(coordinator.currentSession)
        XCTAssertNil(try store.load())
    }

    private func makeStubbedURLSession(
        handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)
    ) -> URLSession {
        AuthURLProtocolStub.requestHandler = handler

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AuthURLProtocolStub.self]
        return URLSession(configuration: configuration)
    }

    private func makeNotaryQueueResponse(start: Int, count: Int, total: Int) -> NotaryQueueResponse {
        let requests = (start..<(start + count)).map { index in
            NotaryQueueRequestSummary(
                request: NotaryRequestSummary(
                    id: "request-\(index)",
                    documentId: "document-\(index)",
                    workflowId: nil,
                    status: "submitted",
                    queueStatus: "submitted",
                    submittedAt: "2026-07-24T12:00:00.000Z"
                ),
                document: NotaryDocumentSummary(
                    id: "document-\(index)",
                    idn: "IDN-\(index)",
                    status: "pending_notary",
                    documentType: "affidavit",
                    documentTypeLabel: "Affidavit",
                    jurisdiction: "US-OH",
                    createdAt: "2026-07-24T12:00:00.000Z",
                    summary: nil
                ),
                owner: nil,
                workflow: nil,
                latestCodeDelivery: nil,
                meeting: nil,
                finalization: NotaryFinalizationSummary(
                    latestStatus: nil,
                    latestStatusAt: nil,
                    isAnchored: false,
                    isVerificationChecked: false,
                    isWatermarked: false,
                    isHashRecorded: false,
                    verificationStatus: nil,
                    anchoredAt: nil,
                    lastCheckedAt: nil,
                    publicVerifyPath: nil
                ),
                nextAction: nil
            )
        }

        return NotaryQueueResponse(
            realtimeQueueUserId: "notary-db-user",
            requests: requests,
            meetings: [],
            counts: NotaryQueueCounts(
                pending: total,
                scheduled: 0,
                readyForInPerson: 0,
                completed: 0,
                total: total
            )
        )
    }

    private func makeNotarySessionContext(
        requestStatus: String = "approved",
        canReviewRequest: Bool = false,
        meetingStatus: String? = nil,
        hasPassedSamePlace: Bool = false,
        hasVerifiedIdentity: Bool = false,
        hasVenue: Bool = false,
        hasAcknowledgment: Bool = false,
        isAnchored: Bool = false
    ) -> NotaryRequestReviewContext {
        let meeting = meetingStatus.map { status in
            NotarySessionMeeting(
                meetingId: "meeting-1",
                requestId: "request-1",
                workflowId: "workflow-1",
                scheduledAt: nil,
                timezone: nil,
                location: nil,
                status: status,
                samePlaceRequired: true,
                samePlaceStatus: hasPassedSamePlace ? "passed" : "pending",
                proposedSlots: [],
                participants: []
            )
        }
        let proximityEvaluations = hasPassedSamePlace
            ? [
                NotaryProximityEvaluation(
                    id: "proximity-1",
                    meetingId: "meeting-1",
                    evaluationKind: "same_place",
                    status: "passed",
                    thresholdMeters: 100,
                    observedDistanceMeters: 2.4,
                    evaluatedAt: "2026-07-31T15:01:00Z",
                    notes: nil,
                    memberSample: nil,
                    notarySample: nil
                )
            ]
            : []
        let identityVerifications = hasVerifiedIdentity
            ? [NotaryIdentityVerification(id: "identity-1", status: "verified", subjectName: "Member User")]
            : []
        let artifacts = hasVenue
            ? [
                NotarySessionArtifact(
                    id: "venue-1",
                    artifactKind: "venue_capture",
                    status: "active",
                    capturedAt: "2026-07-31T15:02:00Z",
                    metadata: NotarySessionArtifactMetadata(
                        captureSource: "gps_reverse_geocode",
                        venue: NotaryVenue(
                            state: "Ohio",
                            county: "Cuyahoga",
                            city: "Cleveland",
                            addressLine1: "200 Public Square",
                            locationLabel: nil,
                            completedAt: "2026-07-31T15:02:00Z"
                        )
                    )
                )
            ]
            : []
        let history = hasAcknowledgment
            ? [
                NotaryFinalizationHistoryEvent(
                    id: "history-1",
                    status: "acknowledgment_appended",
                    changeSource: "documents.append-acknowledgment",
                    changeReason: nil,
                    createdAt: "2026-07-31T15:03:00Z"
                )
            ]
            : []

        return NotaryRequestReviewContext(
            request: NotaryRequestSummary(
                id: "request-1",
                documentId: "document-1",
                workflowId: "workflow-1",
                status: requestStatus,
                queueStatus: requestStatus,
                submittedAt: "2026-07-31T14:00:00Z"
            ),
            document: NotaryRequestReviewDocument(
                id: "document-1",
                idn: "IDN-1",
                status: "pending_notary",
                documentType: "power_of_attorney",
                documentTypeLabel: "Power of Attorney",
                jurisdiction: "US-OH",
                createdAt: "2026-07-31T14:00:00Z",
                reviewDocuments: []
            ),
            owner: nil,
            notary: nil,
            workflow: nil,
            latestCodeDelivery: nil,
            meeting: meeting,
            evidence: NotarySessionEvidence(
                checkins: [],
                geolocationSamples: [],
                identityVerifications: identityVerifications,
                proximityEvaluations: proximityEvaluations,
                artifacts: artifacts
            ),
            finalization: NotarySessionFinalization(
                latestStatus: isAnchored ? "ledger_anchored" : nil,
                latestStatusAt: nil,
                isAnchored: isAnchored,
                isVerificationChecked: false,
                isWatermarked: isAnchored,
                isHashRecorded: isAnchored,
                verificationStatus: isAnchored ? "verified" : nil,
                anchoredAt: isAnchored ? "2026-07-31T15:05:00Z" : nil,
                lastCheckedAt: nil,
                publicVerifyPath: isAnchored ? "/verify/IDN-1" : nil,
                hash: isAnchored ? String(repeating: "a", count: 64) : nil,
                ledgerTxId: isAnchored ? "ledger_IDN-1" : nil,
                anchorAttempt: nil,
                history: history
            ),
            capabilities: NotaryContextCapabilities(
                canReviewRequest: canReviewRequest,
                canManageMeeting: true,
                canRecordEvidence: meeting != nil,
                canFinalizeDocument: meetingStatus == "completed",
                canOpenVerification: isAnchored
            ),
            warnings: [],
            nextAction: nil
        )
    }

    private func requestBodyData(for request: URLRequest) throws -> Data {
        if let httpBody = request.httpBody {
            return httpBody
        }

        guard let stream = request.httpBodyStream else {
            return Data()
        }

        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)

        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count < 0 {
                throw stream.streamError ?? URLError(.cannotDecodeContentData)
            }
            if count == 0 {
                break
            }
            data.append(buffer, count: count)
        }

        return data
    }

    private func makeAuthSession() -> AuthSession {
        AuthSession(
            accessToken: "access-token",
            refreshToken: "refresh-token",
            user: makeAuthenticatedUser(firstName: "Ada", lastName: "Lovelace")
        )
    }

    private func makeAuthenticatedUser(
        id: String = "user-1",
        email: String = "member@example.com",
        phone: String? = "+15555550123",
        firstName: String? = nil,
        lastName: String? = nil,
        address: String? = nil
    ) -> AuthenticatedUser {
        AuthenticatedUser(
            id: id,
            email: email,
            phone: phone,
            address: address,
            role: "member",
            availableRoles: ["member"],
            status: "active",
            firstName: firstName,
            lastName: lastName,
            emailConfirmedAt: "2026-06-26T00:00:00.000Z",
            phoneConfirmedAt: nil,
            lastSignInAt: "2026-06-26T00:00:00.000Z",
            lastAuthSyncedAt: "2026-06-26T00:00:00.000Z"
        )
    }
}

private struct TestHomeAPIClient: HomeAPIProviding {
    let response: HomeProductFlowModesResponse
    var error: Error?

    func listProductFlowModes(accessToken: String) async throws -> HomeProductFlowModesResponse {
        if let error {
            throw error
        }

        return response
    }
}
