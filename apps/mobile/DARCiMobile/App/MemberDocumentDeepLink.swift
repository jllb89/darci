import Foundation

enum MemberDocumentDeepLink {
    private static let trustedHosts = Set([
        "app.darciregistry.dev",
        "app.staging.darciregistry.dev",
    ])

    static func route(from url: URL) -> PushNotificationRoute? {
        guard let host = url.host?.lowercased(), trustedHosts.contains(host) else {
            return nil
        }

        let pathComponents = url.pathComponents
            .filter { $0 != "/" }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }

        if pathComponents.count >= 3,
           pathComponents[0] == "app",
           pathComponents[1] == "documents",
           let documentId = validIdentifier(pathComponents[2]) {
            return .memberDocument(documentId: documentId, notificationId: nil)
        }

        if pathComponents == ["app", "sign"],
           let documentId = documentIdQueryValue(from: url) {
            return .documentSigning(documentId: documentId, notificationId: nil)
        }

        if pathComponents == ["app", "review"],
           let documentId = documentIdQueryValue(from: url) {
            return .documentReview(documentId: documentId, notificationId: nil)
        }

        return nil
    }

    static func inviteToken(from url: URL) -> String? {
        guard let host = url.host?.lowercased(), trustedHosts.contains(host) else {
            return nil
        }

        let pathComponents = url.pathComponents
            .filter { $0 != "/" }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard pathComponents == ["app", "invite"] else {
            return nil
        }

        return URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name == "token" }
            .flatMap { validInviteToken($0.value) }
    }

    private static func documentIdQueryValue(from url: URL) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name == "documentId" }
            .flatMap { validIdentifier($0.value) }
    }

    private static func validIdentifier(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              value.range(of: #"^[A-Za-z0-9_-]{8,80}$"#, options: .regularExpression) != nil else {
            return nil
        }

        return value
    }

    private static func validInviteToken(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              value.range(of: #"^[A-Za-z0-9._~-]{16,512}$"#, options: .regularExpression) != nil else {
            return nil
        }

        return value
    }
}