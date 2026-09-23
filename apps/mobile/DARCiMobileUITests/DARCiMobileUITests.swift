import XCTest

final class DARCiMobileUITests: XCTestCase {
    @MainActor
    func testContractSharedControlsDismissKeyboardAndPreserveMultilineText() throws {
        let app = XCUIApplication()
        app.launchEnvironment["DARCI_MOCK_INTAKE_KEYBOARD"] = "1"
        app.launch()
        let phone = app.textFields["keyboard-fixture-phone"]
        XCTAssertTrue(phone.waitForExistence(timeout: 5))
        phone.tap()
        enterPhoneNumber("2025550147", into: phone)
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(app.keyboards.firstMatch.frame.height, 200)
        XCTAssertEqual(app.buttons.matching(identifier: "Done").count, 1)
        app.buttons["Done"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        phone.tap()
        app.buttons["intake-select-fixture-jurisdiction"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))

        let notes = app.textViews["keyboard-fixture-notes"]
        notes.tap()
        notes.typeText("Line one\nLine two")
        XCTAssertEqual(notes.value as? String, "Line one\nLine two")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        app.buttons["poa-authority-scope-fixture"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))

        let date = app.textFields["keyboard-fixture-date"]
        date.tap()
        date.typeText("2024")
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons.matching(identifier: "Done").count, 1)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "contract-date-blue-done"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.buttons["Done"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        date.tap()
        date.typeText("0923")
        XCTAssertEqual(date.value as? String, "2024-09-23")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
    }

    @MainActor
    func testContractFormOwnsOneDoneButtonAndHandlesReturn() throws {
        let app = makeApp(restoreSession: true)
        app.launch()
        let product = app.buttons["home-product-card-trust_bundle"]
        XCTAssertTrue(product.waitForExistence(timeout: 10))
        product.tap()
        let name = app.textFields["trust-name-field"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        for _ in 0..<4 where !name.isHittable { app.swipeUp() }
        name.tap()
        name.typeText("Keyboard Test Trust")
        XCTAssertEqual(app.buttons.matching(identifier: "intake-keyboard-done").count, 1)
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == 'Done'")).count - app.keyboards.buttons.matching(NSPredicate(format: "label == 'Done'")).count, 1)
        app.keyboards.buttons["Done"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertEqual(name.value as? String, "Keyboard Test Trust")
        name.tap()
        app.buttons["intake-keyboard-done"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
    }

    @MainActor
    func testLoginKeyboardKeepsFullWidthAndSingleDismissButton() throws {
        let app = makeApp()
        app.launch()
        app.buttons["Start"].tap()
        XCTAssertTrue(app.buttons["Close onboarding"].waitForExistence(timeout: 5))
        app.buttons["Close onboarding"].tap()
        let submit = app.buttons["auth-continue-button"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        let initialWidth = submit.frame.width
        XCTAssertGreaterThan(initialWidth, app.frame.width * 0.8)

        let phone = app.textFields["phone-number-field"]
        phone.tap()
        assertReadableLoginKeyboard(in: app, button: submit, expectedWidth: initialWidth, name: "phone")
        app.buttons["Done"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertEqual(submit.frame.width, initialWidth, accuracy: 1)

        app.buttons["Use email instead."].tap()
        let email = app.textFields["Enter your email here"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        email.tap()
        email.typeText("keyboard-fixture@example.com")
        assertReadableLoginKeyboard(in: app, button: submit, expectedWidth: initialWidth, name: "email")
        submit.tap()
        let otp = app.textFields["otp-code-field"]
        XCTAssertTrue(otp.waitForExistence(timeout: 5))
        otp.tap()
        assertReadableLoginKeyboard(in: app, button: app.buttons["Verify code"], expectedWidth: initialWidth, name: "otp")
        app.typeText("12345678")
        XCTAssertEqual(otp.value as? String, "12345678")
    }

    @MainActor
    private func assertReadableLoginKeyboard(in app: XCUIApplication, button: XCUIElement, expectedWidth: CGFloat, name: String) {
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "login-keyboard-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
        XCTAssertGreaterThan(app.keyboards.firstMatch.frame.height, 200, "Enable the simulator software keyboard; an accessory-only keyboard does not exercise avoidance.")
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons.matching(identifier: "Done").count, 1)
        XCTAssertEqual(button.frame.width, expectedWidth, accuracy: 1)
        XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        XCTAssertTrue(button.isHittable)
        XCTAssertLessThanOrEqual(button.frame.maxY, app.keyboards.firstMatch.frame.minY)
    }

    @MainActor
    func testLoginAtLargestAccessibilitySizeCanScrollToActions() throws {
        let app = makeApp()
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        app.buttons["Start"].tap()
        XCTAssertTrue(app.buttons["Close onboarding"].waitForExistence(timeout: 5))
        app.buttons["Close onboarding"].tap()
        let form = app.scrollViews["authentication-entry"]
        XCTAssertTrue(form.waitForExistence(timeout: 5))
        let phone = app.textFields["phone-number-field"]
        for _ in 0..<6 where !phone.isHittable { form.swipeUp() }
        phone.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons.matching(identifier: "Done").count, 1)
        let submit = app.buttons["auth-continue-button"]
        for _ in 0..<6 where !submit.isHittable { form.swipeUp() }
        XCTAssertTrue(submit.isHittable)
        XCTAssertGreaterThan(submit.frame.width, app.frame.width * 0.8)
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "login-largest-accessibility"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testNotarySubmissionRemainsReachableAtStandardAndLargestTextSize() throws {
        for size in ["standard", "accessibility"] {
            let app = XCUIApplication()
            app.launchEnvironment["DARCI_MOCK_NOTARY_SELECTION"] = size
            app.launch()
            let submit = app.buttons["notary-submit"]
            XCTAssertTrue(submit.waitForExistence(timeout: 10))
            XCTAssertTrue(submit.isHittable, "Submit must remain visible at \(size) text size")
            XCTAssertGreaterThan(app.staticTexts["Choose a notary"].frame.minY, app.frame.height * 0.18)
            submit.tap()
            XCTAssertTrue(app.staticTexts["notary-submission-complete"].waitForExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testNotarySheetFitsShortListsAndScrollsLongLists() throws {
        var singleNotaryTop: CGFloat = 0
        for count in [0, 1, 5, 20] {
            let app = XCUIApplication()
            app.launchEnvironment["DARCI_MOCK_NOTARY_SELECTION"] = "standard"
            app.launchEnvironment["DARCI_MOCK_NOTARY_COUNT"] = String(count)
            app.launch()
            let title = app.staticTexts["Choose a notary"]
            XCTAssertTrue(title.waitForExistence(timeout: 10))
            if count > 0 {
                XCTAssertTrue(app.staticTexts["Adam Eberts"].waitForExistence(timeout: 5))
            } else {
                XCTAssertTrue(app.staticTexts["No active notaries are available for this document jurisdiction yet."].waitForExistence(timeout: 5))
            }
            XCTAssertGreaterThan(title.frame.minY, app.frame.height * 0.18)
            let submit = app.buttons["notary-submit"]
            XCTAssertTrue(submit.isHittable)
            if count == 1 { singleNotaryTop = title.frame.minY }
            if count == 5 {
                XCTAssertLessThan(title.frame.minY, singleNotaryTop - 80)
                XCTAssertTrue(app.staticTexts["Test Notary 5"].isHittable)
                let initialTop = title.frame.minY
                app.buttons["Minimize notary selection"].tap()
                XCTAssertGreaterThan(title.frame.minY, initialTop)
                app.buttons["Expand notary selection"].tap()
                XCTAssertEqual(title.frame.minY, initialTop, accuracy: 2)
            }
            if count == 20 {
                let last = app.staticTexts["Test Notary 20"]
                let list = app.scrollViews["notary-selection-card"]
                for _ in 0..<10 where !last.isHittable { list.swipeUp() }
                XCTAssertTrue(last.isHittable)
                last.tap()
                XCTAssertTrue(submit.isHittable)
            }
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = "notary-card-\(count)-rows"
            attachment.lifetime = .keepAlways
            add(attachment)
            app.terminate()
        }
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func makeApp(
        restoreSession: Bool = false,
        notarySession: Bool = false,
        billingCheckoutEnabled: Bool = false,
        billingState: String? = nil,
        existingUser: Bool = false
    ) -> XCUIApplication {
        let app = XCUIApplication()
        // These fixtures use English labels and US national phone numbers;
        // do not inherit the developer/runner simulator's country settings.
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment["DARCI_MOCK_AUTH"] = "1"
        if restoreSession {
            app.launchEnvironment["DARCI_MOCK_AUTH_RESTORE"] = "1"
        }
        if notarySession {
            app.launchEnvironment["DARCI_MOCK_NOTARY_SESSION"] = "1"
        }
        if billingCheckoutEnabled {
            app.launchEnvironment["DARCI_MOCK_IOS_CHECKOUT_ENABLED"] = "1"
            app.launchArguments += ["-darci.memberBilling.lastDismissedAt.mock-user", "0"]
        }
        if let billingState {
            app.launchEnvironment["DARCI_MOCK_MEMBER_BILLING_STATE"] = billingState
        }
        if existingUser {
            app.launchEnvironment["DARCI_MOCK_AUTH_EXISTING_USER"] = "1"
        }
        return app
    }

    @MainActor
    private func selectUSPhoneCountry(in app: XCUIApplication) {
        // PhoneNumberKit also reads system Contacts/telephony country settings.
        let selector = app.buttons["phone-country-selector"]
        XCTAssertTrue(selector.waitForExistence(timeout: 5))
        selector.tap()
        let search = app.textFields["Search country or code"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("United States")
        let country = app.buttons.containing(.staticText, identifier: "US").firstMatch
        XCTAssertTrue(country.waitForExistence(timeout: 5))
        country.tap()
        XCTAssertEqual(selector.value as? String, "United States, +1")
    }

    @MainActor
    private func enterPhoneNumber(_ number: String, into field: XCUIElement) {
        // Let the live formatter settle between keystrokes; a burst of injected
        // characters can race its text binding updates and lose a digit.
        for digit in number {
            field.typeText(String(digit))
        }
        XCTAssertEqual((field.value as? String)?.filter(\.isNumber), number)
    }

    @MainActor
    func testLaunchesOnboardingSplash() throws {
        let app = makeApp()
        let firstStory = "Keep your documents, signatures, and notary requests in one place—from preparation through the in-person session."
        let secondStory = "Capture the in-person acknowledgment, seal the document, and record a SHA-256 fingerprint for checking its integrity."
        app.launch()

        XCTAssertTrue(app.staticTexts["DARCi"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["illuminotarization that keeps up with your workflow."]
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

        selectUSPhoneCountry(in: app)
        let phoneField = app.textFields["phone-number-field"]
        XCTAssertTrue(phoneField.waitForExistence(timeout: 5))
        phoneField.tap()
        XCTAssertFalse(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["I just want to browse the app."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["Back"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["Use email instead."].waitForExistence(timeout: 2))
        enterPhoneNumber("2025550147", into: phoneField)

        app.buttons["auth-continue-button"].tap()
        XCTAssertTrue(app.buttons["Verify code"].waitForExistence(timeout: 5), app.debugDescription)
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
        // Scope to the form: iOS also exposes the keyboard return key as Continue.
        let completeInfoContinue = app.scrollViews["authentication-complete-info"].buttons["Continue"]
        XCTAssertTrue(completeInfoContinue.isEnabled)
        let keyboardDoneButton = app.buttons.matching(identifier: "Done").firstMatch
        if keyboardDoneButton.waitForExistence(timeout: 2) {
            keyboardDoneButton.tap()
        }
        completeInfoContinue.tap()
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
        XCTAssertTrue(app.textFields["phone-number-field"].waitForExistence(timeout: 5))
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
    func testHomeMastheadRemainsFixedWhileContentScrolls() throws {
        let app = makeApp(restoreSession: true)
        app.launch()

        let welcome = app.staticTexts["home-welcome-title"]
        let settings = app.buttons["home-settings-button"]
        let membershipPrompt = app.buttons["home-membership-prompt"]
        XCTAssertTrue(welcome.waitForExistence(timeout: 5))
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        XCTAssertTrue(membershipPrompt.waitForExistence(timeout: 5))

        let initialWelcomeY = welcome.frame.minY
        let initialSettingsY = settings.frame.minY
        let initialPromptY = membershipPrompt.frame.minY

        app.swipeUp()

        XCTAssertEqual(welcome.frame.minY, initialWelcomeY, accuracy: 1)
        XCTAssertEqual(settings.frame.minY, initialSettingsY, accuracy: 1)
        XCTAssertLessThan(membershipPrompt.frame.minY, initialPromptY)
    }

    @MainActor
    func testPersonalInfoKeepsSaveActionReachableWithKeyboardOpen() throws {
        let app = makeApp(restoreSession: true)
        app.launch()

        if app.buttons["Not now"].waitForExistence(timeout: 1) {
            app.buttons["Not now"].tap()
        }

        XCTAssertTrue(app.buttons["home-settings-button"].waitForExistence(timeout: 5))
        app.buttons["home-settings-button"].tap()

        let personalInfoButton = app.buttons["settings-personal-info-button"]
        XCTAssertTrue(personalInfoButton.waitForExistence(timeout: 5))
        if personalInfoButton.isHittable == false {
            app.swipeUp()
        }
        personalInfoButton.tap()

        let addressField = app.textFields["personal-info-address-field"]
        XCTAssertTrue(addressField.waitForExistence(timeout: 5))
        for _ in 0..<4 where addressField.isHittable == false {
            app.swipeUp()
        }
        XCTAssertTrue(addressField.isHittable)
        addressField.tap()
        app.typeText("123 Main Street")

        let saveButton = app.buttons["personal-info-save-button"]
        XCTAssertTrue(saveButton.waitForExistence(timeout: 5))
        XCTAssertTrue(saveButton.isHittable)
        XCTAssertTrue(saveButton.isEnabled)
    }

    @MainActor
    func testDocumentAndRequestFiltersKeepPrimaryActionsReachable() throws {
        let app = makeApp(restoreSession: true)
        app.launch()

        if app.buttons["Not now"].waitForExistence(timeout: 1) {
            app.buttons["Not now"].tap()
        }

        let documentsTab = app.buttons["Documents"]
        XCTAssertTrue(documentsTab.waitForExistence(timeout: 5))
        documentsTab.tap()

        let documentsFilter = app.buttons["Filter documents"]
        XCTAssertTrue(documentsFilter.waitForExistence(timeout: 5))
        documentsFilter.tap()
        let documentsApply = app.buttons["Apply"]
        XCTAssertTrue(documentsApply.waitForExistence(timeout: 5))
        XCTAssertTrue(documentsApply.isHittable)
        documentsApply.tap()

        let requestsTab = app.buttons["Requests"]
        XCTAssertTrue(requestsTab.waitForExistence(timeout: 5))
        requestsTab.tap()

        let requestsFilter = app.buttons["Filter requests"]
        XCTAssertTrue(requestsFilter.waitForExistence(timeout: 5))
        requestsFilter.tap()
        let requestsApply = app.buttons["Apply"]
        XCTAssertTrue(requestsApply.waitForExistence(timeout: 5))
        XCTAssertTrue(requestsApply.isHittable)
    }

    @MainActor
    func testMemberBillingProposalOneLoadsFromSettings() throws {
        let app = makeApp(restoreSession: true)
        app.launch()

        XCTAssertTrue(app.buttons["home-settings-button"].waitForExistence(timeout: 5))
        if app.buttons["Not now"].waitForExistence(timeout: 1) {
            app.buttons["Not now"].tap()
        }
        app.buttons["home-settings-button"].tap()

        let billingButton = app.buttons["settings-membership-billing-button"]
        XCTAssertTrue(billingButton.waitForExistence(timeout: 5))
        billingButton.tap()

        XCTAssertTrue(app.staticTexts["Make it official."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["PRIVATE BETA · TEST MODE"].exists)
        XCTAssertTrue(app.buttons["member-billing-plan-member_plus_monthly"].isSelected)
        XCTAssertTrue(app.staticTexts["member-billing-purchase-policy-notice"].exists)
        XCTAssertTrue(app.staticTexts["Stripe test mode — no real charge"].exists)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "member-billing-proposal-01"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testActiveMembershipBillingMatchesTheDarkProfileExperience() throws {
        let app = makeApp(restoreSession: true, billingState: "active")
        app.launch()

        XCTAssertTrue(app.buttons["home-settings-button"].waitForExistence(timeout: 5))
        app.buttons["home-settings-button"].tap()

        let billingButton = app.buttons["settings-membership-billing-button"]
        XCTAssertTrue(billingButton.waitForExistence(timeout: 5))
        billingButton.tap()

        XCTAssertTrue(app.staticTexts["Your membership."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Plus"].exists)
        XCTAssertTrue(app.staticTexts["ACTIVE"].exists)
        XCTAssertTrue(app.staticTexts["4 of 10 used"].exists)
        XCTAssertFalse(app.staticTexts["Not available"].exists)
        XCTAssertTrue(app.buttons["member-billing-portal-button"].exists)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "member-billing-active-dark"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testFreshAuthenticationAutomaticallyPresentsAvailableMembership() throws {
        let app = makeApp(billingCheckoutEnabled: true, existingUser: true)
        app.launch()

        app.buttons["Start"].tap()
        XCTAssertTrue(app.buttons["Close onboarding"].waitForExistence(timeout: 5))
        app.buttons["Close onboarding"].tap()
        XCTAssertTrue(app.staticTexts["Welcome Sign in"].waitForExistence(timeout: 5))

        selectUSPhoneCountry(in: app)
        let phoneField = app.textFields["phone-number-field"]
        XCTAssertTrue(phoneField.waitForExistence(timeout: 5))
        phoneField.tap()
        enterPhoneNumber("2025550147", into: phoneField)
        app.buttons["auth-continue-button"].tap()

        let otpField = app.textFields["One-time code"]
        let reachedOTP = otpField.waitForExistence(timeout: 5)
        if !reachedOTP {
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = "mock-phone-signin-failure"
            attachment.lifetime = .keepAlways
            add(attachment)
            print(app.debugDescription)
        }
        XCTAssertTrue(reachedOTP)
        otpField.tap()
        app.typeText("12345678")
        app.buttons["Verify code"].tap()

        XCTAssertTrue(app.staticTexts["Welcome to DARCi!"].waitForExistence(timeout: 5))
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Make it official."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["member-billing-not-now-button"].exists)
    }

    @MainActor
    func testRestoredMemberSeesPersistentPromptAndProductCreationGate() throws {
        let app = makeApp(restoreSession: true, billingCheckoutEnabled: true)
        app.launch()

        XCTAssertTrue(app.staticTexts["Welcome to DARCi."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["home-membership-prompt"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Make it official."].exists)
        XCTAssertFalse(app.buttons["member-billing-not-now-button"].exists)

        let powerOfAttorneyCard = app.buttons["home-product-card-poa_only"]
        XCTAssertTrue(powerOfAttorneyCard.waitForExistence(timeout: 5))
        if powerOfAttorneyCard.isHittable == false {
            app.swipeUp()
        }
        powerOfAttorneyCard.tap()

        XCTAssertTrue(app.staticTexts["Make it official."].waitForExistence(timeout: 5))
        let notNowButton = app.buttons["member-billing-not-now-button"]
        XCTAssertTrue(notNowButton.waitForExistence(timeout: 5))
        notNowButton.tap()
        XCTAssertTrue(app.buttons["home-membership-prompt"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["New power of attorney."].exists)
    }

    @MainActor
    func testReadyNotaryRequestOpensInPersonSessionWorkspace() throws {
        let app = makeApp(restoreSession: true, notarySession: true)
        app.launch()

        let readyTab = app.buttons["READY FOR IN-PERSON"]
        XCTAssertTrue(readyTab.waitForExistence(timeout: 5))
        readyTab.tap()

        let readyRequest = app.buttons["notary-ready-start-mock-session-request"]
        XCTAssertTrue(readyRequest.waitForExistence(timeout: 5))
        readyRequest.tap()

        XCTAssertTrue(app.staticTexts["Coordinate with member"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["START SESSION"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["notary-session-start-button"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["The session PDF will appear here when it is ready."].exists)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "notary-in-person-session-start"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func storyText(_ app: XCUIApplication, _ label: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch
    }
}
