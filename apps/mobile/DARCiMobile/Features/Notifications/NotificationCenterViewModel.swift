import Foundation
import UserNotifications

@MainActor
final class NotificationCenterViewModel: ObservableObject {
    @Published private(set) var notifications: [NotificationCenterItem] = []
    @Published private(set) var unreadCount = 0
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published var selectedCategory: NotificationCenterCategory = .all

    private let apiClient: NotificationCenterAPIProviding

    init(apiClient: NotificationCenterAPIProviding = NotificationCenterAPIClient()) {
        self.apiClient = apiClient
    }

    var hasUnreadNotifications: Bool {
        unreadCount > 0
    }

    var todayNotifications: [NotificationCenterItem] {
        notifications.filter { Self.isToday($0.createdAt) }
    }

    var earlierNotifications: [NotificationCenterItem] {
        notifications.filter { Self.isToday($0.createdAt) == false }
    }

    func load(for session: AuthSession?) async {
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            notifications = []
            unreadCount = 0
            return
        }

        isLoading = true
        errorMessage = nil
        do {
            let response = try await apiClient.listNotifications(
                category: selectedCategory,
                limit: 50,
                offset: 0,
                accessToken: accessToken
            )
            notifications = response.notifications
            unreadCount = response.unreadCount
            syncApplicationBadgeCount(response.unreadCount)
        } catch {
            errorMessage = Self.displayMessage(for: error)
        }
        isLoading = false
    }

    func markAllRead(for session: AuthSession?) async {
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false, unreadCount > 0 else { return }

        do {
            let response = try await apiClient.markAllRead(accessToken: accessToken)
            unreadCount = response.unreadCount
            syncApplicationBadgeCount(response.unreadCount)
            notifications = notifications.map { item in
                NotificationCenterItem(
                    id: item.id,
                    deliveryId: item.deliveryId,
                    jobId: item.jobId,
                    templateKey: item.templateKey,
                    title: item.title,
                    body: item.body,
                    category: item.category,
                    metadataLabel: item.metadataLabel,
                    createdAt: item.createdAt,
                    readAt: item.readAt ?? ISO8601DateFormatter().string(from: Date()),
                    isRead: true,
                    route: item.route,
                    documentId: item.documentId,
                    documentIdn: item.documentIdn,
                    channel: item.channel
                )
            }
        } catch {
            errorMessage = Self.displayMessage(for: error)
        }
    }

    func recordOpen(_ item: NotificationCenterItem, for session: AuthSession?) async -> PushNotificationRoute? {
        guard let accessToken = session?.accessToken, accessToken.isEmpty == false else {
            return item.pushRoute
        }

        if item.isRead == false {
            notifications = notifications.map { existing in
                guard existing.id == item.id else { return existing }
                return NotificationCenterItem(
                    id: existing.id,
                    deliveryId: existing.deliveryId,
                    jobId: existing.jobId,
                    templateKey: existing.templateKey,
                    title: existing.title,
                    body: existing.body,
                    category: existing.category,
                    metadataLabel: existing.metadataLabel,
                    createdAt: existing.createdAt,
                    readAt: existing.readAt ?? ISO8601DateFormatter().string(from: Date()),
                    isRead: true,
                    route: existing.route,
                    documentId: existing.documentId,
                    documentIdn: existing.documentIdn,
                    channel: existing.channel
                )
            }
            unreadCount = max(0, unreadCount - 1)
            syncApplicationBadgeCount(unreadCount)
        }

        do {
            _ = try await apiClient.recordOpen(
                deliveryId: item.deliveryId,
                routeName: item.pushRoute?.routeName,
                accessToken: accessToken
            )
        } catch {
            errorMessage = Self.displayMessage(for: error)
        }

        return item.pushRoute
    }

    static func relativeTime(for isoString: String) -> String {
        guard let date = parseDate(isoString) else { return "" }
        let interval = max(0, Date().timeIntervalSince(date))

        if interval < 3_600 {
            let minutes = max(1, Int(interval / 60))
            return "\(minutes)m"
        }
        if interval < 86_400 {
            return "\(Int(interval / 3_600))h"
        }
        if Calendar.current.isDateInYesterday(date) {
            return "Yesterday"
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }

    private static func isToday(_ isoString: String) -> Bool {
        guard let date = parseDate(isoString) else { return false }
        return Calendar.current.isDateInToday(date)
    }

    private static func parseDate(_ isoString: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: isoString) {
            return date
        }

        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: isoString)
    }

    private static func displayMessage(for error: Error) -> String {
        if let apiError = error as? AuthAPIError {
            switch apiError {
            case .unauthorized(let message),
                 .validation(let message),
                 .rateLimited(let message),
                 .server(_, let message),
                 .unexpectedStatus(_, let message),
                 .wrongCode(let message):
                return message ?? "Unable to load notifications."
            case .invalidURL, .invalidResponse, .emptyResponse:
                return "Unable to load notifications."
            }
        }

        return "Unable to load notifications."
    }

    private func syncApplicationBadgeCount(_ count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(max(0, count)) { _ in }
    }
}