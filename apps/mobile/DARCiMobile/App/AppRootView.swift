import SwiftUI

enum AppLaunchPhase: Equatable {
    case onboarding
    case authentication
    case signedIn

    static let initial: AppLaunchPhase = .onboarding
}

struct AppRootView: View {
    @State private var launchPhase = AppLaunchPhase.initial
    @State private var didAttemptSessionRestore = false
    @State private var selectedTab: AppTab = .home
    @State private var selectedProductModeKey: String?
    @State private var intakeRoute: ProductIntakeRoute?
    @State private var reviewRoute: DocumentReviewRoute?
    @State private var signingRoute: DocumentSigningRoute?
    @State private var notaryReviewRoute: NotaryRequestReviewRoute?
    @State private var isProfileSelectionPresented = false
    @State private var isUserSettingsPresented = false

    @StateObject private var sessionCoordinator: AppSessionCoordinator
    private let authenticationViewModel: AuthenticationViewModel
    private let homeAPIClient: HomeAPIProviding
    private let documentsAPIClient: DocumentsAPIProviding
    private let documentIntakeAPIClient: DocumentIntakeAPIProviding
    private let requestsAPIClient: RequestsAPIProviding
    private let notaryProfileAPIClient: NotaryProfileAPIProviding

    init(
        authenticationViewModel: AuthenticationViewModel? = nil,
        sessionCoordinator: AppSessionCoordinator? = nil,
        homeAPIClient: HomeAPIProviding? = nil,
        documentsAPIClient: DocumentsAPIProviding? = nil,
        documentIntakeAPIClient: DocumentIntakeAPIProviding? = nil,
        requestsAPIClient: RequestsAPIProviding? = nil,
        notaryProfileAPIClient: NotaryProfileAPIProviding? = nil
    ) {
        let dependencies = AppRootView.makeAuthDependencies()
        self.authenticationViewModel = authenticationViewModel ?? AuthenticationViewModel(
            apiClient: dependencies.apiClient,
            sessionStore: dependencies.sessionStore
        )
        self.homeAPIClient = homeAPIClient ?? dependencies.homeAPIClient
        self.documentsAPIClient = documentsAPIClient ?? dependencies.documentsAPIClient
        self.documentIntakeAPIClient = documentIntakeAPIClient ?? dependencies.documentIntakeAPIClient
        self.requestsAPIClient = requestsAPIClient ?? dependencies.requestsAPIClient
        self.notaryProfileAPIClient = notaryProfileAPIClient ?? dependencies.notaryProfileAPIClient
        _sessionCoordinator = StateObject(
            wrappedValue: sessionCoordinator ?? AppSessionCoordinator(
                apiClient: dependencies.apiClient,
                sessionStore: dependencies.sessionStore
            )
        )
    }

    var body: some View {
        Group {
            switch launchPhase {
            case .onboarding:
                OnboardingFlowView {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        launchPhase = .authentication
                    }
                }
            case .authentication:
                AuthenticationSignInView(content: .signIn, viewModel: authenticationViewModel) {
                    _ = sessionCoordinator.acceptAuthenticatedSession(authenticationViewModel.verifiedSession)
                    withAnimation(.easeInOut(duration: 0.25)) {
                        launchPhase = .signedIn
                    }
                }
            case .signedIn:
                signedInShell
            }
        }
        .task {
            await restoreSessionOnLaunchIfNeeded()
        }
    }

    private var signedInShell: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                signedInTabContent

                if isProfileSelectionPresented {
                    ProfileTypeSelectionView(
                        session: sessionCoordinator.currentSession,
                        onBack: hideProfileSelection,
                        onSelectRole: switchProfileRole,
                        onBecomeIlluminotary: {}
                    )
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .scale(scale: 0.985, anchor: .topTrailing)),
                        removal: .opacity.combined(with: .scale(scale: 1.01, anchor: .topTrailing))
                    ))
                    .zIndex(10)
                }

                if isUserSettingsPresented {
                    UserSettingsView(
                        session: sessionCoordinator.currentSession,
                        onBack: hideUserSettings,
                        onSignOut: signOut,
                        onSavePersonalInfo: savePersonalInfo
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black.ignoresSafeArea())
                    .transition(.opacity)
                    .zIndex(20)
                }
            }
            .animation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.42), value: isProfileSelectionPresented)
            .animation(.easeInOut(duration: 0.32), value: isUserSettingsPresented)
            .navigationDestination(item: $intakeRoute) { route in
                ProductIntakeFlowView(
                    session: sessionCoordinator.currentSession,
                    productModeKey: route.modeKey,
                    draftDocumentId: route.draftDocumentId,
                    apiClient: documentIntakeAPIClient
                ) { documentId in
                    reviewRoute = DocumentReviewRoute(documentId: documentId)
                }
                .onDisappear {
                    selectedProductModeKey = nil
                }
            }
            .navigationDestination(item: $reviewRoute) { route in
                DocumentReviewView(
                    session: sessionCoordinator.currentSession,
                    documentId: route.documentId,
                    apiClient: documentIntakeAPIClient,
                    onSavedToDraft: {
                        selectedProductModeKey = nil
                        intakeRoute = nil
                        reviewRoute = nil
                    },
                    onContinueToSign: { documentId in
                        signingRoute = DocumentSigningRoute(documentId: documentId)
                    },
                    onContinueWithoutSignature: { documentId in
                        signingRoute = DocumentSigningRoute(documentId: documentId, skipSignatureForNotarization: true)
                    }
                )
                    .onDisappear {
                        selectedProductModeKey = nil
                        intakeRoute = nil
                    }
            }
            .navigationDestination(item: $notaryReviewRoute) { route in
                NotaryRequestReviewView(
                    session: sessionCoordinator.currentSession,
                    requestId: route.requestId,
                    apiClient: notaryProfileAPIClient,
                    onDecisionRecorded: {
                        selectedTab = .home
                        notaryReviewRoute = nil
                    }
                )
            }
            .navigationDestination(item: $signingRoute) { route in
                DocumentSigningView(
                    session: sessionCoordinator.currentSession,
                    documentId: route.documentId,
                    skipSignatureForNotarization: route.skipSignatureForNotarization,
                    apiClient: documentIntakeAPIClient
                )
                    .onDisappear {
                        selectedProductModeKey = nil
                        intakeRoute = nil
                        reviewRoute = nil
                    }
            }
        }
    }

    @ViewBuilder
    private var signedInTabContent: some View {
        switch selectedTab {
        case .home:
            if MobileProfileRole.activeRole(for: sessionCoordinator.currentSession?.user) == .notary {
                NotaryProfileView(
                    session: sessionCoordinator.currentSession,
                    viewModel: NotaryProfileViewModel(apiClient: notaryProfileAPIClient),
                    onProfileAction: showProfileSelection,
                    onSettingsAction: showUserSettings,
                    onReviewRequest: openNotaryReview
                )
            } else {
                HomeView(
                    session: sessionCoordinator.currentSession,
                    viewModel: HomeViewModel(apiClient: homeAPIClient),
                    selectedProductModeKey: $selectedProductModeKey,
                    selectedTab: $selectedTab,
                    onProductSelected: beginProductIntake,
                    onProfileAction: showProfileSelection,
                    onSettingsAction: showUserSettings
                )
            }
        case .documents:
            DocumentsView(
                session: sessionCoordinator.currentSession,
                selectedTab: $selectedTab,
                viewModel: DocumentsViewModel(apiClient: documentsAPIClient),
                onDocumentSelected: openDocument
            )
        case .requests:
            RequestsView(
                session: sessionCoordinator.currentSession,
                selectedTab: $selectedTab,
                viewModel: RequestsViewModel(apiClient: requestsAPIClient),
                onOpenDocument: { documentId in
                    signingRoute = DocumentSigningRoute(documentId: documentId)
                }
            )
        case .generator:
            PlaceholderScreen(section: .documentGenerator)
        case .notary:
            NotaryProfileView(
                session: sessionCoordinator.currentSession,
                viewModel: NotaryProfileViewModel(apiClient: notaryProfileAPIClient),
                onProfileAction: showProfileSelection,
                onSettingsAction: showUserSettings,
                onReviewRequest: openNotaryReview
            )
        }
    }

    @MainActor
    private func restoreSessionOnLaunchIfNeeded() async {
        guard didAttemptSessionRestore == false else {
            return
        }

        didAttemptSessionRestore = true

        switch await sessionCoordinator.restoreSessionOnLaunch() {
        case .noStoredSession:
            break
        case .restored:
            withAnimation(.easeInOut(duration: 0.25)) {
                launchPhase = .signedIn
            }
        case .clearedStoredSession:
            withAnimation(.easeInOut(duration: 0.25)) {
                launchPhase = .authentication
            }
        }
    }

    private func signOut() {
        Task {
            _ = await sessionCoordinator.signOut()
            authenticationViewModel.clearChallenge()
            selectedTab = .home
            selectedProductModeKey = nil
            intakeRoute = nil
            reviewRoute = nil
            signingRoute = nil
            notaryReviewRoute = nil
            isProfileSelectionPresented = false
            isUserSettingsPresented = false

            withAnimation(.easeInOut(duration: 0.25)) {
                launchPhase = .authentication
            }
        }
    }

    private func showUserSettings() {
        isUserSettingsPresented = true
    }

    private func hideUserSettings() {
        isUserSettingsPresented = false
    }

    private func savePersonalInfo(_ input: PersonalInfoSaveInput) async throws {
        try await sessionCoordinator.updatePersonalInfo(
            AuthPersonalInfoUpdateRequest(
                firstName: input.firstName,
                lastName: input.lastName,
                email: input.email,
                phone: input.phone,
                address: input.address
            ),
            password: input.password
        )
    }

    private func showProfileSelection() {
        isProfileSelectionPresented = true
    }

    private func hideProfileSelection() {
        isProfileSelectionPresented = false
    }

    private func switchProfileRole(_ role: MobileProfileRole) {
        let sessionRole = role.sessionRoleValue(for: sessionCoordinator.currentSession?.user)

        Task {
            guard await sessionCoordinator.switchActiveRole(to: sessionRole) else {
                return
            }

            selectedTab = .home
            selectedProductModeKey = nil
            intakeRoute = nil
            reviewRoute = nil
            signingRoute = nil
            notaryReviewRoute = nil
            isProfileSelectionPresented = false
        }
    }

    private func beginProductIntake(_ card: HomeProductCard) {
        selectedProductModeKey = nil
        intakeRoute = ProductIntakeRoute(modeKey: card.modeKey)
    }

    private func openDocument(_ document: DocumentsListItem) {
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = nil

        let targetPath = document.nextAction?.targetPath.lowercased() ?? ""
        let status = document.status?.lowercased() ?? ""
        let actionCode = document.nextAction?.code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let intakeStatus = document.intakeStatus?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""

        if actionCode == "complete_intake" || targetPath.contains("/app/start") || intakeStatus == "draft" || status == "draft" || status.contains("intake") {
            intakeRoute = ProductIntakeRoute(
                modeKey: intakeModeKey(for: document),
                draftDocumentId: document.id
            )
            return
        }

        if targetPath.contains("/app/sign") || status.contains("sign") || status.contains("notary") || status.contains("complete") || status.contains("final") {
            signingRoute = DocumentSigningRoute(
                documentId: document.id,
                skipSignatureForNotarization: DocumentsDisplay.canContinueWithoutSignature(for: document)
            )
        } else {
            reviewRoute = DocumentReviewRoute(documentId: document.id)
        }
    }

    private func openNotaryReview(_ request: NotaryQueueRequestSummary) {
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = NotaryRequestReviewRoute(requestId: request.request.id)
    }

    private func intakeModeKey(for document: DocumentsListItem) -> String {
        let modeKey = document.productFlowMode?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if modeKey.isEmpty == false {
            return modeKey
        }

        switch DocumentsDisplay.productKind(for: document) {
        case .trust:
            return "trust_bundle"
        case .notarization:
            return "notarize_document"
        case .poa, .none:
            return "poa_only"
        }
    }

    private static func makeAuthDependencies() -> (
        apiClient: AuthAPIProviding,
        homeAPIClient: HomeAPIProviding,
        documentsAPIClient: DocumentsAPIProviding,
        documentIntakeAPIClient: DocumentIntakeAPIProviding,
        requestsAPIClient: RequestsAPIProviding,
        notaryProfileAPIClient: NotaryProfileAPIProviding,
        sessionStore: AuthSessionStore
    ) {
        if ProcessInfo.processInfo.environment["DARCI_MOCK_AUTH"] == "1" {
            let storedSession = ProcessInfo.processInfo.environment["DARCI_MOCK_AUTH_RESTORE"] == "1"
                ? MockAuthAPIClient.mockSession()
                : nil
            return (
                MockAuthAPIClient(),
                MockHomeAPIClient(),
                MockDocumentsAPIClient(),
                MockDocumentIntakeAPIClient(),
                MockRequestsAPIClient(),
                MockNotaryProfileAPIClient(),
                InMemoryAuthSessionStore(session: storedSession)
            )
        }

        return (AuthAPIClient(), HomeAPIClient(), DocumentsAPIClient(), DocumentIntakeAPIClient(), RequestsAPIClient(), NotaryProfileAPIClient(), KeychainAuthSessionStore())
    }
}

struct DocumentReviewRoute: Identifiable, Hashable {
    let documentId: String

    var id: String { documentId }
}

struct DocumentSigningRoute: Identifiable, Hashable {
    let documentId: String
    var skipSignatureForNotarization = false

    var id: String { "\(documentId)-\(skipSignatureForNotarization)" }
}

struct NotaryRequestReviewRoute: Identifiable, Hashable {
    let requestId: String

    var id: String { requestId }
}

private struct PlaceholderScreen: View {
    let section: AppSection

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: section.systemImage)
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(DARCiTheme.accent)

            Text(section.title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(DARCiTheme.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DARCiTheme.background.ignoresSafeArea())
        .navigationTitle(section.title)
    }
}

#Preview {
    AppRootView()
}
