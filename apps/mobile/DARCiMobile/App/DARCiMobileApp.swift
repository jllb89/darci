import SwiftUI

@main
struct DARCiMobileApp: App {
    @UIApplicationDelegateAdaptor(PushNotificationCoordinator.self) private var pushCoordinator

    init() {
        #if DEBUG
        if ProcessInfo.processInfo.environment["DARCI_MOCK_INTAKE_KEYBOARD"] != nil { return }
        if ProcessInfo.processInfo.environment["DARCI_MOCK_NOTARY_SELECTION"] != nil { return }
        #endif
        MobileAuthTelemetry.start()
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if ProcessInfo.processInfo.environment["DARCI_MOCK_INTAKE_KEYBOARD"] != nil {
                IntakeKeyboardRegressionScreen()
            } else if let size = ProcessInfo.processInfo.environment["DARCI_MOCK_NOTARY_SELECTION"] {
                NotarySelectionRegressionScreen()
                    .dynamicTypeSize(size == "accessibility" ? .accessibility5 : .large)
            } else {
                AppRootView(pushCoordinator: pushCoordinator)
            }
            #else
            AppRootView(pushCoordinator: pushCoordinator)
            #endif
        }
    }
}

#if DEBUG
private struct NotarySelectionRegressionScreen: View {
    @State private var submitted = false
    var body: some View {
        if submitted {
            Text("Notary submission complete").accessibilityIdentifier("notary-submission-complete")
        } else {
            DocumentSigningView(
                session: AuthSession(accessToken: "fixture", refreshToken: "fixture", user: AuthenticatedUser(
                    id: "fixture", email: "fixture@example.test", phone: nil, role: "member", availableRoles: ["member"], status: "active",
                    firstName: "Test", lastName: "Member", emailConfirmedAt: nil, phoneConfirmedAt: nil, lastSignInAt: nil, lastAuthSyncedAt: nil)),
                documentId: "fixture",
                onSentToSelectedNotary: { _ in submitted = true },
                apiClient: MockDocumentIntakeAPIClient(
                    signingStatus: "pending_notary",
                    availableNotaryCount: min(30, max(0, Int(ProcessInfo.processInfo.environment["DARCI_MOCK_NOTARY_COUNT"] ?? "1") ?? 1))
                )
            )
        }
    }
}
#endif
