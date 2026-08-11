import Foundation

enum NotificationCenterCategory: String, CaseIterable, Identifiable, Codable, Sendable {
    case all
    case documents
    case account

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "ALL"
        case .documents:
            return "DOCUMENTS"
        case .account:
            return "ACCOUNT"
        }
    }
}

struct NotificationCenterResponse: Decodable, Equatable, Sendable {
    let unreadCount: Int
    let notifications: [NotificationCenterItem]
}

struct NotificationCenterItem: Identifiable, Decodable, Equatable, Sendable {
    let id: String
    let deliveryId: String
    let jobId: String
    let templateKey: String?
    let title: String
    let body: String
    let category: NotificationCenterCategory
    let metadataLabel: String?
    let createdAt: String
    let readAt: String?
    let isRead: Bool
    let route: NotificationCenterRoutePayload?
    let documentId: String?
    let documentIdn: String?
    let channel: String

    var pushRoute: PushNotificationRoute? {
        route?.pushRoute
    }
}

struct NotificationCenterRoutePayload: Decodable, Equatable, Sendable {
    let route: String
    let notificationId: String?
    let requestId: String?
    let documentId: String?

    var pushRoute: PushNotificationRoute? {
        var userInfo: [AnyHashable: Any] = ["route": route]
        if let notificationId {
            userInfo["notificationId"] = notificationId
        }
        if let requestId {
            userInfo["requestId"] = requestId
        }
        if let documentId {
            userInfo["documentId"] = documentId
        }

        return PushNotificationRoute(userInfo: userInfo)
    }
}

struct NotificationCenterMarkReadResponse: Decodable, Equatable, Sendable {
    let markedReadCount: Int
    let unreadCount: Int
}

struct NotificationCenterEmptyRequest: Encodable, Equatable, Sendable {}