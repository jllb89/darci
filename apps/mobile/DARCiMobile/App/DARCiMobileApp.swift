import SwiftUI

@main
struct DARCiMobileApp: App {
    @UIApplicationDelegateAdaptor(PushNotificationCoordinator.self) private var pushCoordinator

    var body: some Scene {
        WindowGroup {
            AppRootView(pushCoordinator: pushCoordinator)
        }
    }
}
