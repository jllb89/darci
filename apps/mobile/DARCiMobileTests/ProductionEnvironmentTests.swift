import XCTest
@testable import DARCiMobile

final class ProductionEnvironmentTests: XCTestCase {
    func testTokenSelectionNeverDowngradesFreshCredentialsOrCrossesAccounts() throws {
        func token(subject: String = "member", issuer: String = "production", expiry: Int) throws -> String {
            let data = try JSONSerialization.data(withJSONObject: ["sub": subject, "iss": issuer, "exp": expiry])
            let payload = data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            return "header.\(payload).signature"
        }
        let old = try token(expiry: 100), fresh = try token(expiry: 200)
        XCTAssertEqual(AccessTokenClaims.preferredAccessToken(requested: fresh, stored: old), fresh)
        XCTAssertEqual(AccessTokenClaims.preferredAccessToken(requested: old, stored: fresh), fresh)
        XCTAssertEqual(AccessTokenClaims.preferredAccessToken(requested: fresh, stored: try token(subject: "other", expiry: 300)), fresh)
        XCTAssertEqual(AccessTokenClaims.preferredAccessToken(requested: fresh, stored: try token(issuer: "staging", expiry: 300)), fresh)
        XCTAssertEqual(AccessTokenClaims.preferredAccessToken(requested: fresh, stored: "invalid"), fresh)
    }

    func testCheckoutIdentifiesIOSForNativeReturnRouting() throws {
        let data = try JSONEncoder().encode(MemberCheckoutRequest(priceCode: "member_starter_monthly", idempotencyToken: "test-only"))
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
        XCTAssertEqual(body["clientPlatform"], "ios")
    }

    func testNativeBillingReturnsAreEnvironmentScoped() throws {
        for result in ["success", "canceled"] {
            XCTAssertEqual(MemberBillingDeepLink.result(from: try XCTUnwrap(URL(string: "darci-production://billing-return?billing=\(result)")), production: true), result)
            XCTAssertEqual(MemberBillingDeepLink.result(from: try XCTUnwrap(URL(string: "darci-staging://billing-return?billing=\(result)")), production: false), result)
        }
        for invalid in ["darci-staging://billing-return?billing=success", "darci-production://other?billing=success", "darci-production://billing-return?billing=active", "darci-production://billing-return/extra?billing=success", "darci-production://user@billing-return?billing=success", "darci-production://billing-return:444?billing=success"] {
            XCTAssertNil(MemberBillingDeepLink.result(from: try XCTUnwrap(URL(string: invalid)), production: true))
        }
    }

    func testNotaryApplicationUsesTheMatchingEnvironmentWithoutSessionTokens() {
        XCTAssertEqual(MobileEnvironment.notaryApplicationURL(production: true).absoluteString, "https://app.illuminotary.com/app/settings")
        XCTAssertEqual(MobileEnvironment.notaryApplicationURL(production: false).absoluteString, "https://app.staging.darciregistry.dev/app/settings")
        XCTAssertNil(MobileEnvironment.notaryApplicationURL().query)
    }
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
