import XCTest
@testable import DARCiMobile

#if canImport(UIKit)
import UIKit
#endif

final class DARCiMobileTests: XCTestCase {
    func testLaunchStartsAtOnboarding() {
        XCTAssertEqual(AppLaunchPhase.initial, .onboarding)
    }

    func testOnboardingSplashContentIsStable() {
        XCTAssertEqual(OnboardingScreenContent.splash.brand, "DARCi")
        XCTAssertEqual(
            OnboardingScreenContent.splash.headline,
            "Illuminotarization\nthat keeps up with your workflow."
        )
        XCTAssertEqual(
            OnboardingScreenContent.splash.accessibilityHeadline,
            "Illuminotarization that keeps up with your workflow."
        )
        XCTAssertEqual(OnboardingScreenContent.splash.ctaTitle, "Start")
    }

    func testAuthenticationSignInContentIsStable() {
        XCTAssertEqual(AuthenticationSignInContent.signIn.brand, "DARCi")
        XCTAssertEqual(AuthenticationSignInContent.signIn.headline, "Welcome\nSign in")
        XCTAssertEqual(AuthenticationSignInContent.signIn.accessibilityHeadline, "Welcome Sign in")
        XCTAssertEqual(AuthenticationSignInContent.signIn.supportingText, "To access the app,\ncontinue below.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.accessibilitySupportingText, "To access the app, continue below.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.countryCode, "+1")
        XCTAssertEqual(AuthenticationSignInContent.signIn.phonePlaceholder, "Enter your phone number.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.emailPlaceholder, "Enter your email here")
        XCTAssertEqual(AuthenticationSignInContent.signIn.continueTitle, "Continue")
        XCTAssertEqual(AuthenticationSignInContent.signIn.verifyCodeTitle, "Verify code")
        XCTAssertEqual(AuthenticationSignInContent.signIn.completeInfoTitle, "Please complete the following information:")
        XCTAssertEqual(AuthenticationSignInContent.signIn.nameTitle, "Name")
        XCTAssertEqual(AuthenticationSignInContent.signIn.lastNameTitle, "Last name")
        XCTAssertEqual(AuthenticationSignInContent.signIn.emailFieldTitle, "Email")
        XCTAssertEqual(AuthenticationSignInContent.signIn.phoneNumberTitle, "Phone number")
        XCTAssertEqual(AuthenticationSignInContent.signIn.successTitle, "Welcome to DARCi!")
        XCTAssertEqual(AuthenticationSignInContent.signIn.emailTitle, "Use email instead.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.phoneTitle, "Use phone number instead.")
        XCTAssertEqual(AuthenticationSignInContent.signIn.browseTitle, "I just want to browse the app.")
    }

    func testOnboardingStoriesAreStable() {
        XCTAssertEqual(OnboardingStoryContent.all.count, 4)
        XCTAssertEqual(OnboardingStoryContent.all.map(\.imageName), ["onboarding1", "onboarding2", "onboarding3", "onboarding4"])
        XCTAssertEqual(
            OnboardingStoryContent.all.first?.message,
            "Members get documents notarized in seconds not hours. Notaries handle more work without burning out."
        )
        XCTAssertEqual(
            OnboardingStoryContent.all.map(\.message),
            [
                "Members get documents notarized in seconds not hours. Notaries handle more work without burning out.",
                "Every step meets legal standards. Watermarking, sealing, hashing, and ledger anchoring happen automatically so compliance is never a question.",
                "Watermarking, sealing, hashing, and ledger anchoring happen automatically. Compliance isn't something you chase—it's something you get.",
                "Members complete notarization faster. Notaries handle more volume without exhaustion. The work moves at a pace that feels natural, not rushed."
            ]
        )
    }

    #if canImport(UIKit)
    func testOnboardingBackgroundImageIsBundled() {
        for story in OnboardingStoryContent.all {
            let url = Bundle.main.url(forResource: story.imageName, withExtension: "png")

            XCTAssertNotNil(url)
            XCTAssertNotNil(url.flatMap { UIImage(contentsOfFile: $0.path) })
        }
    }
    #endif

    func testMaisonNeueFontFilesAreKnown() {
        XCTAssertEqual(
            DARCiFont.maisonNeueFontFiles,
            [
                "MaisonNeue-Bold.ttf",
                "MaisonNeue-BoldItalic.ttf",
                "MaisonNeue-Book.ttf",
                "MaisonNeue-BookItalic.ttf",
                "MaisonNeue-Demi.ttf",
                "MaisonNeue-DemiItalic.ttf",
                "MaisonNeue-Light.ttf",
                "MaisonNeue-LightItalic.ttf",
                "MaisonNeue-Medium.ttf",
                "MaisonNeue-MediumItalic.ttf",
                "MaisonNeue-Mono.ttf",
                "MaisonNeue-MonoItalic.ttf"
            ]
        )
    }

    #if canImport(UIKit)
    func testMaisonNeueFontsAreRegistered() {
        for face in DARCiFont.MaisonNeue.allCases {
            XCTAssertNotNil(
                UIFont(name: face.postScriptName, size: 12),
                "Expected \(face.postScriptName) to be registered from app resources."
            )
        }
    }
    #endif

    func testTabConfigurationIsStable() {
        XCTAssertEqual(
            AppTab.allCases.map(\.title),
            ["Home", "Documents", "Generate", "Requests", "Notary"]
        )
    }

    func testProductSectionsAreRepresented() {
        XCTAssertEqual(
            AppSection.allCases.map(\.title),
            [
                "Onboarding",
                "Sign in / up",
                "Home",
                "Documents",
                "Document Generator",
                "Requests",
                "In-person Meeting",
                "Notary Profile"
            ]
        )
    }
}
