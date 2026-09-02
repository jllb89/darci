import SwiftUI

enum MobileProfileRole: String, CaseIterable, Identifiable, Sendable {
    case member
    case notary

    var id: String { rawValue }

    var title: String {
        switch self {
        case .member:
            "Member"
        case .notary:
            "Notary"
        }
    }

    static func activeRole(for user: AuthenticatedUser?) -> MobileProfileRole {
        switch user?.role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "notary":
            .notary
        default:
            .member
        }
    }

    static func availableRoles(for user: AuthenticatedUser?) -> [MobileProfileRole] {
        let rawRoles = Set((user?.availableRoles ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { $0.isEmpty == false })

        var roles: [MobileProfileRole] = []
        if rawRoles.isEmpty || rawRoles.contains("member") || rawRoles.contains("pro") {
            roles.append(.member)
        }

        if rawRoles.contains("notary") {
            roles.append(.notary)
        }

        return roles.isEmpty ? [.member] : roles
    }

    func sessionRoleValue(for user: AuthenticatedUser?) -> String {
        let rawRoles = Set((user?.availableRoles ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { $0.isEmpty == false })

        switch self {
        case .member:
            if rawRoles.contains("member") { return "member" }
            if rawRoles.contains("pro") { return "pro" }
            return "member"
        case .notary:
            return "notary"
        }
    }
}

struct ProfileTypeSelectionView: View {
    private let designSize = CGSize(width: 440, height: 956)
    let session: AuthSession?
    let onBack: () -> Void
    let onSelectRole: (MobileProfileRole) -> Void
    let onBecomeIlluminotary: () -> Void

    private var roles: [MobileProfileRole] {
        MobileProfileRole.availableRoles(for: session?.user)
    }

    private var showsIlluminotaryCTA: Bool {
        roles.contains(.notary) == false
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                DARCiTheme.onboardingGreen.ignoresSafeArea()

                ScrollView(showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        Button(action: onBack) {
                            DARCiArrowLeftIcon()
                                .stroke(.black, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                                .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Back")
                        .padding(.top, scaled(67, in: proxy))
                        .padding(.leading, scaled(29, in: proxy))

                        Text("Your roles:")
                            .font(DARCiFont.maisonNeue(.medium, size: scaled(24, in: proxy)))
                            .tracking(0.24)
                            .lineSpacing(scaled(4.8, in: proxy))
                            .foregroundStyle(.black)
                            .padding(.top, scaled(76, in: proxy))
                            .padding(.leading, scaled(44, in: proxy))

                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(roles) { role in
                                ProfileRoleSelectionRow(role: role) {
                                    onSelectRole(role)
                                }
                                .frame(minHeight: scaled(47, in: proxy))
                            }
                        }
                        .overlay(alignment: .top) {
                            ProfileDivider()
                        }
                        .padding(.top, scaled(104, in: proxy))
                        .padding(.horizontal, scaled(23, in: proxy))

                        Spacer(minLength: scaled(40, in: proxy))

                        if showsIlluminotaryCTA {
                            Button(action: onBecomeIlluminotary) {
                                HStack(spacing: scaled(18, in: proxy)) {
                                    Text("Become an illuminotary")
                                        .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                                        .lineSpacing(scaled(2.2, in: proxy))
                                        .foregroundStyle(.white)
                                        .fixedSize(horizontal: false, vertical: true)

                                    DARCiArrowCornerIcon()
                                        .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                                        .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                                }
                                .frame(maxWidth: .infinity, minHeight: scaled(54, in: proxy), alignment: .leading)
                                .padding(.horizontal, scaled(25, in: proxy))
                                .background(Color.black)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, scaled(23, in: proxy))
                            .padding(.bottom, scaled(28, in: proxy))
                        }

                        ProfileFooterLinks()
                            .padding(.leading, scaled(44, in: proxy))
                            .padding(.bottom, max(proxy.safeAreaInsets.bottom, scaled(43, in: proxy)))
                    }
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .topLeading)
                }
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

struct NotaryProfilePlaceholderView: View {
    private let designSize = CGSize(width: 440, height: 956)
    let session: AuthSession?
    let onProfileAction: () -> Void

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer(minLength: 0)
                    ProfileRolePillButton(
                        title: MobileProfileRole.activeRole(for: session?.user).title,
                        action: onProfileAction
                    )
                }
                .padding(.top, scaled(46, in: proxy))
                .padding(.horizontal, scaled(33, in: proxy))

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.white.ignoresSafeArea())
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }
}

struct ProfileRolePillButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: 13)
                    .fill(Color.clear)
                    .frame(width: 82, height: 26)
                    .overlay {
                        RoundedRectangle(cornerRadius: 13)
                            .inset(by: 0.5)
                            .stroke(Color(red: 0.84, green: 0.84, blue: 0.84), lineWidth: 0.5)
                    }

                Text(title)
                    .font(DARCiFont.maisonNeue(.mono, size: 13))
                    .lineSpacing(16.9)
                    .foregroundStyle(Color(red: 0.19, green: 0.19, blue: 0.19))
                    .offset(x: -0.5, y: 0.5)
            }
            .frame(width: 82, height: 26)
            .clipShape(RoundedRectangle(cornerRadius: 13))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier("profile-role-button")
    }
}

private struct ProfileRoleSelectionRow: View {
    let role: MobileProfileRole
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 0) {
                Text(role.title)
                    .font(DARCiFont.maisonNeue(.book, size: 18))
                    .lineSpacing(1.8)
                    .foregroundStyle(.black)

                Spacer(minLength: 0)

                DARCiArrowRightIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                    .frame(width: 21, height: 21)
                    .padding(.trailing, 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            ProfileDivider()
        }
    }
}

private struct ProfileDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color.black.opacity(0.18))
            .frame(height: 0.5)
    }
}

private struct ProfileFooterLinks: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 35) {
            Button(action: {}) {
                Text("Contact.")
                    .font(DARCiFont.maisonNeue(.book, size: 14))
                    .lineSpacing(1.4)
                    .underline()
                    .foregroundStyle(.black)
            }
            .buttonStyle(.plain)

            Button(action: {}) {
                HStack(spacing: 10) {
                    Text("Terms & Conditions")
                        .font(DARCiFont.maisonNeue(.book, size: 14))
                        .lineSpacing(1.4)
                        .foregroundStyle(.black)

                    DARCiArrowRightIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .square, lineJoin: .miter))
                        .frame(width: 14, height: 14)
                }
            }
            .buttonStyle(.plain)
        }
    }
}

#Preview("Member only") {
    NavigationStack {
        ProfileTypeSelectionView(
            session: .preview(roles: ["member"]),
            onBack: {},
            onSelectRole: { _ in },
            onBecomeIlluminotary: {}
        )
    }
}

#Preview("Member and notary") {
    NavigationStack {
        ProfileTypeSelectionView(
            session: .preview(roles: ["member", "notary"]),
            onBack: {},
            onSelectRole: { _ in },
            onBecomeIlluminotary: {}
        )
    }
}

private extension AuthSession {
    static func preview(roles: [String]) -> AuthSession {
        AuthSession(
            accessToken: "preview-access-token",
            refreshToken: "preview-refresh-token",
            user: AuthenticatedUser(
                id: "preview-user",
                email: "jorge@example.com",
                phone: "+15555550123",
                role: roles.contains("notary") ? "notary" : "member",
                availableRoles: roles,
                status: "active",
                firstName: "Jorge",
                lastName: "L",
                emailConfirmedAt: nil,
                phoneConfirmedAt: nil,
                lastSignInAt: nil,
                lastAuthSyncedAt: nil
            )
        )
    }
}
