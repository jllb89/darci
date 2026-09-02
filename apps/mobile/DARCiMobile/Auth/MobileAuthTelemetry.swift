import Foundation
import Security
import Sentry

enum MobileAuthTelemetry {
    static func start() {
        guard let dsn = configuredValue(for: "DARCI_SENTRY_DSN"),
              dsn.hasPrefix("https://")
        else {
            return
        }

        let environment = configuredValue(for: "DARCI_SENTRY_ENVIRONMENT") ?? "staging"
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = environment
            options.sendDefaultPii = false
            options.enableAutoSessionTracking = true
            options.tracesSampleRate = 0.05
            options.attachScreenshot = false
            options.attachViewHierarchy = false
        }
    }

    static func reportRequestFailure(
        operation: String,
        error: Error,
        requestID: String?,
        statusCode: Int?
    ) {
        let classification = classify(error)
        guard classification.shouldCapture else {
            return
        }

        capture(
            operation: operation,
            reason: classification.reason,
            level: classification.level,
            requestID: requestID,
            statusCode: statusCode,
            details: classification.details
        )
    }

    static func reportSessionFailure(
        operation: String,
        reason: String,
        error: Error,
        level: SentryLevel = .warning
    ) {
        var details: [String: Any] = [
            "error_type": String(describing: type(of: error))
        ]
        if let storeError = error as? AuthSessionStoreError {
            details["store_error"] = storeError.telemetryReason
            if let status = storeError.osStatus {
                details["os_status"] = Int(status)
            }
        }

        capture(
            operation: operation,
            reason: reason,
            level: level,
            requestID: nil,
            statusCode: nil,
            details: details
        )
    }

    private static func capture(
        operation: String,
        reason: String,
        level: SentryLevel,
        requestID: String?,
        statusCode: Int?,
        details: [String: Any]
    ) {
        guard configuredValue(for: "DARCI_SENTRY_DSN") != nil else {
            return
        }

        let eventName = "ios.auth.\(operation).\(reason)"
        SentrySDK.capture(message: eventName) { scope in
            scope.setLevel(level)
            scope.setTag(value: "ios", key: "service")
            scope.setTag(value: "auth", key: "telemetry_area")
            scope.setTag(value: operation, key: "auth_operation")
            scope.setTag(value: reason, key: "auth_reason")
            if let requestID {
                scope.setTag(value: requestID, key: "request_id")
            }
            if let statusCode {
                scope.setTag(value: String(statusCode), key: "http_status")
            }

            var context = details
            context["operation"] = operation
            context["reason"] = reason
            context["request_id"] = requestID
            context["status_code"] = statusCode
            scope.setContext(value: context, key: "auth")
        }
    }

    private static func classify(_ error: Error) -> (
        reason: String,
        level: SentryLevel,
        shouldCapture: Bool,
        details: [String: Any]
    ) {
        if let urlError = error as? URLError {
            return (
                "network_failed",
                .error,
                true,
                ["url_error_code": urlError.code.rawValue]
            )
        }

        guard let authError = error as? AuthAPIError else {
            return (
                "unexpected_client_failure",
                .error,
                true,
                ["error_type": String(describing: type(of: error))]
            )
        }

        switch authError {
        case .wrongCode:
            return ("verification_rejected", .info, false, [:])
        case .validation:
            return ("validation_rejected", .info, false, [:])
        case .rateLimited:
            return ("rate_limited", .info, false, [:])
        case .unauthorized:
            return ("session_unauthorized", .warning, true, [:])
        case let .server(statusCode, _):
            return ("server_failed", .error, true, ["server_status": statusCode])
        case let .unexpectedStatus(statusCode, _):
            return ("unexpected_status", .warning, true, ["server_status": statusCode])
        case let .emptyResponse(statusCode):
            return ("response_empty", .warning, true, ["server_status": statusCode])
        case .invalidResponse:
            return ("response_invalid", .error, true, [:])
        case .invalidURL:
            return ("request_url_invalid", .error, true, [:])
        }
    }

    private static func configuredValue(for key: String) -> String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
            return nil
        }

        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false, trimmed.contains("$(") == false else {
            return nil
        }
        return trimmed
    }
}

private extension AuthSessionStoreError {
    var telemetryReason: String {
        switch self {
        case .keychainReadFailed:
            return "keychain_read_failed"
        case .keychainWriteFailed:
            return "keychain_write_failed"
        case .keychainDeleteFailed:
            return "keychain_delete_failed"
        case .invalidKeychainData:
            return "keychain_data_invalid"
        }
    }

    var osStatus: OSStatus? {
        switch self {
        case let .keychainReadFailed(status),
             let .keychainWriteFailed(status),
             let .keychainDeleteFailed(status):
            return status
        case .invalidKeychainData:
            return nil
        }
    }
}
