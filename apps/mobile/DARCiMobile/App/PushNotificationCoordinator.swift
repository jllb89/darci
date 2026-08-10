import Foundation
import OSLog
import UIKit
import UserNotifications

@MainActor
final class PushNotificationCoordinator: NSObject, ObservableObject {
    private static let logger = Logger(subsystem: "com.illuminote.darci", category: "push")

    private static func diagnostic(_ message: String) {
        let line = "DARCI_PUSH_DIAGNOSTIC \(message)"
        logger.info("\(line, privacy: .public)")
        print(line)
        NSLog("%@", line)
    }

    @Published private(set) var permissionStatus: PushPermissionStatus = .unknown
    @Published private(set) var lastRegistrationError: String?
    @Published var pendingRoute: PushNotificationRoute?

    private struct PermissionSyncKey: Equatable {
        let accessToken: String
        let installationId: String
        let environment: PushEnvironment
        let permissionStatus: PushPermissionStatus
        let appBundleId: String
        let appVersion: String?
        let buildNumber: String?
    }

    private struct TokenRegistrationKey: Equatable {
        let accessToken: String
        let installationId: String
        let environment: PushEnvironment
        let deviceToken: String
        let permissionStatus: PushPermissionStatus
        let appBundleId: String
        let appVersion: String?
        let buildNumber: String?
        let deviceModel: String
        let osVersion: String
    }

    private let apiClient: PushDeviceAPIProviding
    private let installationStore: PushInstallationStoring
    private let notificationCenter: UNUserNotificationCenter
    private let bundle: Bundle
    private var currentSession: AuthSession?
    private var currentDeviceToken: String?
    private var didOfferPermissionPrompt = false
    private var hasRequestedRemoteNotifications = false
    private var refreshTask: Task<Void, Never>?
    private var permissionSyncInFlightKey: PermissionSyncKey?
    private var lastSuccessfulPermissionSyncKey: PermissionSyncKey?
    private var tokenRegistrationInFlightKey: TokenRegistrationKey?
    private var lastSuccessfulTokenRegistrationKey: TokenRegistrationKey?

    override convenience init() {
        self.init(
            apiClient: PushDeviceAPIClient(),
            installationStore: KeychainPushInstallationStore(),
            notificationCenter: .current(),
            bundle: .main
        )
    }

    init(
        apiClient: PushDeviceAPIProviding = PushDeviceAPIClient(),
        installationStore: PushInstallationStoring = KeychainPushInstallationStore(),
        notificationCenter: UNUserNotificationCenter = .current(),
        bundle: Bundle = .main
    ) {
        self.apiClient = apiClient
        self.installationStore = installationStore
        self.notificationCenter = notificationCenter
        self.bundle = bundle
        super.init()
    }

    var shouldPresentPermissionPrompt: Bool {
        currentSession != nil && didOfferPermissionPrompt == false && permissionStatus == .unknown
    }

    func configureForLaunch() {
        notificationCenter.delegate = self
        Task { await refreshPermissionAndSync() }
    }

    func activate(session: AuthSession?) {
        currentSession = session
        guard session != nil else { return }
        Self.diagnostic("activated signed_in=true")
        Task { await refreshPermissionAndSync() }
    }

    func markPermissionPromptPresented() {
        didOfferPermissionPrompt = true
    }

    func requestAuthorizationFromPrompt() async {
        do {
            let granted = try await notificationCenter.requestAuthorization(options: [.alert, .sound, .badge])
            Self.diagnostic("authorization_prompt_completed granted=\(granted)")
            await refreshPermissionAndSync()
            if granted || permissionStatus == .provisional {
                registerForRemoteNotificationsIfNeeded()
            }
        } catch {
            Self.diagnostic("authorization_failed error=\(String(describing: error))")
            lastRegistrationError = "notification_authorization_failed"
            await syncPermissionStatus(.denied)
        }
    }

    func refreshPermissionAndSync() async {
        if let refreshTask {
            await refreshTask.value
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performRefreshPermissionAndSync()
        }
        refreshTask = task
        await task.value
        refreshTask = nil
    }

    private func performRefreshPermissionAndSync() async {
        let settings = await notificationCenter.notificationSettings()
        let status = Self.permissionStatus(from: settings.authorizationStatus)
        permissionStatus = status
        Self.diagnostic("permission_refreshed status=\(status.rawValue)")
        await syncPermissionStatus(status)

        if status == .authorized || status == .provisional {
            registerForRemoteNotificationsIfNeeded()
            await registerCurrentTokenIfPossible()
        }
    }

    func deactivateForSignOut() async {
        guard let accessToken = currentSession?.accessToken else {
            currentSession = nil
            currentDeviceToken = nil
            return
        }

        do {
            let installationId = try installationStore.installationId()
            _ = try await apiClient.deactivateDevice(installationId: installationId, accessToken: accessToken)
        } catch {
            lastRegistrationError = "push_deactivation_failed"
        }

        currentSession = nil
        currentDeviceToken = nil
        hasRequestedRemoteNotifications = false
        refreshTask?.cancel()
        refreshTask = nil
        permissionSyncInFlightKey = nil
        lastSuccessfulPermissionSyncKey = nil
        tokenRegistrationInFlightKey = nil
        lastSuccessfulTokenRegistrationKey = nil
    }

    func clearPendingRoute(_ route: PushNotificationRoute) {
        if pendingRoute == route {
            pendingRoute = nil
        }
    }

    private func didRegisterForRemoteNotifications(deviceToken: Data) {
        currentDeviceToken = Self.hexString(from: deviceToken)
        Self.diagnostic("apns_token_received")
        Task { await registerCurrentTokenIfPossible() }
    }

    private func didFailToRegisterForRemoteNotifications(error: Error) {
        Self.diagnostic("apns_registration_failed error=\(String(describing: error))")
        lastRegistrationError = "apns_registration_failed"
    }

    private func registerCurrentTokenIfPossible() async {
        guard let accessToken = currentSession?.accessToken,
              let currentDeviceToken,
              currentDeviceToken.isEmpty == false else {
            return
        }

        do {
            let installationId = try installationStore.installationId()
            let key = TokenRegistrationKey(
                accessToken: accessToken,
                installationId: installationId,
                environment: runtimeEnvironment,
                deviceToken: currentDeviceToken,
                permissionStatus: permissionStatus,
                appBundleId: appBundleId,
                appVersion: appVersion,
                buildNumber: buildNumber,
                deviceModel: UIDevice.current.model,
                osVersion: UIDevice.current.systemVersion
            )

            if lastSuccessfulTokenRegistrationKey == key || tokenRegistrationInFlightKey == key {
                return
            }

            tokenRegistrationInFlightKey = key
            Self.diagnostic("token_register_start environment=\(key.environment.rawValue)")
            _ = try await apiClient.registerDevice(
                installationId: key.installationId,
                request: PushDeviceRegistrationRequest(
                    environment: key.environment,
                    deviceToken: key.deviceToken,
                    permissionStatus: key.permissionStatus,
                    appBundleId: key.appBundleId,
                    appVersion: key.appVersion,
                    buildNumber: key.buildNumber,
                    deviceModel: key.deviceModel,
                    osVersion: key.osVersion
                ),
                accessToken: key.accessToken
            )
            lastRegistrationError = nil
            lastSuccessfulTokenRegistrationKey = key
            Self.diagnostic("token_register_success")
            if tokenRegistrationInFlightKey == key {
                tokenRegistrationInFlightKey = nil
            }
        } catch {
            Self.diagnostic("token_register_failed error=\(String(describing: error))")
            lastRegistrationError = "push_registration_failed"
            tokenRegistrationInFlightKey = nil
        }
    }

    private func syncPermissionStatus(_ status: PushPermissionStatus) async {
        guard let accessToken = currentSession?.accessToken else { return }

        do {
            let installationId = try installationStore.installationId()
            let key = PermissionSyncKey(
                accessToken: accessToken,
                installationId: installationId,
                environment: runtimeEnvironment,
                permissionStatus: status,
                appBundleId: appBundleId,
                appVersion: appVersion,
                buildNumber: buildNumber
            )

            if lastSuccessfulPermissionSyncKey == key || permissionSyncInFlightKey == key {
                return
            }

            permissionSyncInFlightKey = key
            Self.diagnostic("permission_sync_start status=\(key.permissionStatus.rawValue) environment=\(key.environment.rawValue)")
            _ = try await apiClient.updatePermission(
                installationId: key.installationId,
                request: PushDevicePermissionRequest(
                    environment: key.environment,
                    permissionStatus: key.permissionStatus,
                    appBundleId: key.appBundleId,
                    appVersion: key.appVersion,
                    buildNumber: key.buildNumber
                ),
                accessToken: key.accessToken
            )
            lastSuccessfulPermissionSyncKey = key
            Self.diagnostic("permission_sync_success")
            if permissionSyncInFlightKey == key {
                permissionSyncInFlightKey = nil
            }
        } catch {
            Self.diagnostic("permission_sync_failed error=\(String(describing: error))")
            lastRegistrationError = "push_permission_sync_failed"
            permissionSyncInFlightKey = nil
        }
    }

    private func registerForRemoteNotificationsIfNeeded() {
        guard hasRequestedRemoteNotifications == false else { return }
        hasRequestedRemoteNotifications = true
        UIApplication.shared.registerForRemoteNotifications()
    }

    private var runtimeEnvironment: PushEnvironment {
        let value = (bundle.object(forInfoDictionaryKey: "DARCI_APNS_ENVIRONMENT") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        return value == "production" ? .production : .sandbox
    }

    private var appBundleId: String {
        bundle.bundleIdentifier ?? "com.illuminote.darci"
    }

    private var appVersion: String? {
        bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    }

    private var buildNumber: String? {
        bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    }

    private static func permissionStatus(from status: UNAuthorizationStatus) -> PushPermissionStatus {
        switch status {
        case .authorized:
            return .authorized
        case .provisional, .ephemeral:
            return .provisional
        case .denied:
            return .denied
        case .notDetermined:
            return .unknown
        @unknown default:
            return .unknown
        }
    }

    private static func hexString(from data: Data) -> String {
        data.map { String(format: "%02.2hhx", $0) }.joined()
    }
}

extension PushNotificationCoordinator: UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureForLaunch()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        didFailToRegisterForRemoteNotifications(error: error)
    }
}

extension PushNotificationCoordinator: @preconcurrency UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let route = PushNotificationRoute(userInfo: response.notification.request.content.userInfo) else {
            return
        }

        pendingRoute = route
    }
}