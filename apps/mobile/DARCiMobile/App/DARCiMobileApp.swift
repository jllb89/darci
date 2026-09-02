import SwiftUI

@main
struct DARCiMobileApp: App {
    @UIApplicationDelegateAdaptor(PushNotificationCoordinator.self) private var pushCoordinator

    init() {
        MobileAuthTelemetry.start()
    }

    var body: some Scene {
        WindowGroup {
            AppRootView(pushCoordinator: pushCoordinator)
        }
    }
}
