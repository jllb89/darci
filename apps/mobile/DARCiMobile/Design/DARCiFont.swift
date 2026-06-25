import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

enum DARCiFont {
    enum MaisonNeue: String, CaseIterable {
        case bold = "MaisonNeue-Bold"
        case boldItalic = "MaisonNeue-BoldItalic"
        case book = "MaisonNeue-Book"
        case bookItalic = "MaisonNeue-BookItalic"
        case demi = "MaisonNeue-Demi"
        case demiItalic = "MaisonNeue-DemiItalic"
        case light = "MaisonNeue-Light"
        case lightItalic = "MaisonNeue-LightItalic"
        case medium = "MaisonNeue-Medium"
        case mediumItalic = "MaisonNeue-MediumItalic"
        case mono = "MaisonNeue-Mono"
        case monoItalic = "MaisonNeue-MonoItalic"

        var postScriptName: String {
            rawValue
        }

        var fileName: String {
            "\(rawValue).ttf"
        }

        var fallbackWeight: Font.Weight {
            switch self {
            case .bold, .boldItalic:
                .bold
            case .demi, .demiItalic:
                .semibold
            case .medium, .mediumItalic:
                .medium
            case .light, .lightItalic:
                .light
            case .book, .bookItalic, .mono, .monoItalic:
                .regular
            }
        }
    }

    static let maisonNeueFontFiles = MaisonNeue.allCases.map(\.fileName)

    static func maisonNeue(_ face: MaisonNeue, size: CGFloat) -> Font {
        #if canImport(UIKit)
        if UIFont(name: face.postScriptName, size: size) != nil {
            return .custom(face.postScriptName, size: size)
        }
        #endif

        return .system(size: size, weight: face.fallbackWeight)
    }
}