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
    @Environment(\.openURL) private var openURL
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
    @State private var pendingInviteToken: String?
    @State private var isProfileSelectionPresented = false
    @State private var isUserSettingsPresented = false
    @State private var isNotificationCenterPresented = false
    @State private var shouldReturnToNotificationCenterAfterRoute = false
    @State private var isPushPermissionPromptPresented = false
    @State private var homeBannerMessage: String?
    @State private var memberBillingReturnEvent: MemberBillingReturn?
    @State private var settingsInitialContent: UserSettingsContentScreen?

    @StateObject private var sessionCoordinator: AppSessionCoordinator
    @StateObject private var notificationCenterViewModel: NotificationCenterViewModel
    @StateObject private var billingPresentationCoordinator: MemberBillingPresentationCoordinator
    @ObservedObject private var pushCoordinator: PushNotificationCoordinator
    private let authenticationViewModel: AuthenticationViewModel
    private let homeAPIClient: HomeAPIProviding
    private let documentsAPIClient: DocumentsAPIProviding
    private let documentIntakeAPIClient: DocumentIntakeAPIProviding
    private let requestsAPIClient: RequestsAPIProviding
    private let notaryProfileAPIClient: NotaryProfileAPIProviding
    private let memberBillingAPIClient: MemberBillingAPIProviding

    init(
        authenticationViewModel: AuthenticationViewModel? = nil,
        sessionCoordinator: AppSessionCoordinator? = nil,
        pushCoordinator: PushNotificationCoordinator = PushNotificationCoordinator(),
        homeAPIClient: HomeAPIProviding? = nil,
        documentsAPIClient: DocumentsAPIProviding? = nil,
        documentIntakeAPIClient: DocumentIntakeAPIProviding? = nil,
        requestsAPIClient: RequestsAPIProviding? = nil,
        notaryProfileAPIClient: NotaryProfileAPIProviding? = nil,
        memberBillingAPIClient: MemberBillingAPIProviding? = nil,
        notificationCenterAPIClient: NotificationCenterAPIProviding? = nil
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
        let resolvedMemberBillingAPIClient = memberBillingAPIClient ?? dependencies.memberBillingAPIClient
        self.memberBillingAPIClient = resolvedMemberBillingAPIClient
        _notificationCenterViewModel = StateObject(
            wrappedValue: NotificationCenterViewModel(apiClient: notificationCenterAPIClient ?? dependencies.notificationCenterAPIClient)
        )
        _sessionCoordinator = StateObject(
            wrappedValue: sessionCoordinator ?? AppSessionCoordinator(
                apiClient: dependencies.apiClient,
                sessionStore: dependencies.sessionStore
            )
        )
        _billingPresentationCoordinator = StateObject(
            wrappedValue: MemberBillingPresentationCoordinator(apiClient: resolvedMemberBillingAPIClient)
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
                    let accepted = sessionCoordinator.acceptAuthenticatedSession(authenticationViewModel.verifiedSession)
                    pushCoordinator.activate(session: sessionCoordinator.currentSession)
                    withAnimation(.easeInOut(duration: 0.25)) {
                        launchPhase = .signedIn
                    }
                    if accepted {
                        Task { await handleAuthenticatedMembershipEntry() }
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
            openPendingBillingReturnIfPossible()
            openPendingMemberSessionIfPossible()
            openPendingPushRouteIfPossible()
            Task {
                await openPendingInviteIfPossible()
                await notificationCenterViewModel.load(for: sessionCoordinator.currentSession)
            }
        }
        .onChange(of: sessionCoordinator.currentSession) { _, session in
            pushCoordinator.activate(session: session)
            openPendingBillingReturnIfPossible()
            openPendingPushRouteIfPossible()
            Task {
                await openPendingInviteIfPossible()
                await notificationCenterViewModel.load(for: session)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task {
                await pushCoordinator.refreshPermissionAndSync()
                await notificationCenterViewModel.load(for: sessionCoordinator.currentSession)
                if billingPresentationCoordinator.activePresentation == nil,
                   let session = sessionCoordinator.currentSession {
                    await billingPresentationCoordinator.refresh(session: session)
                }
            }
        }
        .fullScreenCover(isPresented: $isPushPermissionPromptPresented) {
            PushPermissionExplanationView(
                onContinue: {
                    isPushPermissionPromptPresented = false
                    Task { await pushCoordinator.requestAuthorizationFromPrompt() }
                },
                onDismiss: {
                    isPushPermissionPromptPresented = false
                }
            )
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
                        onDeleteAccount: deleteAccount,
                        onSavePersonalInfo: savePersonalInfo,
                        notaryProfileAPIClient: notaryProfileAPIClient,
                        initialContent: settingsInitialContent,
                        onMembershipBilling: showMembershipFromSettings
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black.ignoresSafeArea())
                    .transition(.opacity)
                    .zIndex(20)
                }

                if isNotificationCenterPresented {
                    NotificationCenterView(
                        session: sessionCoordinator.currentSession,
                        viewModel: notificationCenterViewModel,
                        onBack: hideNotificationCenter,
                        onOpenRoute: openRouteFromNotificationCenter
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(.opacity)
                    .zIndex(25)
                }

                if let presentation = billingPresentationCoordinator.activePresentation,
                   let session = sessionCoordinator.currentSession {
                    MemberBillingView(
                        session: session,
                        apiClient: memberBillingAPIClient,
                        refreshSession: { await sessionCoordinator.refreshCurrentSession() },
                        returnEvent: presentation.returnEvent,
                        onMembershipUpdated: handleMembershipUpdate,
                        onBack: dismissMembership,
                        onShowTerms: { showSettingsContentFromMembership(.terms) },
                        onShowPrivacy: { showSettingsContentFromMembership(.privacy) },
                        onContactSupport: contactMembershipSupport
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(.opacity)
                    .zIndex(40)
                }
            }
            .animation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.42), value: isProfileSelectionPresented)
            .animation(.easeInOut(duration: 0.32), value: isUserSettingsPresented)
            .animation(.easeInOut(duration: 0.28), value: isNotificationCenterPresented)
            .animation(.easeInOut(duration: 0.24), value: billingPresentationCoordinator.activePresentation?.id)
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
                        shouldReturnToNotificationCenterAfterRoute = false
                        selectedProductModeKey = nil
                        intakeRoute = nil
                        reviewRoute = nil
                    },
                    onContinueToSign: { documentId in
                        shouldReturnToNotificationCenterAfterRoute = false
                        signingRoute = DocumentSigningRoute(documentId: documentId)
                        presentPushPermissionPromptIfEligible()
                    },
                    onContinueWithoutSignature: { documentId in
                        shouldReturnToNotificationCenterAfterRoute = false
                        signingRoute = DocumentSigningRoute(documentId: documentId, skipSignatureForNotarization: true)
                        presentPushPermissionPromptIfEligible()
                    }
                )
                    .onDisappear {
                        selectedProductModeKey = nil
                        intakeRoute = nil
                        maybeReturnToNotificationCenterAfterRoute()
                    }
            }
            .navigationDestination(item: $notaryReviewRoute) { route in
                NotaryRequestReviewView(
                    session: sessionCoordinator.currentSession,
                    requestId: route.requestId,
                    apiClient: notaryProfileAPIClient,
                    onDecisionRecorded: {
                        shouldReturnToNotificationCenterAfterRoute = false
                        selectedTab = .home
                        notaryReviewRoute = nil
                        presentPushPermissionPromptIfEligible()
                    }
                )
                .onDisappear(perform: maybeReturnToNotificationCenterAfterRoute)
            }
            .navigationDestination(item: $notarySessionRoute) { route in
                NotaryInPersonSessionView(
                    session: sessionCoordinator.currentSession,
                    requestId: route.requestId,
                    apiClient: notaryProfileAPIClient
                )
                .onDisappear(perform: maybeReturnToNotificationCenterAfterRoute)
            }
            .navigationDestination(item: $memberSessionRoute) { route in
                MemberInPersonSessionView(
                    session: sessionCoordinator.currentSession,
                    requestId: route.requestId,
                    apiClient: requestsAPIClient
                )
                .onDisappear(perform: maybeReturnToNotificationCenterAfterRoute)
            }
            .navigationDestination(item: $signingRoute) { route in
                DocumentSigningView(
                    session: sessionCoordinator.currentSession,
                    documentId: route.documentId,
                    skipSignatureForNotarization: route.skipSignatureForNotarization,
                    onSentToSelectedNotary: { notaryName in
                        shouldReturnToNotificationCenterAfterRoute = false
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
                        maybeReturnToNotificationCenterAfterRoute()
                    }
            }
        }
    }

    private var hasPriorityMembershipRoute: Bool {
        memberBillingReturnEvent != nil
            || pendingInviteToken != nil
            || pendingMemberSessionRoute != nil
            || pendingPushRoute != nil
            || intakeRoute != nil
            || reviewRoute != nil
            || signingRoute != nil
            || notaryReviewRoute != nil
            || notarySessionRoute != nil
            || memberSessionRoute != nil
            || isNotificationCenterPresented
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
                    onSettingsAction: showUserSettings,
                    hasUnreadNotifications: notificationCenterViewModel.hasUnreadNotifications,
                    onNotificationsAction: showNotificationCenter,
                    membershipPrompt: billingPresentationCoordinator.homePrompt,
                    onMembershipAction: {
                        billingPresentationCoordinator.presentFromHome(session: sessionCoordinator.currentSession)
                    }
                )
            }
        case .documents:
            DocumentsView(
                session: sessionCoordinator.currentSession,
                selectedTab: $selectedTab,
                viewModel: DocumentsViewModel(apiClient: documentsAPIClient),
                refreshSession: { await sessionCoordinator.refreshCurrentSession() },
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
            await billingPresentationCoordinator.handleRestoredSession(session)
        case .clearedStoredSession:
            withAnimation(.easeInOut(duration: 0.25)) {
                launchPhase = .authentication
            }
        }
    }

    @MainActor
    private func handleAuthenticatedMembershipEntry() async {
        guard let session = sessionCoordinator.currentSession else { return }
        openPendingBillingReturnIfPossible()
        await billingPresentationCoordinator.handleAuthenticatedEntry(
            session: session,
            hasPriorityRoute: hasPriorityMembershipRoute
        )
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
            pendingInviteToken = nil
            isProfileSelectionPresented = false
            isUserSettingsPresented = false
            isNotificationCenterPresented = false
            settingsInitialContent = nil
            memberBillingReturnEvent = nil
            billingPresentationCoordinator.reset()

            withAnimation(.easeInOut(duration: 0.25)) {
                launchPhase = .authentication
            }
        }
    }

    private func deleteAccount() async throws {
        await pushCoordinator.deactivateForSignOut()
        try await sessionCoordinator.deleteAccount()
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
        pendingInviteToken = nil
        isProfileSelectionPresented = false
        isUserSettingsPresented = false
        isNotificationCenterPresented = false
        settingsInitialContent = nil
        memberBillingReturnEvent = nil
        billingPresentationCoordinator.reset()

        withAnimation(.easeInOut(duration: 0.25)) {
            launchPhase = .authentication
        }
    }

    private func showUserSettings() {
        isNotificationCenterPresented = false
        settingsInitialContent = nil
        isUserSettingsPresented = true
    }

    private func hideUserSettings() {
        isUserSettingsPresented = false
        settingsInitialContent = nil
    }

    private func showMembershipFromSettings() {
        isUserSettingsPresented = false
        settingsInitialContent = nil
        billingPresentationCoordinator.presentFromSettings(session: sessionCoordinator.currentSession)
    }

    private func dismissMembership() {
        memberBillingReturnEvent = nil
        billingPresentationCoordinator.dismiss()
    }

    private func handleMembershipUpdate(_ payload: MemberMembershipPayload) {
        guard let modeKey = billingPresentationCoordinator.recordMembershipUpdate(payload) else { return }
        memberBillingReturnEvent = nil
        selectedProductModeKey = nil
        intakeRoute = ProductIntakeRoute(modeKey: modeKey)
    }

    private func showSettingsContentFromMembership(_ content: UserSettingsContentScreen) {
        memberBillingReturnEvent = nil
        billingPresentationCoordinator.dismiss(recordDismissal: false)
        settingsInitialContent = content
        isNotificationCenterPresented = false
        isUserSettingsPresented = true
    }

    private func contactMembershipSupport() {
        guard let url = URL(string: "mailto:support@illuminote.io?subject=DARCi%20membership%20support") else { return }
        openURL(url)
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
        isNotificationCenterPresented = false
        isProfileSelectionPresented = true
    }

    private func hideProfileSelection() {
        isProfileSelectionPresented = false
    }

    private func showNotificationCenter() {
        isProfileSelectionPresented = false
        isUserSettingsPresented = false
        isNotificationCenterPresented = true
        Task { await notificationCenterViewModel.load(for: sessionCoordinator.currentSession) }
    }

    private func hideNotificationCenter() {
        isNotificationCenterPresented = false
    }

    private func openRouteFromNotificationCenter(_ route: PushNotificationRoute) {
        shouldReturnToNotificationCenterAfterRoute = true
        pendingPushRoute = route
        openPendingPushRouteIfPossible()
    }

    private func maybeReturnToNotificationCenterAfterRoute() {
        guard shouldReturnToNotificationCenterAfterRoute else { return }

        shouldReturnToNotificationCenterAfterRoute = false
        selectedTab = .home
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = nil
        notarySessionRoute = nil
        memberSessionRoute = nil

        guard launchPhase == .signedIn, isProfileSelectionPresented == false, isUserSettingsPresented == false else { return }
        isNotificationCenterPresented = true
        Task { await notificationCenterViewModel.load(for: sessionCoordinator.currentSession) }
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
            await billingPresentationCoordinator.handleRoleChange(sessionCoordinator.currentSession)
        }
    }

    private func beginProductIntake(_ card: HomeProductCard) {
        Task { @MainActor in
            let decision = await billingPresentationCoordinator.requestProductCreation(
                modeKey: card.modeKey,
                session: sessionCoordinator.currentSession
            )
            selectedProductModeKey = nil
            if decision == .allowed {
                intakeRoute = ProductIntakeRoute(modeKey: card.modeKey)
            }
        }
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
        if let billingResult = MemberBillingDeepLink.result(from: url) {
            memberBillingReturnEvent = MemberBillingReturn(result: billingResult)
            openPendingBillingReturnIfPossible()
            return
        }

        if let inviteToken = MemberDocumentDeepLink.inviteToken(from: url) {
            suspendMembershipForPriorityRoute()
            pendingInviteToken = inviteToken
            Task { await openPendingInviteIfPossible() }
            return
        }

        if let route = MemberDocumentDeepLink.route(from: url) {
            suspendMembershipForPriorityRoute()
            pendingPushRoute = route
            openPendingPushRouteIfPossible()
            return
        }

        guard let requestId = MemberSessionDeepLink.requestId(from: url) else { return }
        suspendMembershipForPriorityRoute()
        pendingMemberSessionRoute = MemberInPersonSessionRoute(requestId: requestId)
        openPendingMemberSessionIfPossible()
    }

    private func openPendingBillingReturnIfPossible() {
        guard launchPhase == .signedIn,
              let session = sessionCoordinator.currentSession else {
            return
        }

        guard MobileProfileRole.activeRole(for: session.user) == .member else {
            memberBillingReturnEvent = nil
            return
        }

        guard let returnEvent = memberBillingReturnEvent else { return }

        selectedTab = .home
        isProfileSelectionPresented = false
        isNotificationCenterPresented = false
        isUserSettingsPresented = false
        settingsInitialContent = nil
        billingPresentationCoordinator.presentBillingReturn(returnEvent, session: session)
    }

    private func suspendMembershipForPriorityRoute() {
        memberBillingReturnEvent = nil
        billingPresentationCoordinator.suspendForPriorityRoute()
    }

    private func handleIncomingPushRoute(_ route: PushNotificationRoute) {
        suspendMembershipForPriorityRoute()
        pendingPushRoute = route
        openPendingPushRouteIfPossible()
    }

    private func openPendingMemberSessionIfPossible() {
        guard launchPhase == .signedIn,
              sessionCoordinator.currentSession != nil,
              let route = pendingMemberSessionRoute else {
            return
        }

        suspendMembershipForPriorityRoute()
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
        isNotificationCenterPresented = false
        shouldReturnToNotificationCenterAfterRoute = false
    }

    @MainActor
    private func openPendingInviteIfPossible() async {
        guard launchPhase == .signedIn,
              let session = sessionCoordinator.currentSession,
              let inviteToken = pendingInviteToken else {
            return
        }

        suspendMembershipForPriorityRoute()
        do {
            let result = try await requestsAPIClient.claimInviteToken(inviteToken, accessToken: session.accessToken)
            let documentId = result.invite.documentId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard documentId.isEmpty == false else {
                pendingInviteToken = nil
                showHomeBanner("Document invite could not be opened.")
                return
            }

            selectedTab = .documents
            selectedProductModeKey = nil
            intakeRoute = nil
            reviewRoute = nil
            signingRoute = DocumentSigningRoute(documentId: documentId)
            notaryReviewRoute = nil
            notarySessionRoute = nil
            memberSessionRoute = nil
            pendingInviteToken = nil
            isProfileSelectionPresented = false
            isUserSettingsPresented = false
            isNotificationCenterPresented = false
            shouldReturnToNotificationCenterAfterRoute = false
        } catch {
            pendingInviteToken = nil
            showHomeBanner("Document invite could not be opened. Try the link again or open it in the web app.")
        }
    }

    private func openPendingPushRouteIfPossible() {
        guard launchPhase == .signedIn,
              sessionCoordinator.currentSession != nil,
              let route = pendingPushRoute else {
            return
        }

        suspendMembershipForPriorityRoute()
        if case .notaryRequestReview = route,
           MobileProfileRole.activeRole(for: sessionCoordinator.currentSession?.user) != .notary {
            Task {
                guard await sessionCoordinator.switchActiveRole(to: "notary") else { return }
                openPushRoute(route, keepUnderlyingHome: shouldReturnToNotificationCenterAfterRoute)
            }
            return
        }

        if case .notarySession = route,
           MobileProfileRole.activeRole(for: sessionCoordinator.currentSession?.user) != .notary {
            Task {
                guard await sessionCoordinator.switchActiveRole(to: "notary") else { return }
                openPushRoute(route, keepUnderlyingHome: shouldReturnToNotificationCenterAfterRoute)
            }
            return
        }

        openPushRoute(route, keepUnderlyingHome: shouldReturnToNotificationCenterAfterRoute)
    }

    private func openPushRoute(_ route: PushNotificationRoute, keepUnderlyingHome: Bool = false) {
        selectedProductModeKey = nil
        intakeRoute = nil
        reviewRoute = nil
        signingRoute = nil
        notaryReviewRoute = nil
        notarySessionRoute = nil
        memberSessionRoute = nil
        isProfileSelectionPresented = false
        isUserSettingsPresented = false
        if keepUnderlyingHome == false {
            isNotificationCenterPresented = false
        }

        switch route {
        case .memberSession(let requestId, _), .memberRequest(let requestId, _):
            selectedTab = keepUnderlyingHome ? .home : .requests
            memberSessionRoute = MemberInPersonSessionRoute(requestId: requestId)
        case .notaryRequestReview(let requestId, _):
            selectedTab = keepUnderlyingHome ? .home : .notary
            notaryReviewRoute = NotaryRequestReviewRoute(requestId: requestId)
        case .notarySession(let requestId, _):
            selectedTab = keepUnderlyingHome ? .home : .notary
            notarySessionRoute = NotaryInPersonSessionRoute(requestId: requestId)
        case .memberDocument, .memberNotarySelection:
            selectedTab = keepUnderlyingHome ? .home : .documents
        case .documentSigning(let documentId, _):
            selectedTab = keepUnderlyingHome ? .home : .documents
            signingRoute = DocumentSigningRoute(documentId: documentId)
        case .documentReview(let documentId, _):
            selectedTab = keepUnderlyingHome ? .home : .documents
            reviewRoute = DocumentReviewRoute(documentId: documentId)
        case .userSettings:
            selectedTab = .home
            isNotificationCenterPresented = false
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
        memberBillingAPIClient: MemberBillingAPIProviding,
        notificationCenterAPIClient: NotificationCenterAPIProviding,
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
                MockMemberBillingAPIClient(),
                MockNotificationCenterAPIClient(),
                InMemoryAuthSessionStore(session: storedSession)
            )
        }

        return (AuthAPIClient(), HomeAPIClient(), DocumentsAPIClient(), DocumentIntakeAPIClient(), RequestsAPIClient(), NotaryProfileAPIClient(), MemberBillingAPIClient(), NotificationCenterAPIClient(), KeychainAuthSessionStore())
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
    private let designSize = CGSize(width: 440, height: 956)
    let onContinue: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: scaled(260, in: proxy))

                Text("Stay current on time-sensitive updates")
                    .font(DARCiFont.maisonNeue(.demi, size: 34))
                    .lineSpacing(6)
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)

                Text("DARCi can notify you when a request, signing step, or in-person session needs attention. Sensitive details stay inside the app.")
                    .font(DARCiFont.maisonNeue(.book, size: 18))
                    .lineSpacing(6)
                    .foregroundStyle(Color.white.opacity(0.70))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, scaled(18, in: proxy))

                Spacer(minLength: scaled(64, in: proxy))

                Button(action: onContinue) {
                    HStack(spacing: scaled(12, in: proxy)) {
                        Spacer()

                        Text("Continue")
                            .font(DARCiFont.maisonNeue(.book, size: 22))
                            .foregroundStyle(.black)

                        DARCiArrowCornerIcon()
                            .stroke(.black, style: StrokeStyle(lineWidth: 2.4, lineCap: .square, lineJoin: .miter))
                            .frame(width: 28, height: 28)
                    }
                    .frame(maxWidth: .infinity, minHeight: scaled(54, in: proxy))
                    .padding(.horizontal, scaled(22, in: proxy))
                    .background(DARCiTheme.onboardingGreen)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("push-permission-continue")

                Button(action: onDismiss) {
                    Text("Not now")
                        .font(DARCiFont.maisonNeue(.book, size: 18))
                        .foregroundStyle(Color.white.opacity(0.70))
                        .frame(maxWidth: .infinity, minHeight: scaled(52, in: proxy))
                }
                .buttonStyle(.plain)
                .padding(.top, scaled(12, in: proxy))
                .padding(.bottom, scaled(48, in: proxy))
                .accessibilityIdentifier("push-permission-dismiss")
            }
            .padding(.horizontal, scaled(33, in: proxy))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color.black.ignoresSafeArea())
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        let scale = min(proxy.size.width / designSize.width, proxy.size.height / designSize.height)
        return value * max(scale, 0.82)
    }
}

#Preview {
    AppRootView()
}
