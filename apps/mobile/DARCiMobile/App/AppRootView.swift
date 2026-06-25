import SwiftUI

enum AppLaunchPhase: Equatable {
    case onboarding
    case authentication
    case signedIn

    static let initial: AppLaunchPhase = .onboarding
}

struct AppRootView: View {
    @State private var launchPhase = AppLaunchPhase.initial
    @State private var selectedTab: AppTab = .home

    var body: some View {
        switch launchPhase {
        case .onboarding:
            OnboardingFlowView {
                withAnimation(.easeInOut(duration: 0.25)) {
                    launchPhase = .authentication
                }
            }
        case .authentication:
            AuthenticationSignInView(content: .signIn) {
                withAnimation(.easeInOut(duration: 0.25)) {
                    launchPhase = .signedIn
                }
            }
        case .signedIn:
            tabShell
        }
    }

    private var tabShell: some View {
        TabView(selection: $selectedTab) {
            ForEach(AppTab.allCases) { tab in
                NavigationStack {
                    content(for: tab)
                }
                .tabItem {
                    Label(tab.title, systemImage: tab.systemImage)
                }
                .tag(tab)
            }
        }
        .tint(DARCiTheme.accent)
    }

    @ViewBuilder
    private func content(for tab: AppTab) -> some View {
        switch tab {
        case .home:
            HomeView()
        case .documents, .generator, .requests, .notary:
            PlaceholderScreen(section: tab.section)
        }
    }
}

private struct PlaceholderScreen: View {
    let section: AppSection

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: section.systemImage)
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(DARCiTheme.accent)

            Text(section.title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(DARCiTheme.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DARCiTheme.background.ignoresSafeArea())
        .navigationTitle(section.title)
    }
}

#Preview {
    AppRootView()
}
