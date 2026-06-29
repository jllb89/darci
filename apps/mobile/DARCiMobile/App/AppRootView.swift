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

    @StateObject private var sessionCoordinator: AppSessionCoordinator
    private let authenticationViewModel: AuthenticationViewModel
    private let homeAPIClient: HomeAPIProviding

    init(
        authenticationViewModel: AuthenticationViewModel? = nil,
        sessionCoordinator: AppSessionCoordinator? = nil,
        homeAPIClient: HomeAPIProviding? = nil
    ) {
        let dependencies = AppRootView.makeAuthDependencies()
        self.authenticationViewModel = authenticationViewModel ?? AuthenticationViewModel(
            apiClient: dependencies.apiClient,
            sessionStore: dependencies.sessionStore
        )
        self.homeAPIClient = homeAPIClient ?? dependencies.homeAPIClient
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
                onProfileAction: signOut
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
        _ = sessionCoordinator.signOut()
        authenticationViewModel.clearChallenge()

        withAnimation(.easeInOut(duration: 0.25)) {
            launchPhase = .authentication
        }
    }

    private static func makeAuthDependencies() -> (
        apiClient: AuthAPIProviding,
        homeAPIClient: HomeAPIProviding,
        sessionStore: AuthSessionStore
    ) {
        if ProcessInfo.processInfo.environment["DARCI_MOCK_AUTH"] == "1" {
            let storedSession = ProcessInfo.processInfo.environment["DARCI_MOCK_AUTH_RESTORE"] == "1"
                ? MockAuthAPIClient.mockSession()
                : nil
            return (MockAuthAPIClient(), MockHomeAPIClient(), InMemoryAuthSessionStore(session: storedSession))
        }

        return (AuthAPIClient(), HomeAPIClient(), KeychainAuthSessionStore())
    }
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
