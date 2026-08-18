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
                let session = await restoredSession(from: refreshed.session, storedSession: storedSession)
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
    func switchActiveRole(to role: String) async -> Bool {
        guard let currentSession, currentSession.user.canUseActiveRole(role) else {
            return false
        }

        let response: AuthUserResponse
        do {
            response = try await apiClient.switchActiveRole(role, accessToken: currentSession.accessToken)
        } catch {
            return false
        }

        let session = AuthSession(
            accessToken: currentSession.accessToken,
            refreshToken: currentSession.refreshToken,
            user: response.user
        ).normalizedForMobileProfile()
        self.currentSession = session

        do {
            try sessionStore.save(session)
            return true
        } catch {
            return false
        }
    }

    @discardableResult
    func acceptAuthenticatedSession(_ session: AuthSession?) -> Bool {
        guard let session else {
            return false
        }

        let normalizedSession = session.normalizedForMobileProfile()
        currentSession = normalizedSession

        do {
            try sessionStore.save(normalizedSession)
            return true
        } catch {
            return false
        }
    }

    func refreshCurrentSession() async -> AuthSession? {
        guard let currentSession else {
            return nil
        }

        do {
            let refreshed = try await apiClient.refresh(refreshToken: currentSession.refreshToken)
            let session = await restoredSession(from: refreshed.session, storedSession: currentSession)
            try sessionStore.save(session)
            self.currentSession = session
            return session
        } catch {
            try? sessionStore.clear()
            self.currentSession = nil
            return nil
        }
    }

    func updatePersonalInfo(_ profile: AuthPersonalInfoUpdateRequest, password: String?) async throws {
        guard let currentSession else {
            throw AuthAPIError.unauthorized(message: "Your session has expired. Sign in again.")
        }

        let profileResponse = try await apiClient.updatePersonalInfo(
            profile,
            accessToken: currentSession.accessToken
        )
        var updatedSession = AuthSession(
            accessToken: currentSession.accessToken,
            refreshToken: currentSession.refreshToken,
            user: profileResponse.user
        ).normalizedForMobileProfile()
        try sessionStore.save(updatedSession)
        self.currentSession = updatedSession

        if let password, password.isEmpty == false {
            let passwordResponse = try await apiClient.resetPassword(
                password,
                refreshToken: updatedSession.refreshToken,
                accessToken: updatedSession.accessToken
            )
            updatedSession = passwordResponse.session.normalizedForMobileProfile()
            try sessionStore.save(updatedSession)
            self.currentSession = updatedSession
        }
    }

    func deleteAccount() async throws {
        guard let currentSession else {
            throw AuthAPIError.unauthorized(message: "Your session has expired. Sign in again.")
        }

        _ = try await apiClient.deleteAccount(accessToken: currentSession.accessToken)
        self.currentSession = nil
        try sessionStore.clear()
    }

    @discardableResult
    func signOut() async -> Bool {
        let session = currentSession

        if let session {
            try? await apiClient.logout(refreshToken: session.refreshToken, accessToken: session.accessToken)
        }

        currentSession = nil

        do {
            try sessionStore.clear()
            return true
        } catch {
            return false
        }
    }

    private func restoredSession(from refreshedSession: AuthSession, storedSession: AuthSession) async -> AuthSession {
        let serverSession = refreshedSession.normalizedForMobileProfile()

        guard let storedRole = storedSession.user.role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              AuthenticatedUser.isMobileProfileRole(storedRole),
              refreshedSession.user.canUseActiveRole(storedRole),
              storedRole != refreshedSession.user.role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        else {
            return serverSession
        }

        do {
            let response = try await apiClient.switchActiveRole(storedRole, accessToken: refreshedSession.accessToken)
            return AuthSession(
                accessToken: refreshedSession.accessToken,
                refreshToken: refreshedSession.refreshToken,
                user: response.user
            ).normalizedForMobileProfile()
        } catch {
            return serverSession
        }
    }
}

private extension AuthSession {
    func normalizedForMobileProfile() -> AuthSession {
        guard AuthenticatedUser.isMobileProfileRole(user.role) == false, let role = user.defaultMobileProfileRole else {
            return self
        }

        return withActiveRole(role)
    }

    func withActiveRole(_ role: String) -> AuthSession {
        AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            user: user.withActiveRole(role)
        )
    }
}

private extension AuthenticatedUser {
    static func isMobileProfileRole(_ role: String?) -> Bool {
        switch role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "member", "pro", "notary":
            return true
        default:
            return false
        }
    }

    var defaultMobileProfileRole: String? {
        let normalizedAvailableRoles = (availableRoles ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { $0.isEmpty == false }

        if normalizedAvailableRoles.contains("member") { return "member" }
        if normalizedAvailableRoles.contains("pro") { return "pro" }
        if normalizedAvailableRoles.contains("notary") { return "notary" }
        return nil
    }

    func canUseActiveRole(_ role: String) -> Bool {
        let normalizedRole = role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard normalizedRole.isEmpty == false else { return false }

        let normalizedAvailableRoles = Set((availableRoles ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { $0.isEmpty == false })

        if normalizedAvailableRoles.isEmpty {
            return normalizedRole == "member" || normalizedRole == "pro"
        }

        return normalizedAvailableRoles.contains(normalizedRole)
    }

    func withActiveRole(_ role: String) -> AuthenticatedUser {
        AuthenticatedUser(
            id: id,
            email: email,
            phone: phone,
            role: role,
            availableRoles: availableRoles,
            status: status,
            firstName: firstName,
            lastName: lastName,
            emailConfirmedAt: emailConfirmedAt,
            phoneConfirmedAt: phoneConfirmedAt,
            lastSignInAt: lastSignInAt,
            lastAuthSyncedAt: lastAuthSyncedAt
        )
    }
}