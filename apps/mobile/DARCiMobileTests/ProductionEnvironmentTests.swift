import XCTest
@testable import DARCiMobile

final class ProductionEnvironmentTests: XCTestCase {
    func testProductionLinksStayInProduction() throws {
        let id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        XCTAssertEqual(MemberDocumentDeepLink.route(from: try XCTUnwrap(URL(string: "https://app.illuminotary.com/app/documents/\(id)")), production: true), .memberDocument(documentId: id, notificationId: nil))
        XCTAssertEqual(MemberDocumentDeepLink.inviteToken(from: try XCTUnwrap(URL(string: "https://app.illuminotary.com/app/invite?token=abcdefghijklmnop")), production: true), "abcdefghijklmnop")
        XCTAssertEqual(MemberSessionDeepLink.requestId(from: try XCTUnwrap(URL(string: "https://app.illuminotary.com/open/requests/\(id)")), production: true), id)
        XCTAssertEqual(MemberBillingDeepLink.result(from: try XCTUnwrap(URL(string: "https://app.illuminotary.com/app?billing=success")), production: true), "success")
    }

    func testProductionRejectsStagingAndUntrustedDeepLinks() throws {
        for origin in ["https://app.staging.darciregistry.dev", "https://app.darciregistry.dev", "https://app.illuminotary.com.evil.test", "http://app.illuminotary.com", "https://user@app.illuminotary.com", "https://app.illuminotary.com:444"] {
            XCTAssertNil(MemberDocumentDeepLink.route(from: try XCTUnwrap(URL(string: origin + "/app/documents/document-123")), production: true))
            XCTAssertNil(MemberDocumentDeepLink.inviteToken(from: try XCTUnwrap(URL(string: origin + "/app/invite?token=abcdefghijklmnop")), production: true))
            XCTAssertNil(MemberSessionDeepLink.requestId(from: try XCTUnwrap(URL(string: origin + "/open/requests/request-123")), production: true))
            XCTAssertNil(MemberBillingDeepLink.result(from: try XCTUnwrap(URL(string: origin + "/app?billing=success")), production: true))
        }
    }

    func testStagingDoesNotConsumeProductionInvites() throws {
        XCTAssertNil(MemberDocumentDeepLink.inviteToken(from: try XCTUnwrap(URL(string: "https://app.illuminotary.com/app/invite?token=abcdefghijklmnop")), production: false))
    }

    func testVerificationUsesSelectedEnvironmentAndRejectsExternalURLs() {
        XCTAssertEqual(MobileEnvironment.verificationURL("/verify/test-123", production: true)?.absoluteString, "https://app.illuminotary.com/verify/test-123")
        XCTAssertEqual(MobileEnvironment.verificationURL("verify/test-123", production: false)?.absoluteString, "https://app.staging.darciregistry.dev/verify/test-123")
        for path in ["https://evil.test/verify/test-123", "//evil.test/verify/test-123", "https://app.staging.darciregistry.dev/verify/test-123", "/app", "javascript:alert(1)"] {
            XCTAssertNil(MobileEnvironment.verificationURL(path, production: true))
        }
    }

    func testKeychainIsolationPreservesExistingStagingAccount() {
        XCTAssertEqual(MobileEnvironment.keychainAccount(production: false), "current")
        XCTAssertEqual(MobileEnvironment.keychainAccount(production: true), "production.current")
    }
}
