import Foundation

protocol NotificationCenterAPIProviding: Sendable {
    func listNotifications(
        category: NotificationCenterCategory,
        limit: Int,
        offset: Int,
        accessToken: String
    ) async throws -> NotificationCenterResponse
    func markAllRead(accessToken: String) async throws -> NotificationCenterMarkReadResponse
    func recordOpen(deliveryId: String, routeName: String?, accessToken: String) async throws -> PushNotificationOpenResponse
}

struct NotificationCenterAPIClient: NotificationCenterAPIProviding {
    private let authAPIClient: AuthAPIClient

    init(authAPIClient: AuthAPIClient = AuthAPIClient()) {
        self.authAPIClient = authAPIClient
    }

    func listNotifications(
        category: NotificationCenterCategory,
        limit: Int = 50,
        offset: Int = 0,
        accessToken: String
    ) async throws -> NotificationCenterResponse {
        try await authAPIClient.get(
            path: "/notifications",
            queryItems: [
                URLQueryItem(name: "category", value: category.rawValue),
                URLQueryItem(name: "limit", value: String(limit)),
                URLQueryItem(name: "offset", value: String(offset)),
            ],
            accessToken: accessToken
        )
    }

    func markAllRead(accessToken: String) async throws -> NotificationCenterMarkReadResponse {
        try await authAPIClient.post(
            path: "/notifications/mark-read",
            body: NotificationCenterEmptyRequest(),
            accessToken: accessToken
        )
    }

    func recordOpen(deliveryId: String, routeName: String?, accessToken: String) async throws -> PushNotificationOpenResponse {
        try await authAPIClient.post(
            path: "/notifications/push-deliveries/\(deliveryId)/open",
            body: PushNotificationOpenRequest(route: routeName),
            accessToken: accessToken
        )
    }
}

struct MockNotificationCenterAPIClient: NotificationCenterAPIProviding {
    var response = NotificationCenterResponse(
        unreadCount: 2,
        notifications: [
            NotificationCenterItem(
                id: "delivery-document-ready",
                deliveryId: "delivery-document-ready",
                jobId: "job-document-ready",
                templateKey: "member_document_ready_email",
                title: "Your document is ready",
                body: "Your Power of Attorney packet is ready to review in DARCi.",
                category: .documents,
                metadataLabel: "POWER OF ATTORNEY · IDN-2608-0142",
                createdAt: ISO8601DateFormatter().string(from: Date()),
                readAt: nil,
                isRead: false,
                route: NotificationCenterRoutePayload(route: "member_document", notificationId: "delivery-document-ready", requestId: nil, documentId: "doc_26080142"),
                documentId: "doc_26080142",
                documentIdn: "IDN-2608-0142",
                channel: "push"
            ),
            NotificationCenterItem(
                id: "delivery-account",
                deliveryId: "delivery-account",
                jobId: "job-account",
                templateKey: "notary_application_approved_email",
                title: "Notary profile approved",
                body: "Your Illuminotary profile is ready. Open settings to review your account.",
                category: .account,
                metadataLabel: nil,
                createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-7_200)),
                readAt: nil,
                isRead: false,
                route: NotificationCenterRoutePayload(route: "user_settings", notificationId: "delivery-account", requestId: nil, documentId: nil),
                documentId: nil,
                documentIdn: nil,
                channel: "push"
            ),
        ]
    )

    func listNotifications(
        category: NotificationCenterCategory,
        limit: Int,
        offset: Int,
        accessToken: String
    ) async throws -> NotificationCenterResponse {
        guard category != .all else { return response }
        return NotificationCenterResponse(
            unreadCount: response.unreadCount,
            notifications: response.notifications.filter { $0.category == category }
        )
    }

    func markAllRead(accessToken: String) async throws -> NotificationCenterMarkReadResponse {
        NotificationCenterMarkReadResponse(markedReadCount: response.unreadCount, unreadCount: 0)
    }

    func recordOpen(deliveryId: String, routeName: String?, accessToken: String) async throws -> PushNotificationOpenResponse {
        PushNotificationOpenResponse(
            opened: true,
            jobId: "job-document-ready",
            jobStatus: "opened",
            deliveryId: deliveryId,
            deliveryStatus: "opened"
        )
    }
}