import SwiftUI

enum DARCiTheme {
    static let accent = Color(red: 0.0, green: 0.41, blue: 0.36)
    static let ink = Color(red: 0.09, green: 0.12, blue: 0.16)
    static let mutedInk = Color(red: 0.39, green: 0.44, blue: 0.50)
    static let background = Color(red: 0.96, green: 0.97, blue: 0.96)
    static let panel = Color.white
    static let gold = Color(red: 0.78, green: 0.62, blue: 0.28)
    static let onboardingGreen = Color(red: 10.0 / 255.0, green: 1.0, blue: 74.0 / 255.0)
    static let onboardingImageFallback = accent
    static let onboardingScrim = Color.black.opacity(0.40)
}

struct DARCiArrowCornerIcon: Shape {
    func path(in rect: CGRect) -> Path {
        let scaleX = rect.width / 16
        let scaleY = rect.height / 16

        var path = Path()
        path.move(to: CGPoint(x: 0.729218 * scaleX, y: 14.7812 * scaleY))
        path.addLine(to: CGPoint(x: 13.3792 * scaleX, y: 2.13125 * scaleY))
        path.move(to: CGPoint(x: 14.4792 * scaleX, y: 14.7812 * scaleY))
        path.addLine(to: CGPoint(x: 14.4792 * scaleX, y: 1.03125 * scaleY))
        path.addLine(to: CGPoint(x: 0.729218 * scaleX, y: 1.03125 * scaleY))
        return path
    }
}

struct DARCiArrowRightIcon: Shape {
    func path(in rect: CGRect) -> Path {
        let scaleX = rect.width / 21
        let scaleY = rect.height / 21

        var path = Path()
        path.move(to: CGPoint(x: 0 * scaleX, y: 10.3542 * scaleY))
        path.addLine(to: CGPoint(x: 17.875 * scaleX, y: 10.3542 * scaleY))
        path.move(to: CGPoint(x: 9.625 * scaleX, y: 0.729187 * scaleY))
        path.addLine(to: CGPoint(x: 19.25 * scaleX, y: 10.3542 * scaleY))
        path.addLine(to: CGPoint(x: 9.625 * scaleX, y: 19.9792 * scaleY))
        return path
    }
}

struct DARCiArrowLeftIcon: Shape {
    func path(in rect: CGRect) -> Path {
        let scaleX = rect.width / 21
        let scaleY = rect.height / 21

        var path = Path()
        path.move(to: CGPoint(x: 20.7084 * scaleX, y: 10.3542 * scaleY))
        path.addLine(to: CGPoint(x: 2.83341 * scaleX, y: 10.3542 * scaleY))
        path.move(to: CGPoint(x: 11.0834 * scaleX, y: 19.9792 * scaleY))
        path.addLine(to: CGPoint(x: 1.45841 * scaleX, y: 10.3542 * scaleY))
        path.addLine(to: CGPoint(x: 11.0834 * scaleX, y: 0.729247 * scaleY))
        return path
    }
}

struct DARCiCheckIcon: Shape {
    func path(in rect: CGRect) -> Path {
        let scaleX = rect.width / 22
        let scaleY = rect.height / 17

        var path = Path()
        path.move(to: CGPoint(x: 20.7358 * scaleX, y: 0.722595 * scaleY))
        path.addLine(to: CGPoint(x: 6.98584 * scaleX, y: 14.7226 * scaleY))
        path.addLine(to: CGPoint(x: 0.73584 * scaleX, y: 8.35896 * scaleY))
        return path
    }
}
