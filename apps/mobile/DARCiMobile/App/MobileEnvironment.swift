import Foundation

enum MobileEnvironment {
    static var isProduction: Bool {
        Bundle.main.object(forInfoDictionaryKey: "DARCI_ENVIRONMENT") as? String == "production"
    }

    static var webBaseURL: URL {
        // Never derive the web host from an untrusted deep link or document payload.
        URL(string: isProduction ? "https://app.illuminotary.com" : "https://app.staging.darciregistry.dev")!
    }

    static func acceptsWebURL(_ url: URL, production: Bool = isProduction) -> Bool {
        let hosts: Set<String> = production
            ? ["app.illuminotary.com"]
            : ["app.staging.darciregistry.dev", "app.darciregistry.dev"]
        return url.scheme?.lowercased() == "https"
            && url.user == nil && url.password == nil
            && (url.port == nil || url.port == 443)
            && hosts.contains(url.host?.lowercased() ?? "")
    }

    static func verificationURL(_ path: String, production: Bool = isProduction) -> URL? {
        let base = URL(string: production ? "https://app.illuminotary.com" : "https://app.staging.darciregistry.dev")!
        guard let url = URL(string: path, relativeTo: base)?.absoluteURL,
              acceptsWebURL(url, production: production),
              url.path.hasPrefix("/verify/") else { return nil }
        return url
    }

    // Same bundle ID is used by staging TestFlight and production. Do not reuse a
    // staging refresh token or device installation record against production.
    static func keychainAccount(production: Bool = isProduction) -> String {
        production ? "production.current" : "current"
    }
}
