import Foundation

enum PushEnvironment: String, Codable, Equatable, Sendable {
    case sandbox
    case production
}

enum PushPermissionStatus: String, Codable, Equatable, Sendable {
    case authorized
    case provisional
    case denied
    case unknown
}

struct PushDeviceRegistrationRequest: Encodable, Equatable, Sendable {
    let environment: PushEnvironment
    let deviceToken: String
    let permissionStatus: PushPermissionStatus
    let appBundleId: String
    let platform: String
    let provider: String
    let appVersion: String?
    let buildNumber: String?
    let deviceModel: String?
    let osVersion: String?

    init(
        environment: PushEnvironment,
        deviceToken: String,
        permissionStatus: PushPermissionStatus,
        appBundleId: String,
        appVersion: String?,
        buildNumber: String?,
        deviceModel: String?,
        osVersion: String?
    ) {
        self.environment = environment
        self.deviceToken = deviceToken
        self.permissionStatus = permissionStatus
        self.appBundleId = appBundleId
        self.platform = "ios"
        self.provider = "apns"
        self.appVersion = appVersion
        self.buildNumber = buildNumber
        self.deviceModel = deviceModel
        self.osVersion = osVersion
    }
}

struct PushDevicePermissionRequest: Encodable, Equatable, Sendable {
    let environment: PushEnvironment
    let permissionStatus: PushPermissionStatus
    let appBundleId: String
    let platform: String
    let provider: String
    let appVersion: String?
    let buildNumber: String?

    init(
        environment: PushEnvironment,
        permissionStatus: PushPermissionStatus,
        appBundleId: String,
        appVersion: String?,
        buildNumber: String?
    ) {
        self.environment = environment
        self.permissionStatus = permissionStatus
        self.appBundleId = appBundleId
        self.platform = "ios"
        self.provider = "apns"
        self.appVersion = appVersion
        self.buildNumber = buildNumber
    }
}

struct PushDeviceResponse: Decodable, Equatable, Sendable {
    let device: PushDevice
}

struct PushDeviceDeactivationResponse: Decodable, Equatable, Sendable {
    let deactivated: Bool
}

struct PushNotificationOpenRequest: Encodable, Equatable, Sendable {
    let route: String?
}

struct PushNotificationOpenResponse: Decodable, Equatable, Sendable {
    let opened: Bool
    let jobId: String
    let jobStatus: String
    let deliveryId: String
    let deliveryStatus: String
}

struct PushDevice: Decodable, Equatable, Sendable {
    let id: String
    let installationId: String
    let platform: String
    let provider: String
    let environment: PushEnvironment
    let appBundleId: String
    let permissionStatus: PushPermissionStatus
    let appVersion: String?
    let buildNumber: String?
    let deviceModel: String?
    let osVersion: String?
    let isActive: Bool
    let lastRegisteredAt: String?
    let lastSeenAt: String?
    let invalidatedAt: String?
    let createdAt: String
    let updatedAt: String
}