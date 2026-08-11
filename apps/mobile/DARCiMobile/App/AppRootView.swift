import Combine
import SwiftUI
import UIKit

enum AppLaunchPhase: Equatable {
    case onboarding
    case authentication
    case signedIn

    static let initial: AppLaunchPhase = .onboarding
}

struct AppRootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var launchPhase = AppLaunchPhase.initial
    @State private var didAttemptSessionRestore = false
    @State private var selectedTab: AppTab = .home
    @State private var selectedProductModeKey: String?
    @State private var intakeRoute: ProductIntakeRoute?
    @State private var reviewRoute: DocumentReviewRoute?
    @State private var signingRoute: DocumentSigningRoute?
    @State private var notaryReviewRoute: NotaryRequestReviewRoute?
    @State private var notarySessionRoute: NotaryInPersonSessionRoute?
    @State private var memberSessionRoute: MemberInPersonSessionRoute?
    @State private var pendingMemberSessionRoute: MemberInPersonSessionRoute?
    @State private var pendingPushRoute: PushNotificationRoute?
    @State private var isProfileSelectionPresented = false
    @State private var isUserSettingsPresented = false
    @State private var isPushPermissionPromptPresented = false
    @State private var homeBannerMessage: String?

    @StateObject private var sessionCoordinator: AppSessionCoordinator
    @ObservedObject private var pushCoordinator: PushNotificationCoordinator
    private let authenticationViewModel: AuthenticationViewModel
    private let homeAPIClient: HomeAPIProviding
    private let documentsAPIClient: DocumentsAPIProviding
    private let documentIntakeAPIClient: DocumentIntakeAPIProviding
    private let requestsAPIClient: RequestsAPIProviding
    private let notaryProfileAPIClient: NotaryProfileAPIProviding

    init(
        authenticationViewModel: AuthenticationViewModel? = nil,
        sessionCoordinator: AppSessionCoordinator? = nil,
        pushCoordinator: PushNotificationCoordinator = PushNotificationCoordinator(),
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
        _pushCoordinator = ObservedObject(wrappedValue: pushCoordinator)
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
                    pushCoordinator.activate(session: sessionCoordinator.currentSession)
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
        .onOpenURL(perform: handleIncomingURL)
        .onReceive(pushCoordinator.$pendingRoute.compactMap { $0 }) { route in
            handleIncomingPushRoute(route)
            pushCoordinator.clearPendingRoute(route)
        }
        .onChange(of: launchPhase) { _, phase in
            guard phase == .signedIn else { return }
            pushCoordinator.activate(session: sessionCoordinator.currentSession)
            presentPushPermissionPromptIfEligible()
            openPendingMemberSessionIfPossible()
            openPendingPushRouteIfPossible()
        }
        .onChange(of: sessionCoordinator.currentSession) { _, session in
            pushCoordinator.activate(session: session)
            presentPushPermissionPromptIfEligible()
            openPendingPushRouteIfPossible()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await pushCoordinator.refreshPermissionAndSync() }
        }
        .sheet(isPresented: $isPushPermissionPromptPresented) {
            PushPermissionExplanationView(
                onContinue: {
                    isPushPermissionPromptPresented = false
                    Task { await pushCoordinator.requestAuthorizationFromPrompt() }
                },
                onDismiss: {
                    isPushPermissionPromptPresented = false
                }
            )
            .presentationDetents([.medium])
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()

                Button("Done") {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil
                    )
                }
            }
        }
    }

    private var signedInShell: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                signedInTabContent

                if let homeBannerMessage {
                    AppRootStatusBanner(message: homeBannerMessage)
                        .padding(.horizontal, 22)
                        .padding(.top, 18)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .zIndex(30)
                }

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
                        onSavePersonalInfo: savePersonalInfo,
                        notaryProfileAPIClient: notaryProfileAPIClient
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
                    presentPushPermissionPromptIfEligible()
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
                        presentPushPermissionPromptIfEligible()
                    },
                    onContinueWithoutSignature: { documentId in
                        signingRoute = DocumentSigningRoute(documentId: documentId, skipSignatureForNotarization: true)
                        presentPushPermissionPromptIfEligible()
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
                        presentPushPermissionPromptIfEligible()
                    }
                )
            }
            .navigationDestination(item: $notarySessionRoute) { route in
                NotaryInPersonSessionView(
                    session: sessionCoordinator.currentSession,
                    requestId: route.requestId,
                    apiClient: notaryProfileAPIClient
                )
            }
            .navigationDestination(item: $memberSessionRoute) { route in
                MemberInPersonSessionView(
                    session: sessionCoordinator.currentSession,
                    requestId: route.requestId,
                    apiClient: requestsAPIClient
                )
            }
            .navigationDestination(item: $signingRoute) { route in
                DocumentSigningView(
                    session: sessionCoordinator.currentSession,
                    documentId: route.documentId,
                    skipSignatureForNotarization: route.skipSignatureForNotarization,
                    onSentToSelectedNotary: { notaryName in
                        showHomeBanner(
                            notaryName.map { "Document sent to \($0)." }
                                ?? "Document sent to the selected notary."
                        )
                        selectedTab = .home
                        signingRoute = nil
                        reviewRoute = nil
                        intakeRoute = nil
                        selectedProductModeKey = nil
                        presentPushPermissionPromptIfEligible()
                    },
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
                    onReviewRequest: openNotaryReview,
                    onStartSession: openNotarySession
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
                onReviewRequest: openNotaryReview,
                onStartSession: openNotarySession,
                onViewCompletedDocument: openNotarySession
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
        case .restored(let session):
            pushCoordinator.activate(session: session)
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
            await pushCoordinator.deactivateForSignOut()
            _ = await sessionCoordinator.signOut()
            authenticationViewModel.clearChallenge()
            selectedTab = .home
            selectedProductModeKey = nil
            intakeRoute = nil
            reviewRoute = nil
            signingRoute = nil
            notaryReviewRoute = nil
            notarySessionRoute = nil
            memberSessionRoute = nil
            pendingMemberSessionRoute = nil
            pendingPushRoute = nil
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
            notarySessionRoute = nil
            memberSessionRoute = nil
            pendingMemberSessionRoute = nil
            isProfileSelectionPresented = false
        }
    }

    private func beginProductIntake(_ card: HomeProductCard) {
        selectedProductModeKey = nil
        intakeRoute = ProductIntakeRoute(modeKey: card.modeKey)
    }

    private func showHomeBanner(_ message: String) {
        withAnimation(.easeInOut(duration: 0.24)) {
            homeBannerMessage = message
        }

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            guard homeBannerMessage == message else { return }
            withAnimation(.easeInOut(duration: 0.24)) {
                homeBannerMessage = nil
            }
        }
    }

    private func openDocument(_ document: DocumentsListItem) {
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = nil
        notarySessionRoute = nil

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

    private func openNotarySession(_ request: NotaryQueueRequestSummary) {
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = nil
        notarySessionRoute = NotaryInPersonSessionRoute(requestId: request.request.id)
    }

    private func handleIncomingURL(_ url: URL) {
        guard let requestId = MemberSessionDeepLink.requestId(from: url) else { return }
        pendingMemberSessionRoute = MemberInPersonSessionRoute(requestId: requestId)
        openPendingMemberSessionIfPossible()
    }

    private func handleIncomingPushRoute(_ route: PushNotificationRoute) {
        pendingPushRoute = route
        openPendingPushRouteIfPossible()
    }

    private func openPendingMemberSessionIfPossible() {
        guard launchPhase == .signedIn,
              sessionCoordinator.currentSession != nil,
              let route = pendingMemberSessionRoute else {
            return
        }

        selectedTab = .requests
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = nil
        notarySessionRoute = nil
        memberSessionRoute = route
        pendingMemberSessionRoute = nil
        isProfileSelectionPresented = false
        isUserSettingsPresented = false
    }

    private func openPendingPushRouteIfPossible() {
        guard launchPhase == .signedIn,
              sessionCoordinator.currentSession != nil,
              let route = pendingPushRoute else {
            return
        }

        if case .notaryRequestReview = route,
           MobileProfileRole.activeRole(for: sessionCoordinator.currentSession?.user) != .notary {
            Task {
                guard await sessionCoordinator.switchActiveRole(to: "notary") else { return }
                openPushRoute(route)
            }
            return
        }

        openPushRoute(route)
    }

    private func openPushRoute(_ route: PushNotificationRoute) {
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = nil
        notarySessionRoute = nil
        memberSessionRoute = nil
        isProfileSelectionPresented = false
        isUserSettingsPresented = false

        switch route {
        case .memberSession(let requestId, _), .memberRequest(let requestId, _):
            selectedTab = .requests
            memberSessionRoute = MemberInPersonSessionRoute(requestId: requestId)
        case .notaryRequestReview(let requestId, _):
            selectedTab = .notary
            notaryReviewRoute = NotaryRequestReviewRoute(requestId: requestId)
        case .memberDocument(let documentId, _), .memberNotarySelection(let documentId, _), .documentSigning(let documentId, _):
            selectedTab = .documents
            signingRoute = DocumentSigningRoute(documentId: documentId)
        case .documentReview(let documentId, _):
            selectedTab = .documents
            reviewRoute = DocumentReviewRoute(documentId: documentId)
        case .userSettings:
            selectedTab = .home
            isUserSettingsPresented = true
        }

        pendingPushRoute = nil
    }

    private func presentPushPermissionPromptIfEligible() {
        guard pushCoordinator.shouldPresentPermissionPrompt else { return }
        pushCoordinator.markPermissionPromptPresented()
        isPushPermissionPromptPresented = true
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

private struct AppRootStatusBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 17, weight: .semibold))

            Text(message)
                .font(DARCiFont.maisonNeue(.book, size: 14))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(Color.black.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.16), radius: 18, x: 0, y: 10)
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

struct NotaryInPersonSessionRoute: Identifiable, Hashable {
    let requestId: String

    var id: String { requestId }
}

struct MemberInPersonSessionRoute: Identifiable, Hashable {
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

private struct PushPermissionExplanationView: View {
    let onContinue: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Capsule()
                .fill(Color.secondary.opacity(0.35))
                .frame(width: 40, height: 5)
                .frame(maxWidth: .infinity)

            VStack(alignment: .leading, spacing: 10) {
                Text("Stay current on time-sensitive updates")
                    .font(.title3.weight(.semibold))
                Text("DARCi can notify you when a request, signing step, or in-person session needs attention. Sensitive details stay inside the app.")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                Button("Not now", action: onDismiss)
                    .buttonStyle(.bordered)

                Button("Continue", action: onContinue)
                    .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(24)
    }
}

#Preview {
    AppRootView()
}
