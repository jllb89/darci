import XCTest

final class DARCiMobileUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func makeApp(restoreSession: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["DARCI_MOCK_AUTH"] = "1"
        if restoreSession {
            app.launchEnvironment["DARCI_MOCK_AUTH_RESTORE"] = "1"
        }
        return app
    }

    @MainActor
    func testLaunchesOnboardingSplash() throws {
        let app = makeApp()
        let firstStory = "Members get documents notarized in seconds not hours. Notaries handle more work without burning out."
        let secondStory = "Every step meets legal standards. Watermarking, sealing, hashing, and ledger anchoring happen automatically so compliance is never a question."
        app.launch()

        XCTAssertTrue(app.staticTexts["DARCi"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["Illuminotarization that keeps up with your workflow."]
                .waitForExistence(timeout: 5)
        )
        let startButton = app.buttons["Start"]
        XCTAssertTrue(startButton.waitForExistence(timeout: 5))

        startButton.tap()

        XCTAssertTrue(storyText(app, firstStory).waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Close onboarding"].waitForExistence(timeout: 5))

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5)).tap()
        XCTAssertTrue(storyText(app, secondStory).waitForExistence(timeout: 5))

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.5)).tap()
        XCTAssertTrue(storyText(app, firstStory).waitForExistence(timeout: 5))

        app.buttons["Close onboarding"].tap()
        XCTAssertTrue(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["To access the app, continue below."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 5))

        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 5))
        app.buttons["Phone number"].tap()
        XCTAssertFalse(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["I just want to browse the app."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["Back"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["Use email instead."].waitForExistence(timeout: 2))
        app.typeText("2025550147")

        app.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Verify code"].waitForExistence(timeout: 5))
        let otpField = app.textFields["One-time code"]
        XCTAssertTrue(otpField.waitForExistence(timeout: 5))
        otpField.tap()
        app.typeText("12345678")
        XCTAssertEqual(otpField.value as? String, "12345678")
        XCTAssertTrue(app.buttons["Use email instead."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Back"].waitForExistence(timeout: 5))

        app.buttons["Back"].tap()
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 5))

        app.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Verify code"].waitForExistence(timeout: 5))
        app.buttons["Verify code"].tap()
        XCTAssertTrue(app.staticTexts["Please complete the following information:"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["Name"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["Last name"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Phone number"].waitForExistence(timeout: 5))

        app.textFields["Name"].tap()
        app.typeText("Jorge Luis")
        app.textFields["Last name"].tap()
        app.typeText("Lopez")
        app.textFields["Email"].tap()
        app.typeText("lopezb.jl@gmail.com")
        XCTAssertTrue(app.buttons["Continue"].isEnabled)
        if app.buttons["Done"].waitForExistence(timeout: 2) {
            app.buttons["Done"].tap()
        }
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Welcome to DARCi!"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testEmailOptionCanStartFromInitialAuthenticationState() throws {
        let app = makeApp()
        app.launch()

        app.buttons["Start"].tap()
        XCTAssertTrue(app.buttons["Close onboarding"].waitForExistence(timeout: 5))
        app.buttons["Close onboarding"].tap()

        XCTAssertTrue(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 5))
        app.buttons["Use email instead."].tap()

        XCTAssertFalse(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["I just want to browse the app."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["Back"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.textFields["Enter your email here"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Use phone number instead."].waitForExistence(timeout: 5))

        app.buttons["Back"].tap()
        XCTAssertTrue(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 5))

        app.buttons["Use email instead."].tap()
        XCTAssertTrue(app.textFields["Enter your email here"].waitForExistence(timeout: 5))
        app.buttons["Use phone number instead."].tap()
        XCTAssertTrue(app.buttons["Use email instead."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Phone number"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testStoredSessionRestoresAndSignsOut() throws {
        let app = makeApp(restoreSession: true)
        app.launch()

        XCTAssertTrue(app.staticTexts["Welcome to DARCi."].waitForExistence(timeout: 5))
        let powerOfAttorneyCard = app.buttons["home-product-card-poa_only"]
        XCTAssertTrue(powerOfAttorneyCard.waitForExistence(timeout: 5))
        powerOfAttorneyCard.tap()
        XCTAssertTrue(app.staticTexts["New power of attorney."].waitForExistence(timeout: 5))
        app.buttons["Back"].tap()

        let trustCard = app.buttons["home-product-card-trust_bundle"]
        XCTAssertTrue(trustCard.waitForExistence(timeout: 5))
        trustCard.tap()
        XCTAssertTrue(app.staticTexts["New trust package."].waitForExistence(timeout: 5))
        app.buttons["Back"].tap()

        let notarizationCard = app.buttons["home-product-card-notarize_document"]
        XCTAssertTrue(notarizationCard.waitForExistence(timeout: 5))
        notarizationCard.tap()
        XCTAssertTrue(app.staticTexts["New document notarization."].waitForExistence(timeout: 5))
        app.buttons["Back"].tap()

        let settingsButton = app.buttons["home-settings-button"]
        XCTAssertTrue(settingsButton.waitForExistence(timeout: 5))
        settingsButton.tap()

        let personalInfoButton = app.buttons["settings-personal-info-button"]
        XCTAssertTrue(personalInfoButton.waitForExistence(timeout: 5))
        personalInfoButton.tap()

        XCTAssertTrue(app.staticTexts["Personal Info"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Name"].exists)
        XCTAssertTrue(app.staticTexts["Email"].exists)
        XCTAssertTrue(app.staticTexts["Password"].exists)
        XCTAssertTrue(app.staticTexts["Phone number"].exists)
        XCTAssertTrue(app.staticTexts["Address"].exists)
        XCTAssertFalse(app.buttons["personal-info-save-button"].isEnabled)

        app.buttons["Back to user settings"].tap()

        let signOutButton = app.buttons["settings-sign-out-button"]
        XCTAssertTrue(signOutButton.waitForExistence(timeout: 5))
        signOutButton.tap()

        XCTAssertTrue(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 5))
    }

    @MainActor
    private func storyText(_ app: XCUIApplication, _ label: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch
    }
}
