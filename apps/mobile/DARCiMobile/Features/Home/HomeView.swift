import SwiftUI

struct HomeView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let session: AuthSession?
    private let onProductSelected: (HomeProductCard) -> Void
    private let onProfileAction: () -> Void
    private let onSettingsAction: () -> Void
    private let hasUnreadNotifications: Bool
    private let onNotificationsAction: () -> Void
    private let membershipPrompt: MemberBillingHomePrompt?
    private let onMembershipAction: () -> Void

    @StateObject private var viewModel: HomeViewModel
    @Binding private var selectedProductModeKey: String?
    @Binding private var selectedTab: AppTab
    @State private var visibleGroupCount = 0
    @State private var entranceAnimationID = UUID()

    init(
        session: AuthSession? = nil,
        viewModel: HomeViewModel = HomeViewModel(),
        selectedProductModeKey: Binding<String?> = .constant(nil),
        selectedTab: Binding<AppTab> = .constant(.home),
        onProductSelected: @escaping (HomeProductCard) -> Void = { _ in },
        onProfileAction: @escaping () -> Void = {},
        onSettingsAction: @escaping () -> Void = {},
        hasUnreadNotifications: Bool = false,
        onNotificationsAction: @escaping () -> Void = {},
        membershipPrompt: MemberBillingHomePrompt? = nil,
        onMembershipAction: @escaping () -> Void = {}
    ) {
        self.session = session
        self.onProductSelected = onProductSelected
        self.onProfileAction = onProfileAction
        self.onSettingsAction = onSettingsAction
        self.hasUnreadNotifications = hasUnreadNotifications
        self.onNotificationsAction = onNotificationsAction
        self.membershipPrompt = membershipPrompt
        self.onMembershipAction = onMembershipAction
        _viewModel = StateObject(wrappedValue: viewModel)
        _selectedProductModeKey = selectedProductModeKey
        _selectedTab = selectedTab
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    header(in: proxy)
                        .padding(.top, scaled(46, in: proxy))
                        .padding(.horizontal, scaled(33, in: proxy))
                        .homeRevealOrder(0, visibleGroupCount: visibleGroupCount)

                    welcome(in: proxy)
                        .padding(.top, scaled(44, in: proxy))
                        .padding(.horizontal, scaled(33, in: proxy))
                        .homeRevealOrder(1, visibleGroupCount: visibleGroupCount)

                    if let membershipPrompt {
                        membershipCard(membershipPrompt, in: proxy)
                            .padding(.top, scaled(24, in: proxy))
                            .padding(.horizontal, scaled(14, in: proxy))
                            .homeRevealOrder(2, visibleGroupCount: visibleGroupCount)
                    }

                    productStatus(in: proxy)
                        .padding(.top, scaled(membershipPrompt == nil ? 34 : 24, in: proxy))
                        .padding(.horizontal, scaled(14, in: proxy))
                        .homeRevealOrder(3, visibleGroupCount: visibleGroupCount)

                    productGrid(in: proxy)
                        .padding(.top, scaled(34, in: proxy))
                        .padding(.horizontal, scaled(14, in: proxy))
                        .padding(.bottom, scaled(64, in: proxy))
                        .homeRevealOrder(4, visibleGroupCount: visibleGroupCount, verticalOffset: 14)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.white.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) {
                bottomToolbar(in: proxy)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: session?.accessToken) {
            await viewModel.loadProducts(for: session)
            clearUnavailableProductSelection()
        }
        .onAppear(perform: startEntranceAnimation)
    }

    private func header(in proxy: GeometryProxy) -> some View {
        let profile = HomeProfileContent(user: session?.user)

        return HStack(alignment: .center, spacing: 0) {
            Button(action: onSettingsAction) {
                ZStack {
                    Circle()
                        .fill(DARCiTheme.onboardingGreen)
                        .frame(width: scaled(45, in: proxy), height: scaled(45, in: proxy))

                    Text(profile.initials)
                        .font(DARCiFont.maisonNeue(.medium, size: 20))
                        .lineSpacing(26)
                        .foregroundStyle(.black)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Profile initials \(profile.initials)")
            .accessibilityIdentifier("home-settings-button")

            Button(action: onNotificationsAction) {
                ZStack(alignment: .topTrailing) {
                    HomeResourceIconGlyph(icon: .bellHome)
                        .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                        .frame(width: scaled(24, in: proxy), height: scaled(24, in: proxy))

                    Circle()
                        .fill(DARCiTheme.onboardingGreen)
                        .frame(width: scaled(8, in: proxy), height: scaled(8, in: proxy))
                        .offset(x: scaled(4, in: proxy), y: -scaled(4, in: proxy))
                        .opacity(hasUnreadNotifications ? 1 : 0)
                }
                .frame(width: scaled(36, in: proxy), height: scaled(36, in: proxy))
            }
            .buttonStyle(.plain)
            .padding(.leading, scaled(21, in: proxy))
            .accessibilityLabel("Notifications")
            .accessibilityValue(hasUnreadNotifications ? "Unread notifications" : "No unread notifications")
            .accessibilityIdentifier("home-notifications-button")

            HomeResourceIconGlyph(icon: .search)
                .stroke(.black, style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                .padding(.leading, scaled(18, in: proxy))
                .accessibilityLabel("Search")

            Spacer(minLength: 0)

            HomeProfileButton(title: profile.roleLabel, action: onProfileAction)
        }
        .frame(maxWidth: .infinity, minHeight: scaled(45, in: proxy), alignment: .leading)
    }

    private func welcome(in proxy: GeometryProxy) -> some View {
        Text("Welcome to DARCi.")
            .font(DARCiFont.maisonNeue(.demi, size: 24))
            .lineSpacing(31.2)
            .foregroundStyle(.black)
            .frame(width: scaled(374, in: proxy), alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("home-welcome-title")
    }

    private func membershipCard(_ prompt: MemberBillingHomePrompt, in proxy: GeometryProxy) -> some View {
        Button(action: onMembershipAction) {
            HStack(alignment: .center, spacing: scaled(18, in: proxy)) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(prompt.eyebrow)
                        .font(DARCiFont.abcMono(size: 9))
                        .foregroundStyle(Color.black.opacity(0.72))

                    Text(prompt.title)
                        .font(DARCiFont.maisonNeue(.book, size: 18))
                        .foregroundStyle(.black)
                        .padding(.top, scaled(8, in: proxy))

                    Text(prompt.message)
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .lineSpacing(3)
                        .foregroundStyle(Color.black.opacity(0.55))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, scaled(7, in: proxy))

                    Text(prompt.actionTitle)
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .foregroundStyle(.black)
                        .underline()
                        .padding(.top, scaled(14, in: proxy))
                }

                Spacer(minLength: 0)

                ZStack {
                    Circle()
                        .fill(.black)

                    HomeResourceIconGlyph(icon: .smallArrow)
                        .stroke(DARCiTheme.onboardingGreen, style: StrokeStyle(lineWidth: 1.6, lineCap: .butt, lineJoin: .miter))
                        .padding(scaled(12, in: proxy))
                }
                .frame(width: scaled(42, in: proxy), height: scaled(42, in: proxy))
            }
            .padding(.horizontal, scaled(20, in: proxy))
            .padding(.vertical, scaled(21, in: proxy))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DARCiTheme.onboardingGreen)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-membership-prompt")
        .accessibilityLabel("\(prompt.title). \(prompt.actionTitle)")
    }

    @ViewBuilder
    private func productStatus(in proxy: GeometryProxy) -> some View {
        if viewModel.isLoadingProducts {
            ProgressView()
                .tint(.black)
                .scaleEffect(0.72)
                .frame(height: scaled(14, in: proxy), alignment: .leading)
                .accessibilityLabel("Loading products")
        } else if let productLoadMessage = viewModel.productLoadMessage {
            Text(productLoadMessage)
                .font(DARCiFont.maisonNeue(.book, size: 10))
                .lineSpacing(13)
                .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                .frame(height: scaled(14, in: proxy), alignment: .leading)
                .accessibilityIdentifier("home-product-load-message")
        } else {
            EmptyView()
        }
    }

    private func productGrid(in proxy: GeometryProxy) -> some View {
        let spacing = scaled(12, in: proxy)
        let columns = [
            GridItem(.flexible(), spacing: spacing),
            GridItem(.flexible(), spacing: spacing)
        ]

        return LazyVGrid(columns: columns, alignment: .leading, spacing: spacing) {
            ForEach(viewModel.productCards) { card in
                HomeProductCardView(
                    card: card,
                    isSelected: selectedProductModeKey == card.modeKey
                ) {
                    selectedProductModeKey = card.modeKey
                    onProductSelected(card)
                }
            }
        }
    }

    private func clearUnavailableProductSelection() {
        guard let selectedProductModeKey else {
            return
        }

        if viewModel.productCards.contains(where: { $0.modeKey == selectedProductModeKey }) == false {
            self.selectedProductModeKey = nil
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, 1.08)
    }

    private func bottomToolbar(in proxy: GeometryProxy) -> some View {
        HomeBottomToolbar(selectedTab: $selectedTab)
            .frame(width: scaled(241, in: proxy), height: scaled(25, in: proxy))
            .frame(maxWidth: .infinity)
            .padding(.top, scaled(10, in: proxy))
            .padding(.bottom, scaled(12, in: proxy))
            .background(Color.white)
            .homeRevealOrder(5, visibleGroupCount: visibleGroupCount, verticalOffset: 6)
    }

    private func startEntranceAnimation() {
        let animationID = UUID()
        entranceAnimationID = animationID
        visibleGroupCount = 0

        for groupIndex in 1...6 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(groupIndex - 1) * 0.09) {
                guard entranceAnimationID == animationID else {
                    return
                }

                withAnimation(.easeOut(duration: 0.36)) {
                    visibleGroupCount = groupIndex
                }
            }
        }
    }
}

private struct HomeRevealModifier: ViewModifier {
    let order: Int
    let visibleGroupCount: Int
    let verticalOffset: CGFloat

    private var isVisible: Bool {
        visibleGroupCount > order
    }

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible ? 0 : verticalOffset)
    }
}

private extension View {
    func homeRevealOrder(
        _ order: Int,
        visibleGroupCount: Int,
        verticalOffset: CGFloat = 10
    ) -> some View {
        modifier(HomeRevealModifier(
            order: order,
            visibleGroupCount: visibleGroupCount,
            verticalOffset: verticalOffset
        ))
    }
}

private struct HomeProfileButton: View {
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
        .accessibilityIdentifier("home-profile-button")
    }
}

private struct HomeProductCardView: View {
    let card: HomeProductCard
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topLeading) {
                Color(red: 0.85, green: 0.85, blue: 0.85)

                VStack(alignment: .leading, spacing: 0) {
                    Text(card.title)
                        .font(DARCiFont.maisonNeue(.medium, size: 15))
                        .lineSpacing(19.5)
                        .foregroundStyle(Color(red: 0.19, green: 0.19, blue: 0.19))
                        .fixedSize(horizontal: false, vertical: true)

                    HomeResourceIconGlyph(icon: .smallArrow)
                        .stroke(Color(red: 0.19, green: 0.19, blue: 0.19), style: StrokeStyle(lineWidth: 1.5, lineCap: .butt, lineJoin: .miter))
                        .frame(width: 12, height: 12)
                        .padding(.top, 30)
                        .accessibilityHidden(true)

                    Spacer(minLength: 18)

                    Text(card.description)
                        .font(DARCiFont.maisonNeue(.light, size: 10))
                        .lineSpacing(3)
                        .foregroundStyle(Color(red: 0.49, green: 0.49, blue: 0.49))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 18)
                .padding(.trailing, 18)
                .padding(.top, 23)
                .padding(.bottom, 25)
            }
            .aspectRatio(200 / 251.53, contentMode: .fit)
            .clipShape(Rectangle())
            .contentShape(Rectangle())
            .overlay {
                Rectangle()
                    .stroke(isSelected ? Color.black : Color.clear, lineWidth: 1.5)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-product-card-\(card.modeKey)")
        .accessibilityLabel(card.title)
        .accessibilityValue(isSelected ? "Selected" : "")
    }
}

private struct HomeBottomToolbar: View {
    @Binding var selectedTab: AppTab

    var body: some View {
        HStack(spacing: 83) {
            toolbarButton(tab: .home, icon: .home)
            toolbarButton(tab: .documents, icon: .file)
            toolbarButton(tab: .requests, icon: .mail)
        }
        .frame(width: 241, height: 25)
        .accessibilityElement(children: .contain)
    }

    private func toolbarButton(tab: AppTab, icon: HomeProductIcon) -> some View {
        Button {
            selectedTab = tab
        } label: {
            HomeResourceIconGlyph(icon: icon)
                .stroke(selectedTab == tab ? DARCiTheme.onboardingGreen : .black, style: StrokeStyle(lineWidth: 2.0625, lineCap: .butt, lineJoin: .miter))
                .frame(width: 25, height: 25)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
    }
}

private struct HomeResourceIconGlyph: Shape {
    let icon: HomeProductIcon

    func path(in rect: CGRect) -> Path {
        switch icon {
        case .bellHome:
            bellHomePath(in: rect)
        case .file:
            filePath(in: rect)
        case .home:
            homePath(in: rect)
        case .mail:
            mailPath(in: rect)
        case .search:
            searchPath(in: rect)
        case .smallArrow:
            smallArrowPath(in: rect)
        }
    }

    private func point(_ x: CGFloat, _ y: CGFloat, in rect: CGRect, source: CGFloat) -> CGPoint {
        CGPoint(x: rect.minX + (x / source) * rect.width, y: rect.minY + (y / source) * rect.height)
    }

    private func bellHomePath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 24
        let drawingRect = rect.insetBy(dx: rect.width * 0.08, dy: rect.height * 0.08)

        path.move(to: point(22, 17, in: drawingRect, source: source))
        path.addLine(to: point(2, 17, in: drawingRect, source: source))
        path.addCurve(
            to: point(5, 14, in: drawingRect, source: source),
            control1: point(3.65685, 17, in: drawingRect, source: source),
            control2: point(5, 15.6569, in: drawingRect, source: source)
        )
        path.addLine(to: point(5, 9, in: drawingRect, source: source))
        path.addCurve(
            to: point(12, 2, in: drawingRect, source: source),
            control1: point(5, 5.13401, in: drawingRect, source: source),
            control2: point(8.13401, 2, in: drawingRect, source: source)
        )
        path.addCurve(
            to: point(19, 9, in: drawingRect, source: source),
            control1: point(15.866, 2, in: drawingRect, source: source),
            control2: point(19, 5.13401, in: drawingRect, source: source)
        )
        path.addLine(to: point(19, 14, in: drawingRect, source: source))
        path.addCurve(
            to: point(22, 17, in: drawingRect, source: source),
            control1: point(19, 15.6569, in: drawingRect, source: source),
            control2: point(20.3431, 17, in: drawingRect, source: source)
        )
        path.move(to: point(13.73, 21, in: drawingRect, source: source))
        path.addCurve(
            to: point(10.27, 21, in: drawingRect, source: source),
            control1: point(13.373, 21.6179, in: drawingRect, source: source),
            control2: point(12.7138, 22, in: drawingRect, source: source)
        )

        return path
    }

    private func filePath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 25

        path.move(to: point(13.5417, 2.08325, in: rect, source: source))
        path.addLine(to: point(6.25001, 2.08325, in: rect, source: source))
        path.addCurve(
            to: point(4.16667, 4.16659, in: rect, source: source),
            control1: point(5.10493, 2.08325, in: rect, source: source),
            control2: point(4.16667, 3.02151, in: rect, source: source)
        )
        path.addLine(to: point(4.16667, 20.8333, in: rect, source: source))
        path.addCurve(
            to: point(6.25001, 22.9166, in: rect, source: source),
            control1: point(4.16667, 21.9791, in: rect, source: source),
            control2: point(5.10417, 22.9166, in: rect, source: source)
        )
        path.addLine(to: point(18.75, 22.9166, in: rect, source: source))
        path.addCurve(
            to: point(20.8333, 20.8333, in: rect, source: source),
            control1: point(19.8951, 22.9166, in: rect, source: source),
            control2: point(20.8333, 21.9784, in: rect, source: source)
        )
        path.addLine(to: point(20.8333, 9.37492, in: rect, source: source))
        path.addLine(to: point(13.5417, 2.08325, in: rect, source: source))
        path.closeSubpath()
        path.move(to: point(13.5417, 3.125, in: rect, source: source))
        path.addLine(to: point(13.5417, 9.375, in: rect, source: source))
        path.addLine(to: point(19.7917, 9.375, in: rect, source: source))

        return path
    }

    private func homePath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 25

        path.move(to: point(3.125, 9.37492, in: rect, source: source))
        path.addLine(to: point(12.5, 2.08325, in: rect, source: source))
        path.addLine(to: point(21.875, 9.37492, in: rect, source: source))
        path.addLine(to: point(21.875, 20.8333, in: rect, source: source))
        path.addCurve(
            to: point(19.7917, 22.9166, in: rect, source: source),
            control1: point(21.875, 21.9784, in: rect, source: source),
            control2: point(20.9368, 22.9166, in: rect, source: source)
        )
        path.addLine(to: point(5.20833, 22.9166, in: rect, source: source))
        path.addCurve(
            to: point(3.125, 20.8333, in: rect, source: source),
            control1: point(4.06318, 22.9166, in: rect, source: source),
            control2: point(3.125, 21.9784, in: rect, source: source)
        )
        path.addLine(to: point(3.125, 9.37492, in: rect, source: source))
        path.closeSubpath()
        path.move(to: point(9.375, 22.9167, in: rect, source: source))
        path.addLine(to: point(9.375, 12.5, in: rect, source: source))
        path.addLine(to: point(15.625, 12.5, in: rect, source: source))
        path.addLine(to: point(15.625, 22.9167, in: rect, source: source))

        return path
    }

    private func mailPath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 25

        path.move(to: point(4.16666, 4.16675, in: rect, source: source))
        path.addLine(to: point(20.8333, 4.16675, in: rect, source: source))
        path.addCurve(
            to: point(22.9167, 6.25008, in: rect, source: source),
            control1: point(21.9792, 4.16675, in: rect, source: source),
            control2: point(22.9167, 5.10425, in: rect, source: source)
        )
        path.addLine(to: point(22.9167, 18.7501, in: rect, source: source))
        path.addCurve(
            to: point(20.8333, 20.8334, in: rect, source: source),
            control1: point(22.9167, 19.8959, in: rect, source: source),
            control2: point(21.9792, 20.8334, in: rect, source: source)
        )
        path.addLine(to: point(4.16666, 20.8334, in: rect, source: source))
        path.addCurve(
            to: point(2.08333, 18.7501, in: rect, source: source),
            control1: point(3.02083, 20.8334, in: rect, source: source),
            control2: point(2.08333, 19.8959, in: rect, source: source)
        )
        path.addLine(to: point(2.08333, 6.25008, in: rect, source: source))
        path.addCurve(
            to: point(4.16666, 4.16675, in: rect, source: source),
            control1: point(2.08333, 5.10425, in: rect, source: source),
            control2: point(3.02083, 4.16675, in: rect, source: source)
        )
        path.closeSubpath()
        path.move(to: point(22.9167, 6.25, in: rect, source: source))
        path.addLine(to: point(12.5, 13.5417, in: rect, source: source))
        path.addLine(to: point(2.08333, 6.25, in: rect, source: source))

        return path
    }

    private func searchPath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 18

        path.addEllipse(in: CGRect(
            x: rect.minX + (0.75 / source) * rect.width,
            y: rect.minY + (0.75 / source) * rect.height,
            width: (14.2222 / source) * rect.width,
            height: (14.2222 / source) * rect.height
        ))
        path.move(to: point(16.75, 16.7501, in: rect, source: source))
        path.addLine(to: point(12.8833, 12.8834, in: rect, source: source))

        return path
    }

    private func smallArrowPath(in rect: CGRect) -> Path {
        var path = Path()
        let source: CGFloat = 12

        path.move(to: point(0, 5.53027, in: rect, source: source))
        path.addLine(to: point(9.28571, 5.53027, in: rect, source: source))
        path.move(to: point(5, 0.530273, in: rect, source: source))
        path.addLine(to: point(10, 5.53027, in: rect, source: source))
        path.addLine(to: point(5, 10.5303, in: rect, source: source))

        return path
    }
}

#Preview {
    NavigationStack {
        HomeView(session: AuthSession.preview)
    }
}

private extension AuthSession {
    static let preview = AuthSession(
        accessToken: "preview-access-token",
        refreshToken: "preview-refresh-token",
        user: AuthenticatedUser(
            id: "preview-user",
            email: "jorge@example.com",
            phone: "+15555550123",
            role: "member",
            availableRoles: ["member", "notary"],
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
