import Foundation
import Security

protocol PushInstallationStoring: Sendable {
    func installationId() throws -> String
    func clear() throws
}

enum PushInstallationStoreError: Error, Equatable {
    case keychainReadFailed(status: OSStatus)
    case keychainWriteFailed(status: OSStatus)
    case keychainDeleteFailed(status: OSStatus)
    case invalidKeychainData
}

final class KeychainPushInstallationStore: PushInstallationStoring {
    private let service: String
    private let account: String

    init(
        service: String = Bundle.main.bundleIdentifier.map { "\($0).push-installation" } ?? "com.illuminote.darci.push-installation",
        account: String = "current"
    ) {
        self.service = service
        self.account = account
    }

    func installationId() throws -> String {
        if let existing = try load() {
            return existing
        }

        let generated = UUID().uuidString.lowercased()
        try save(generated)
        return generated
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw PushInstallationStoreError.keychainDeleteFailed(status: status)
        }
    }

    private func load() throws -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw PushInstallationStoreError.keychainReadFailed(status: status)
        }

        guard let data = item as? Data,
              let value = String(data: data, encoding: .utf8),
              value.isEmpty == false else {
            throw PushInstallationStoreError.invalidKeychainData
        }

        return value
    }

    private func save(_ value: String) throws {
        let data = Data(value.utf8)
        let updateStatus = SecItemUpdate(baseQuery() as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }

        if updateStatus != errSecItemNotFound {
            throw PushInstallationStoreError.keychainWriteFailed(status: updateStatus)
        }

        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw PushInstallationStoreError.keychainWriteFailed(status: addStatus)
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

final class InMemoryPushInstallationStore: PushInstallationStoring, @unchecked Sendable {
    private var storedInstallationId: String?

    init(installationId: String? = nil) {
        self.storedInstallationId = installationId
    }

    func installationId() throws -> String {
        if let storedInstallationId {
            return storedInstallationId
        }

        let generated = UUID().uuidString.lowercased()
        storedInstallationId = generated
        return generated
    }

    func clear() throws {
        storedInstallationId = nil
    }
}