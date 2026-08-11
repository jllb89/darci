import SwiftUI

struct NotificationCenterView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let session: AuthSession?
    private let onBack: () -> Void
    private let onOpenRoute: (PushNotificationRoute) -> Void

    @ObservedObject private var viewModel: NotificationCenterViewModel

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
                header(in: proxy)
                    .padding(.top, scaled(54, in: proxy))
                    .padding(.horizontal, scaled(28, in: proxy))

                statusBar(in: proxy)
                    .padding(.top, scaled(26, in: proxy))
                    .padding(.horizontal, scaled(33, in: proxy))

                categoryTabs(in: proxy)
                    .padding(.top, scaled(32, in: proxy))

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
                        }
                    }
                    .padding(.horizontal, scaled(33, in: proxy))
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

    private func header(in proxy: GeometryProxy) -> some View {
        HStack(spacing: scaled(22, in: proxy)) {
            Button(action: onBack) {
                NotificationBackIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                    .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                    .frame(width: scaled(32, in: proxy), height: scaled(32, in: proxy))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")

            Text("Notifications")
                .font(DARCiFont.maisonNeue(.book, size: scaled(24, in: proxy)))
                .foregroundStyle(.black)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Spacer(minLength: 0)
        }
    }

    private func statusBar(in proxy: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            HStack(spacing: scaled(8, in: proxy)) {
                Circle()
                    .fill(DARCiTheme.onboardingGreen)
                    .frame(width: scaled(8, in: proxy), height: scaled(8, in: proxy))
                    .opacity(viewModel.hasUnreadNotifications ? 1 : 0)

                Text("\(viewModel.unreadCount) UNREAD")
                    .font(DARCiFont.maisonNeue(.demi, size: scaled(12, in: proxy)))
                    .foregroundStyle(.black)
                    .lineLimit(1)
            }

            Spacer(minLength: scaled(12, in: proxy))

            Button {
                Task { await viewModel.markAllRead(for: session) }
            } label: {
                Text("MARK ALL AS READ")
                    .font(DARCiFont.maisonNeue(.demi, size: scaled(11, in: proxy)))
                    .foregroundStyle(.black)
                    .underline()
            }
            .buttonStyle(.plain)
            .disabled(viewModel.unreadCount == 0)
            .opacity(viewModel.unreadCount == 0 ? 0.42 : 1)
        }
    }

    private func categoryTabs(in proxy: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(NotificationCenterCategory.allCases) { category in
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            viewModel.selectedCategory = category
                        }
                    } label: {
                        VStack(spacing: scaled(13, in: proxy)) {
                            Text(category.title)
                                .font(DARCiFont.maisonNeue(.demi, size: scaled(12, in: proxy)))
                                .foregroundStyle(.black.opacity(viewModel.selectedCategory == category ? 1 : 0.42))
                                .lineLimit(1)

                            Rectangle()
                                .fill(viewModel.selectedCategory == category ? Color.black : Color.clear)
                                .frame(height: 1.5)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }

            Rectangle()
                .fill(Color.black.opacity(0.16))
                .frame(height: 1)
        }
    }

    private func notificationSections(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if viewModel.todayNotifications.isEmpty == false {
                sectionHeader("TODAY", in: proxy)
                    .padding(.top, scaled(28, in: proxy))
                ForEach(viewModel.todayNotifications) { item in
                    notificationRow(item, in: proxy)
                }
            }

            if viewModel.earlierNotifications.isEmpty == false {
                sectionHeader("EARLIER", in: proxy)
                    .padding(.top, scaled(viewModel.todayNotifications.isEmpty ? 28 : 38, in: proxy))
                ForEach(viewModel.earlierNotifications) { item in
                    notificationRow(item, in: proxy)
                }
            }
        }
    }

    private func sectionHeader(_ title: String, in proxy: GeometryProxy) -> some View {
        Text(title)
            .font(DARCiFont.maisonNeue(.demi, size: scaled(11, in: proxy)))
            .foregroundStyle(.black.opacity(0.44))
            .padding(.bottom, scaled(8, in: proxy))
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
                        .frame(width: scaled(8, in: proxy), height: scaled(8, in: proxy))
                        .opacity(item.isRead ? 0 : 1)
                        .padding(.top, scaled(8, in: proxy))

                    VStack(alignment: .leading, spacing: scaled(5, in: proxy)) {
                        HStack(alignment: .firstTextBaseline, spacing: scaled(10, in: proxy)) {
                            Text(item.title)
                                .font(DARCiFont.maisonNeue(item.isRead ? .book : .demi, size: scaled(15, in: proxy)))
                                .foregroundStyle(.black)
                                .lineLimit(2)
                                .minimumScaleFactor(0.82)

                            Spacer(minLength: scaled(8, in: proxy))

                            Text(NotificationCenterViewModel.relativeTime(for: item.createdAt))
                                .font(DARCiFont.maisonNeue(.book, size: scaled(10, in: proxy)))
                                .foregroundStyle(.black.opacity(0.48))
                                .lineLimit(1)
                        }

                        Text(item.body)
                            .font(DARCiFont.maisonNeue(.book, size: scaled(12, in: proxy)))
                            .foregroundStyle(.black.opacity(0.64))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)

                        if let metadataLabel = item.metadataLabel, metadataLabel.isEmpty == false {
                            Text(metadataLabel)
                                .font(DARCiFont.maisonNeue(.demi, size: scaled(9, in: proxy)))
                                .foregroundStyle(.black.opacity(0.42))
                                .lineLimit(1)
                                .minimumScaleFactor(0.72)
                        }
                    }
                }
                .padding(.vertical, scaled(17, in: proxy))

                Rectangle()
                    .fill(Color.black.opacity(0.10))
                    .frame(height: 1)
                    .padding(.leading, scaled(20, in: proxy))
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

private struct NotificationBackIcon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        return path
    }
}

#Preview("Notification Center") {
    NotificationCenterView(
        session: nil,
        viewModel: NotificationCenterViewModel(apiClient: MockNotificationCenterAPIClient()),
        onBack: {},
        onOpenRoute: { _ in }
    )
}