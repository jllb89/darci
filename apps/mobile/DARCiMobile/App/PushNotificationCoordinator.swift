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

    private let apiClient: PushDeviceAPIProviding
    private let installationStore: PushInstallationStoring
    private let notificationCenter: UNUserNotificationCenter
    private let bundle: Bundle
    private var currentSession: AuthSession?
    private var currentDeviceToken: String?
    private var didOfferPermissionPrompt = false

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
                UIApplication.shared.registerForRemoteNotifications()
            }
        } catch {
            Self.diagnostic("authorization_failed error=\(String(describing: error))")
            lastRegistrationError = "notification_authorization_failed"
            await syncPermissionStatus(.denied)
        }
    }

    func refreshPermissionAndSync() async {
        let settings = await notificationCenter.notificationSettings()
        let status = Self.permissionStatus(from: settings.authorizationStatus)
        permissionStatus = status
        Self.diagnostic("permission_refreshed status=\(status.rawValue)")
        await syncPermissionStatus(status)

        if status == .authorized || status == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
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
            Self.diagnostic("token_register_start environment=\(runtimeEnvironment.rawValue)")
            _ = try await apiClient.registerDevice(
                installationId: installationId,
                request: PushDeviceRegistrationRequest(
                    environment: runtimeEnvironment,
                    deviceToken: currentDeviceToken,
                    permissionStatus: permissionStatus,
                    appBundleId: appBundleId,
                    appVersion: appVersion,
                    buildNumber: buildNumber,
                    deviceModel: UIDevice.current.model,
                    osVersion: UIDevice.current.systemVersion
                ),
                accessToken: accessToken
            )
            lastRegistrationError = nil
            Self.diagnostic("token_register_success")
        } catch {
            Self.diagnostic("token_register_failed error=\(String(describing: error))")
            lastRegistrationError = "push_registration_failed"
        }
    }

    private func syncPermissionStatus(_ status: PushPermissionStatus) async {
        guard let accessToken = currentSession?.accessToken else { return }

        do {
            let installationId = try installationStore.installationId()
            Self.diagnostic("permission_sync_start status=\(status.rawValue) environment=\(runtimeEnvironment.rawValue)")
            _ = try await apiClient.updatePermission(
                installationId: installationId,
                request: PushDevicePermissionRequest(
                    environment: runtimeEnvironment,
                    permissionStatus: status,
                    appBundleId: appBundleId,
                    appVersion: appVersion,
                    buildNumber: buildNumber
                ),
                accessToken: accessToken
            )
            Self.diagnostic("permission_sync_success")
        } catch {
            Self.diagnostic("permission_sync_failed error=\(String(describing: error))")
            lastRegistrationError = "push_permission_sync_failed"
        }
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