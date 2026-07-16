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
    @State private var selectedProductModeKey: String?
    @State private var intakeRoute: ProductIntakeRoute?
    @State private var reviewRoute: DocumentReviewRoute?
    @State private var signingRoute: DocumentSigningRoute?

    @StateObject private var sessionCoordinator: AppSessionCoordinator
    private let authenticationViewModel: AuthenticationViewModel
    private let homeAPIClient: HomeAPIProviding
    private let documentIntakeAPIClient: DocumentIntakeAPIProviding

    init(
        authenticationViewModel: AuthenticationViewModel? = nil,
        sessionCoordinator: AppSessionCoordinator? = nil,
        homeAPIClient: HomeAPIProviding? = nil,
        documentIntakeAPIClient: DocumentIntakeAPIProviding? = nil
    ) {
        let dependencies = AppRootView.makeAuthDependencies()
        self.authenticationViewModel = authenticationViewModel ?? AuthenticationViewModel(
            apiClient: dependencies.apiClient,
            sessionStore: dependencies.sessionStore
        )
        self.homeAPIClient = homeAPIClient ?? dependencies.homeAPIClient
        self.documentIntakeAPIClient = documentIntakeAPIClient ?? dependencies.documentIntakeAPIClient
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
            HomeView(
                session: sessionCoordinator.currentSession,
                viewModel: HomeViewModel(apiClient: homeAPIClient),
                selectedProductModeKey: $selectedProductModeKey,
                onProductSelected: beginProductIntake,
                onProfileAction: signOut
            )
            .navigationDestination(item: $intakeRoute) { route in
                ProductIntakeFlowView(
                    session: sessionCoordinator.currentSession,
                    productModeKey: route.modeKey,
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
                    }
                )
                    .onDisappear {
                        selectedProductModeKey = nil
                        intakeRoute = nil
                    }
            }
            .navigationDestination(item: $signingRoute) { route in
                DocumentSigningView(
                    session: sessionCoordinator.currentSession,
                    documentId: route.documentId,
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
        _ = sessionCoordinator.signOut()
        authenticationViewModel.clearChallenge()
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil

        withAnimation(.easeInOut(duration: 0.25)) {
            launchPhase = .authentication
        }
    }

    private func beginProductIntake(_ card: HomeProductCard) {
        selectedProductModeKey = nil
        intakeRoute = ProductIntakeRoute(modeKey: card.modeKey)
    }

    private static func makeAuthDependencies() -> (
        apiClient: AuthAPIProviding,
        homeAPIClient: HomeAPIProviding,
        documentIntakeAPIClient: DocumentIntakeAPIProviding,
        sessionStore: AuthSessionStore
    ) {
        if ProcessInfo.processInfo.environment["DARCI_MOCK_AUTH"] == "1" {
            let storedSession = ProcessInfo.processInfo.environment["DARCI_MOCK_AUTH_RESTORE"] == "1"
                ? MockAuthAPIClient.mockSession()
                : nil
            return (
                MockAuthAPIClient(),
                MockHomeAPIClient(),
                MockDocumentIntakeAPIClient(),
                InMemoryAuthSessionStore(session: storedSession)
            )
        }

        return (AuthAPIClient(), HomeAPIClient(), DocumentIntakeAPIClient(), KeychainAuthSessionStore())
    }
}

struct DocumentReviewRoute: Identifiable, Hashable {
    let documentId: String

    var id: String { documentId }
}

struct DocumentSigningRoute: Identifiable, Hashable {
    let documentId: String

    var id: String { documentId }
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
