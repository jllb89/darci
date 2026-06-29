import Foundation

enum AppSessionRestorationResult: Equatable {
    case noStoredSession
    case restored(AuthSession)
    case clearedStoredSession
}

@MainActor
final class AppSessionCoordinator: ObservableObject {
    @Published private(set) var currentSession: AuthSession?

    private let apiClient: AuthAPIProviding
    private let sessionStore: AuthSessionStore

    init(apiClient: AuthAPIProviding = AuthAPIClient(), sessionStore: AuthSessionStore = KeychainAuthSessionStore()) {
        self.apiClient = apiClient
        self.sessionStore = sessionStore
    }

    func restoreSessionOnLaunch() async -> AppSessionRestorationResult {
        do {
            guard let storedSession = try sessionStore.load() else {
                currentSession = nil
                return .noStoredSession
            }

            do {
                let refreshed = try await apiClient.refresh(refreshToken: storedSession.refreshToken)
                let session = refreshed.session
                try sessionStore.save(session)
                currentSession = session
                return .restored(session)
            } catch {
                try? sessionStore.clear()
                currentSession = nil
                return .clearedStoredSession
            }
        } catch {
            try? sessionStore.clear()
            currentSession = nil
            return .clearedStoredSession
        }
    }

    @discardableResult
    func acceptAuthenticatedSession(_ session: AuthSession?) -> Bool {
        guard let session else {
            return false
        }

        currentSession = session

        do {
            try sessionStore.save(session)
            return true
        } catch {
            return false
        }
    }

    @discardableResult
    func signOut() -> Bool {
        currentSession = nil

        do {
            try sessionStore.clear()
            return true
        } catch {
            return false
        }
    }
}