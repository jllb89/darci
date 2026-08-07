import Foundation

enum MemberSessionDeepLink {
    private static let allowedHosts = Set([
        "app.staging.darciregistry.dev",
        "app.darciregistry.dev",
    ])

    static func requestId(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              allowedHosts.contains(host) else {
            return nil
        }

        if let requestId = requestId(fromPath: url.path, prefix: ["open", "requests"]) {
            return requestId
        }

        if let requestId = requestId(fromPath: url.path, prefix: ["app", "requests"]) {
            return requestId
        }

        guard url.path == "/start",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let returnTo = components.queryItems?.first(where: { $0.name == "returnTo" })?.value else {
            return nil
        }

        return requestId(fromPath: returnTo, prefix: ["app", "requests"])
    }

    private static func requestId(fromPath path: String, prefix: [String]) -> String? {
        let components = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard components.count == prefix.count + 1,
              Array(components.prefix(prefix.count)) == prefix,
              let requestId = components.last?.removingPercentEncoding?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              requestId.isEmpty == false else {
            return nil
        }
        return requestId
    }
}