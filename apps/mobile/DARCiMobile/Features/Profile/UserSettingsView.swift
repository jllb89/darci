import SwiftUI

struct UserSettingsView: View {
    private let designSize = CGSize(width: 440, height: 956)
    let session: AuthSession?
    let onBack: () -> Void
    let onSignOut: () -> Void
    let onSavePersonalInfo: (PersonalInfoSaveInput) async throws -> Void

    @State private var isPersonalInfoPresented = false

    private var displayName: String {
        HomeProfileContent(user: session?.user).displayName
    }

    private var versionLabel: String {
        let version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return "DARCi v\(version?.isEmpty == false ? version ?? "1.0" : "1.0")"
    }

    var body: some View {
        ZStack {
            if isPersonalInfoPresented {
                PersonalInfoView(
                    session: session,
                    onBack: { isPersonalInfoPresented = false },
                    onSave: onSavePersonalInfo
                )
                .transition(.opacity)
            } else {
                settingsMenu
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.24), value: isPersonalInfoPresented)
    }

    private var settingsMenu: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                Button(action: onBack) {
                    DARCiArrowLeftIcon()
                        .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                        .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
                        .frame(width: scaled(32, in: proxy), height: scaled(32, in: proxy), alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")

                Text(displayName)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(32, in: proxy)))
                    .lineSpacing(scaled(3.2, in: proxy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .padding(.top, scaled(54, in: proxy))

                settingsSection(
                    title: "Profile",
                    rows: ["Personal Info", "Membership & Billing", "Illuminotary Information", "Delete my account"],
                    proxy: proxy
                )
                .padding(.top, scaled(43, in: proxy))

                settingsSection(
                    title: "Help & Support",
                    rows: ["Contact", "FAQs"],
                    proxy: proxy
                )
                .padding(.top, scaled(28, in: proxy))

                settingsSection(
                    title: "Settings",
                    rows: ["Rate us", "Privacy Policy", "Terms & Conditions"],
                    proxy: proxy
                )
                .padding(.top, scaled(28, in: proxy))

                Button(action: onSignOut) {
                    HStack(spacing: scaled(12, in: proxy)) {
                        Text("Sign out")
                            .font(DARCiFont.maisonNeue(.book, size: scaled(16, in: proxy)))
                            .lineSpacing(scaled(1.6, in: proxy))

                        SettingsSignOutIcon()
                            .stroke(.white, style: StrokeStyle(lineWidth: 1.4, lineCap: .square, lineJoin: .miter))
                            .frame(width: scaled(15, in: proxy), height: scaled(15, in: proxy))
                    }
                    .foregroundStyle(.white)
                    .frame(height: scaled(32, in: proxy), alignment: .leading)
                }
                .buttonStyle(.plain)
                .padding(.top, scaled(35, in: proxy))
                .accessibilityIdentifier("settings-sign-out-button")

                Spacer(minLength: scaled(18, in: proxy))

                Text(versionLabel)
                    .font(DARCiFont.maisonNeue(.light, size: scaled(10, in: proxy)))
                    .lineSpacing(scaled(3, in: proxy))
                    .foregroundStyle(.white)
                    .padding(.bottom, scaled(18, in: proxy))
            }
            .padding(.top, scaled(24, in: proxy))
            .padding(.horizontal, scaled(25, in: proxy))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.black.ignoresSafeArea())
            .clipped()
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func settingsSection(title: String, rows: [String], proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(DARCiFont.maisonNeue(.medium, size: scaled(20, in: proxy)))
                .lineSpacing(scaled(2, in: proxy))
                .foregroundStyle(.white)

            Rectangle()
                .fill(.white.opacity(0.72))
                .frame(height: 0.5)
                .padding(.top, scaled(13, in: proxy))

            ForEach(rows, id: \.self) { title in
                let row = HStack(spacing: 0) {
                    Text(title)
                        .font(DARCiFont.maisonNeue(.book, size: scaled(13, in: proxy)))
                        .lineSpacing(scaled(1.3, in: proxy))
                        .foregroundStyle(.white)

                    Spacer(minLength: 0)

                    SettingsChevronIcon()
                        .stroke(.white, style: StrokeStyle(lineWidth: 1.7, lineCap: .square, lineJoin: .miter))
                        .frame(width: scaled(8, in: proxy), height: scaled(14, in: proxy))
                }
                .frame(height: scaled(44, in: proxy))

                if title == "Personal Info" {
                    Button {
                        isPersonalInfoPresented = true
                    } label: {
                        row
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, minHeight: scaled(44, in: proxy), maxHeight: scaled(44, in: proxy))
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("settings-personal-info-button")
                } else {
                    row
                }
            }
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, proxy.size.height / designSize.height, 1.08)
    }
}

private struct SettingsChevronIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        return path
    }
}

private struct SettingsSignOutIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.midX * 0.9, y: rect.maxY))
        path.move(to: CGPoint(x: rect.width * 0.36, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.move(to: CGPoint(x: rect.width * 0.72, y: rect.height * 0.27))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.width * 0.72, y: rect.height * 0.73))
        return path
    }
}