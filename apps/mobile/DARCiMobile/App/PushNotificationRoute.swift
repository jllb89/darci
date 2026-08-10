import Foundation

enum PushNotificationRoute: Equatable, Sendable {
    private static let forbiddenKeys = Set([
        "url",
        "returnTo",
        "accessToken",
        "refreshToken",
        "email",
        "phone",
        "deviceToken",
    ])

    case memberSession(requestId: String, notificationId: String?)
    case memberRequest(requestId: String, notificationId: String?)
    case notaryRequestReview(requestId: String, notificationId: String?)
    case memberDocument(documentId: String, notificationId: String?)
    case memberNotarySelection(documentId: String, notificationId: String?)
    case documentReview(documentId: String, notificationId: String?)
    case documentSigning(documentId: String, notificationId: String?)

    init?(userInfo: [AnyHashable: Any]) {
        let keys = Set(userInfo.keys.compactMap { $0 as? String })
        guard keys.isDisjoint(with: Self.forbiddenKeys) else {
            return nil
        }

        guard let routeName = Self.stringValue(userInfo["route"]), routeName.isEmpty == false else {
            return nil
        }

        let notificationId = Self.stringValue(userInfo["notificationId"])

        switch routeName {
        case "member_session":
            guard let requestId = Self.validIdentifier(userInfo["requestId"]) else { return nil }
            self = .memberSession(requestId: requestId, notificationId: notificationId)
        case "member_request":
            guard let requestId = Self.validIdentifier(userInfo["requestId"]) else { return nil }
            self = .memberRequest(requestId: requestId, notificationId: notificationId)
        case "notary_request_review":
            guard let requestId = Self.validIdentifier(userInfo["requestId"]) else { return nil }
            self = .notaryRequestReview(requestId: requestId, notificationId: notificationId)
        case "member_document":
            guard let documentId = Self.validIdentifier(userInfo["documentId"]) else { return nil }
            self = .memberDocument(documentId: documentId, notificationId: notificationId)
        case "member_notary_selection":
            guard let documentId = Self.validIdentifier(userInfo["documentId"]) else { return nil }
            self = .memberNotarySelection(documentId: documentId, notificationId: notificationId)
        case "document_review":
            guard let documentId = Self.validIdentifier(userInfo["documentId"]) else { return nil }
            self = .documentReview(documentId: documentId, notificationId: notificationId)
        case "document_signing":
            guard let documentId = Self.validIdentifier(userInfo["documentId"]) else { return nil }
            self = .documentSigning(documentId: documentId, notificationId: notificationId)
        default:
            return nil
        }
    }

    private static func validIdentifier(_ value: Any?) -> String? {
        guard let value = stringValue(value), value.range(of: #"^[A-Za-z0-9_-]{8,80}$"#, options: .regularExpression) != nil else {
            return nil
        }

        return value
    }

    private static func stringValue(_ value: Any?) -> String? {
        (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}