import XCTest

final class DARCiMobileUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunchesOnboardingSplash() throws {
        let app = XCUIApplication()
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
        let app = XCUIApplication()
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
    private func storyText(_ app: XCUIApplication, _ label: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch
    }
}
