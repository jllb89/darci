import SwiftUI

struct NotificationCenterView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let session: AuthSession?
    private let onBack: () -> Void
    private let onOpenRoute: (PushNotificationRoute) -> Void

    @ObservedObject private var viewModel: NotificationCenterViewModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(
        session: AuthSession?,
        viewModel: NotificationCenterViewModel,
        onBack: @escaping () -> Void,
        onOpenRoute: @escaping (PushNotificationRoute) -> Void
    ) {
        self.session = session
        self.viewModel = viewModel
        self.onBack = onBack
        self.onOpenRoute = onOpenRoute
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                Button(action: onBack) {
                    DARCiArrowLeftIcon()
                        .stroke(.black, style: StrokeStyle(lineWidth: 2.0625, lineCap: .butt, lineJoin: .miter))
                        .frame(width: scaled(28, in: proxy), height: scaled(28, in: proxy))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .padding(.top, scaled(37, in: proxy))
                .padding(.leading, scaled(44, in: proxy))
                .accessibilityLabel("Back")

                Text("Notifications")
                    .font(DARCiFont.maisonNeue(.book, size: 24))
                    .lineSpacing(34)
                    .foregroundStyle(.black)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .padding(.top, scaled(54, in: proxy))
                    .padding(.horizontal, scaled(44, in: proxy))

                statusBar(in: proxy)
                    .padding(.top, scaled(18, in: proxy))
                    .padding(.horizontal, scaled(50, in: proxy))

                categoryTabs(in: proxy)
                    .padding(.top, scaled(38, in: proxy))
                    .padding(.horizontal, scaled(24, in: proxy))

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        if viewModel.isLoading && viewModel.notifications.isEmpty {
                            loadingView(in: proxy)
                                .padding(.top, scaled(90, in: proxy))
                        } else if let message = viewModel.errorMessage, viewModel.notifications.isEmpty {
                            emptyState(message, in: proxy)
                                .padding(.top, scaled(90, in: proxy))
                        } else if viewModel.notifications.isEmpty {
                            emptyState("No notifications yet.", in: proxy)
                                .padding(.top, scaled(90, in: proxy))
                        } else {
                            notificationSections(in: proxy)
                                .opacity(viewModel.isMarkingAllRead ? 0.48 : 1)
                                .animation(.easeInOut(duration: 0.16), value: viewModel.isMarkingAllRead)
                        }
                    }
                    .padding(.horizontal, scaled(44, in: proxy))
                    .padding(.bottom, scaled(48, in: proxy))
                }
                .refreshable {
                    await viewModel.load(for: session)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.white.ignoresSafeArea())
        }
        .task(id: session?.accessToken) {
            await viewModel.load(for: session)
        }
        .onChange(of: viewModel.selectedCategory) { _, _ in
            Task { await viewModel.load(for: session) }
        }
    }

    private func statusBar(in proxy: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            HStack(spacing: scaled(12, in: proxy)) {
                Circle()
                    .fill(DARCiTheme.onboardingGreen)
                    .frame(width: scaled(10, in: proxy), height: scaled(10, in: proxy))
                    .opacity(viewModel.hasUnreadNotifications ? 1 : 0)

                Text("\(viewModel.unreadCount) UNREAD")
                    .font(DARCiFont.maisonNeue(.medium, size: 10))
                    .lineSpacing(20)
                    .foregroundStyle(NotificationCenterPalette.secondaryText)
                    .lineLimit(1)
            }

            Spacer(minLength: scaled(12, in: proxy))

            Button {
                Task { await viewModel.markAllRead(for: session) }
            } label: {
                HStack(spacing: scaled(6, in: proxy)) {
                    Text("MARK ALL AS READ")
                        .font(DARCiFont.maisonNeue(.book, size: 10))
                        .lineSpacing(14)
                        .foregroundStyle(.black)
                        .underline()

                    if viewModel.isMarkingAllRead {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .controlSize(.mini)
                            .tint(.black)
                            .frame(width: scaled(10, in: proxy), height: scaled(10, in: proxy))
                    }
                }
                .frame(minHeight: 44, alignment: .center)
            }
            .buttonStyle(.plain)
            .disabled(viewModel.unreadCount == 0 || viewModel.isMarkingAllRead)
            .opacity(viewModel.unreadCount == 0 && viewModel.isMarkingAllRead == false ? 0.42 : 1)
        }
    }

    private func categoryTabs(in proxy: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: scaled(10, in: proxy)) {
                notificationTab(.all, width: notificationTabWidth(for: .all, in: proxy), alignment: .leading, in: proxy)
                notificationTab(.documents, width: notificationTabWidth(for: .documents, in: proxy), alignment: .center, in: proxy)
                notificationTab(.account, width: notificationTabWidth(for: .account, in: proxy), alignment: .trailing, in: proxy)
            }

            Rectangle()
                .fill(.black.opacity(0.12))
                .frame(height: 0.5)
                .overlay(alignment: .bottomLeading) {
                    GeometryReader { lineProxy in
                        Rectangle()
                            .fill(.black)
                            .frame(width: notificationIndicatorWidth(in: lineProxy.size.width), height: scaled(2, in: proxy))
                            .offset(x: notificationIndicatorOffset(in: lineProxy.size.width))
                    }
                }
                .frame(height: scaled(2, in: proxy))
        }
    }

    private func notificationTab(
        _ category: NotificationCenterCategory,
        width: CGFloat,
        alignment: Alignment,
        in proxy: GeometryProxy
    ) -> some View {
        Button {
            withAnimation(.timingCurve(0.16, 1.0, 0.3, 1.0, duration: 0.28)) {
                viewModel.selectedCategory = category
            }
        } label: {
            Text(category.title)
                .font(DARCiFont.maisonNeue(.mono, size: scaled(11, in: proxy)))
                .lineSpacing(scaled(11, in: proxy))
                .foregroundStyle(viewModel.selectedCategory == category ? .black : NotificationCenterPalette.inactiveText)
                .lineLimit(1)
                .minimumScaleFactor(0.9)
                .allowsTightening(true)
                .frame(width: width, alignment: alignment)
                .frame(minHeight: 44, alignment: .center)
        }
        .buttonStyle(.plain)
    }

    private func notificationTabWidth(for category: NotificationCenterCategory, in proxy: GeometryProxy) -> CGFloat {
        let availableWidth = proxy.size.width - scaled(48, in: proxy)
        return notificationTabWidth(for: category, availableWidth: availableWidth)
    }

    private func notificationTabWidth(for category: NotificationCenterCategory, availableWidth: CGFloat) -> CGFloat {
        let totalSpacing: CGFloat = 20
        let contentWidth = max(availableWidth - totalSpacing, 1)

        switch category {
        case .all:
            return contentWidth * 0.24
        case .documents:
            return contentWidth * 0.41
        case .account:
            return contentWidth * 0.35
        }
    }

    private func notificationIndicatorWidth(in availableWidth: CGFloat) -> CGFloat {
        notificationTabWidth(for: viewModel.selectedCategory, availableWidth: availableWidth) * 0.46
    }

    private func notificationIndicatorOffset(in availableWidth: CGFloat) -> CGFloat {
        let spacing: CGFloat = 10
        switch viewModel.selectedCategory {
        case .all:
            return 0
        case .documents:
            return notificationTabWidth(for: .all, availableWidth: availableWidth) + spacing
                + (notificationTabWidth(for: .documents, availableWidth: availableWidth) - notificationIndicatorWidth(in: availableWidth)) / 2
        case .account:
            return availableWidth - notificationIndicatorWidth(in: availableWidth)
        }
    }

    private func notificationSections(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if viewModel.todayNotifications.isEmpty == false {
                sectionHeader("TODAY", in: proxy)
                    .padding(.top, scaled(34, in: proxy))
                ForEach(viewModel.todayNotifications) { item in
                    notificationRow(item, in: proxy)
                }
            }

            if viewModel.earlierNotifications.isEmpty == false {
                sectionHeader("EARLIER", in: proxy)
                    .padding(.top, scaled(viewModel.todayNotifications.isEmpty ? 34 : 28, in: proxy))
                ForEach(viewModel.earlierNotifications) { item in
                    notificationRow(item, in: proxy)
                }
            }
        }
    }

    private func sectionHeader(_ title: String, in proxy: GeometryProxy) -> some View {
        Text(title)
            .font(DARCiFont.maisonNeue(.book, size: 10))
            .tracking(0.30)
            .foregroundStyle(NotificationCenterPalette.secondaryText)
            .padding(.bottom, scaled(18, in: proxy))
    }

    private func notificationRow(_ item: NotificationCenterItem, in proxy: GeometryProxy) -> some View {
        Button {
            Task {
                if let route = await viewModel.recordOpen(item, for: session) {
                    onOpenRoute(route)
                }
            }
        } label: {
            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: scaled(12, in: proxy)) {
                    Circle()
                        .fill(DARCiTheme.onboardingGreen)
                        .frame(width: scaled(10, in: proxy), height: scaled(10, in: proxy))
                        .opacity(item.isRead ? 0 : 1)
                        .padding(.top, scaled(38, in: proxy))

                    VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
                        Text(item.title)
                            .font(DARCiFont.maisonNeue(item.isRead ? .book : .medium, size: 15))
                            .lineSpacing(19)
                            .foregroundStyle(NotificationCenterPalette.primaryText)
                            .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                            .minimumScaleFactor(0.82)

                        HStack(alignment: .firstTextBaseline, spacing: scaled(10, in: proxy)) {
                            Text(item.body)
                                .font(DARCiFont.maisonNeue(.book, size: 11.5))
                                .lineSpacing(3)
                                .foregroundStyle(NotificationCenterPalette.bodyText)
                                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                                .fixedSize(horizontal: false, vertical: true)

                            Spacer(minLength: scaled(8, in: proxy))

                            Text(NotificationCenterViewModel.relativeTime(for: item.createdAt))
                                .font(DARCiFont.maisonNeue(.book, size: 9))
                                .lineSpacing(12)
                                .foregroundStyle(NotificationCenterPalette.secondaryText)
                                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                        }

                        if let metadataLabel = item.metadataLabel, metadataLabel.isEmpty == false {
                            Text(metadataLabel)
                                .font(DARCiFont.maisonNeue(.book, size: 8.5))
                                .tracking(0.09)
                                .lineSpacing(12)
                                .foregroundStyle(NotificationCenterPalette.secondaryText)
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                        }
                    }
                }
                .padding(.top, scaled(20, in: proxy))
                .padding(.bottom, scaled(20, in: proxy))

                Rectangle()
                    .fill(Color.black.opacity(0.10))
                    .frame(height: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("notification-row-\(item.id)")
    }

    private func loadingView(in proxy: GeometryProxy) -> some View {
        Text("Loading notifications...")
            .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
            .foregroundStyle(.black.opacity(0.55))
            .frame(maxWidth: .infinity, alignment: .center)
    }

    private func emptyState(_ message: String, in proxy: GeometryProxy) -> some View {
        Text(message)
            .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
            .foregroundStyle(.black.opacity(0.55))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, alignment: .center)
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        let scale = min(proxy.size.width / designSize.width, proxy.size.height / designSize.height)
        return value * max(scale, 0.82)
    }
}

private enum NotificationCenterPalette {
    static let primaryText = Color(red: 0.10, green: 0.10, blue: 0.10)
    static let bodyText = Color(red: 0.19, green: 0.19, blue: 0.19)
    static let secondaryText = Color(red: 0.49, green: 0.49, blue: 0.49)
    static let inactiveText = Color(red: 0.72, green: 0.72, blue: 0.72)
}

#Preview("Notification Center") {
    NotificationCenterView(
        session: nil,
        viewModel: NotificationCenterViewModel(apiClient: MockNotificationCenterAPIClient()),
        onBack: {},
        onOpenRoute: { _ in }
    )
}
