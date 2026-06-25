import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case home
    case documents
    case generator
    case requests
    case notary

    var id: String { rawValue }

    var section: AppSection {
        switch self {
        case .home:
            .home
        case .documents:
            .documents
        case .generator:
            .documentGenerator
        case .requests:
            .requests
        case .notary:
            .notaryProfile
        }
    }

    var title: String {
        switch self {
        case .home:
            "Home"
        case .documents:
            "Documents"
        case .generator:
            "Generate"
        case .requests:
            "Requests"
        case .notary:
            "Notary"
        }
    }

    var systemImage: String {
        section.systemImage
    }
}
