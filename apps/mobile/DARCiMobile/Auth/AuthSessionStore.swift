import Foundation
import Security

protocol AuthSessionStore {
    func load() throws -> AuthSession?
    func save(_ session: AuthSession) throws
    func clear() throws
}

enum AuthSessionStoreError: Error, Equatable {
    case keychainReadFailed(status: OSStatus)
    case keychainWriteFailed(status: OSStatus)
    case keychainDeleteFailed(status: OSStatus)
    case invalidKeychainData
}

final class KeychainAuthSessionStore: AuthSessionStore {
    private let service: String
    private let account: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        service: String = Bundle.main.bundleIdentifier.map { "\($0).auth-session" } ?? "com.illuminote.darci.auth-session",
        account: String = "current",
        encoder: JSONEncoder = JSONEncoder(),
        decoder: JSONDecoder = JSONDecoder()
    ) {
        self.service = service
        self.account = account
        self.encoder = encoder
        self.decoder = decoder
    }

    func load() throws -> AuthSession? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw AuthSessionStoreError.keychainReadFailed(status: status)
        }

        guard let data = item as? Data else {
            throw AuthSessionStoreError.invalidKeychainData
        }

        return try decoder.decode(AuthSession.self, from: data)
    }

    func save(_ session: AuthSession) throws {
        let data = try encoder.encode(session)
        let status = SecItemUpdate(baseQuery() as CFDictionary, [kSecValueData as String: data] as CFDictionary)

        if status == errSecSuccess {
            return
        }

        if status != errSecItemNotFound {
            throw AuthSessionStoreError.keychainWriteFailed(status: status)
        }

        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw AuthSessionStoreError.keychainWriteFailed(status: addStatus)
        }
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthSessionStoreError.keychainDeleteFailed(status: status)
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

final class InMemoryAuthSessionStore: AuthSessionStore {
    private var session: AuthSession?

    init(session: AuthSession? = nil) {
        self.session = session
    }

    func load() throws -> AuthSession? {
        session
    }

    func save(_ session: AuthSession) throws {
        self.session = session
    }

    func clear() throws {
        session = nil
    }
}