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

    func completeProfile(_ profile: AuthProfileCompletionRequest, accessToken: String) async throws -> AuthUserResponse {
        Self.completedProfiles.append(profile)
        Self.profileAccessTokens.append(accessToken)

        if let error = profileErrors.dropFirst(Self.completedProfiles.count - 1).first {
            throw error
        }

        return profileResponse
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
        let config = AuthConfig.current(environment: ["DARCI_API_BASE_URL": "$(DARCI_API_BASE_URL)"])

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
    func testAppSessionCoordinatorSignOutClearsLocalSession() throws {
        let store = InMemoryAuthSessionStore(session: makeAuthSession())
        let coordinator = AppSessionCoordinator(apiClient: TestAuthAPIClient(), sessionStore: store)

        XCTAssertTrue(coordinator.signOut())

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

    private func makeAuthSession() -> AuthSession {
        AuthSession(
            accessToken: "access-token",
            refreshToken: "refresh-token",
            user: makeAuthenticatedUser(firstName: "Ada", lastName: "Lovelace")
        )
    }

    private func makeAuthenticatedUser(
        email: String = "member@example.com",
        phone: String? = "+15555550123",
        firstName: String? = nil,
        lastName: String? = nil
    ) -> AuthenticatedUser {
        AuthenticatedUser(
            id: "user-1",
            email: email,
            phone: phone,
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
