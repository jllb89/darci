import Foundation

struct AuthConfig: Equatable, Sendable {
    static let defaultLocalBaseURL = URL(string: "http://127.0.0.1:4000")!

    let apiBaseURL: URL

    init(apiBaseURL: URL) {
        self.apiBaseURL = apiBaseURL.normalizedAuthBaseURL
    }

    static func current(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> AuthConfig {
        if let url = configuredURL(from: environment["DARCI_API_BASE_URL"]) {
            return AuthConfig(apiBaseURL: url)
        }

        if let value = bundle.object(forInfoDictionaryKey: "DARCI_API_BASE_URL") as? String,
           let url = configuredURL(from: value) {
            return AuthConfig(apiBaseURL: url)
        }

        return AuthConfig(apiBaseURL: defaultLocalBaseURL)
    }

    private static func configuredURL(from value: String?) -> URL? {
        guard let value else { return nil }

        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedValue.isEmpty == false,
              trimmedValue.hasPrefix("$(") == false,
              let url = URL(string: trimmedValue),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              url.host?.isEmpty == false else {
            return nil
        }

        return url
    }
}

private extension URL {
    var normalizedAuthBaseURL: URL {
        guard absoluteString.hasSuffix("/") else { return self }

        var components = URLComponents(url: self, resolvingAgainstBaseURL: false)
        if components?.path != "/" {
            let path = components?.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
            components?.path = path.isEmpty ? "" : "/\(path)"
        } else {
            components?.path = ""
        }
        return components?.url ?? self
    }
}