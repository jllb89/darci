import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case onboarding
    case authentication
    case home
    case documents
    case documentGenerator
    case requests
    case inPersonMeeting
    case notaryProfile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .onboarding:
            "Onboarding"
        case .authentication:
            "Sign in / up"
        case .home:
            "Home"
        case .documents:
            "Documents"
        case .documentGenerator:
            "Document Generator"
        case .requests:
            "Requests"
        case .inPersonMeeting:
            "In-person Meeting"
        case .notaryProfile:
            "Notary Profile"
        }
    }

    var systemImage: String {
        switch self {
        case .onboarding:
            "sparkles"
        case .authentication:
            "person.badge.key"
        case .home:
            "house"
        case .documents:
            "doc.text"
        case .documentGenerator:
            "wand.and.sparkles"
        case .requests:
            "tray.full"
        case .inPersonMeeting:
            "person.2.wave.2"
        case .notaryProfile:
            "person.text.rectangle"
        }
    }

    var isPrimaryTab: Bool {
        switch self {
        case .home, .documents, .documentGenerator, .requests, .notaryProfile:
            true
        case .onboarding, .authentication, .inPersonMeeting:
            false
        }
    }
}
