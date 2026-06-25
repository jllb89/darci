import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

struct OnboardingScreenContent: Equatable {
    let brand: String
    let headline: String
    let ctaTitle: String

    var accessibilityHeadline: String {
        headline.replacingOccurrences(of: "\n", with: " ")
    }

    static let splash = OnboardingScreenContent(
        brand: "DARCi",
        headline: "Illuminotarization\nthat keeps up with your workflow.",
        ctaTitle: "Start"
    )
}

struct OnboardingStoryContent: Identifiable, Equatable {
    let id: Int
    let imageName: String
    let message: String

    var accessibilityMessage: String {
        message.replacingOccurrences(of: "\n", with: " ")
    }

    static let all: [OnboardingStoryContent] = [
        OnboardingStoryContent(
            id: 0,
            imageName: "onboarding1",
            message: "Members get documents notarized in seconds not hours. Notaries handle more work without burning out."
        ),
        OnboardingStoryContent(
            id: 1,
            imageName: "onboarding2",
            message: "Every step meets legal standards. Watermarking, sealing, hashing, and ledger anchoring happen automatically so compliance is never a question."
        ),
        OnboardingStoryContent(
            id: 2,
            imageName: "onboarding3",
            message: "Watermarking, sealing, hashing, and ledger anchoring happen automatically. Compliance isn't something you chase—it's something you get."
        ),
        OnboardingStoryContent(
            id: 3,
            imageName: "onboarding4",
            message: "Members complete notarization faster. Notaries handle more volume without exhaustion. The work moves at a pace that feels natural, not rushed."
        )
    ]
}

struct OnboardingFlowView: View {
    enum Stage {
        case splash
        case stories
    }

    var onFinished: () -> Void = {}

    @State private var stage: Stage = .splash

    var body: some View {
        ZStack {
            DARCiTheme.onboardingImageFallback
                .ignoresSafeArea()

            FullBleedBundledImage(name: "onboarding1", fileExtension: "png")
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            switch stage {
            case .splash:
                OnboardingSplashView(content: .splash) {
                    withAnimation(.easeInOut(duration: 0.35)) {
                        stage = .stories
                    }
                }
                .transition(.opacity)
            case .stories:
                OnboardingStoriesView(stories: OnboardingStoryContent.all, onClose: onFinished, onComplete: onFinished)
                    .transition(.opacity)
            }
        }
    }
}

private struct OnboardingSplashView: View {
    private let designSize = CGSize(width: 440, height: 956)

    let content: OnboardingScreenContent
    let onStart: () -> Void

    @State private var isCopyVisible = false
    @State private var isButtonVisible = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    splashCopy(in: proxy)
                    startButtonContainer(in: proxy)
                }
            }
            .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
        .accessibilityIdentifier("onboarding-splash")
        .onAppear(perform: startIntroAnimation)
    }

    private func splashCopy(in proxy: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: scaled(29, in: proxy)) {
            Text(content.brand)
                .font(DARCiFont.maisonNeue(.medium, size: scaled(24, in: proxy)))
                .tracking(0.24)
                .lineSpacing(scaled(4.8, in: proxy))

            Text(content.headline)
                .font(DARCiFont.maisonNeue(.light, size: scaled(20, in: proxy)))
                .lineSpacing(scaled(6, in: proxy))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(content.accessibilityHeadline)
                .padding(.leading, scaled(34, in: proxy))
        }
        .foregroundStyle(.white)
            .padding(.top, scaled(94, in: proxy))
            .padding(.leading, scaled(20, in: proxy))
            .padding(.trailing, scaled(20, in: proxy))
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(isCopyVisible ? 1 : 0)
        .offset(y: isCopyVisible ? 0 : scaled(8, in: proxy))
        .accessibilityHidden(!isCopyVisible)
    }

    private func startIntroAnimation() {
        isCopyVisible = false
        isButtonVisible = false

        withAnimation(.easeOut(duration: 0.70).delay(0.15)) {
            isCopyVisible = true
        }

        withAnimation(.easeOut(duration: 0.55).delay(0.85)) {
            isButtonVisible = true
        }
    }

    private func startButton(in proxy: GeometryProxy) -> some View {
        Button(action: onStart) {
            HStack(spacing: scaled(8, in: proxy)) {
                Spacer()

                Text(content.ctaTitle)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                    .lineSpacing(scaled(2.2, in: proxy))
                    .foregroundStyle(.black)

                DARCiArrowCornerIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(16, in: proxy), height: scaled(16, in: proxy))
                    .accessibilityHidden(true)
            }
            .padding(.trailing, scaled(42, in: proxy))
            .frame(width: scaled(404, in: proxy), height: scaled(54, in: proxy))
            .background(DARCiTheme.onboardingGreen)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("onboarding-start-button")
    }

    private func startButtonContainer(in proxy: GeometryProxy) -> some View {
        VStack {
            Spacer()
            startButton(in: proxy)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, scaled(98, in: proxy))
        .opacity(isButtonVisible ? 1 : 0)
        .offset(y: isButtonVisible ? 0 : scaled(10, in: proxy))
        .allowsHitTesting(isButtonVisible)
        .accessibilityHidden(!isButtonVisible)
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, proxy.size.height / designSize.height)
    }
}

private struct OnboardingStoriesView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let storyDuration: TimeInterval = 5
    private let tickInterval: TimeInterval = 0.05
    private let timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()

    let stories: [OnboardingStoryContent]
    let onClose: () -> Void
    let onComplete: () -> Void

    @State private var currentStoryIndex = 0
    @State private var progress: CGFloat = 0

    private var currentStory: OnboardingStoryContent {
        stories[min(currentStoryIndex, stories.count - 1)]
    }

    var body: some View {
        ZStack {
            if currentStoryIndex > 0 {
                FullBleedBundledImage(name: currentStory.imageName, fileExtension: "png")
                    .id(currentStory.imageName)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .transition(.opacity)
                    .accessibilityHidden(true)
            }

            DARCiTheme.onboardingScrim
                .ignoresSafeArea()

            storyTapZones

            GeometryReader { proxy in
                ZStack {
                    StoryTimelineView(storyCount: stories.count, currentIndex: currentStoryIndex, progress: progress)
                        .frame(width: scaled(404, in: proxy), height: scaled(2, in: proxy))
                        .position(x: proxy.size.width / 2, y: proxy.size.height / 2 + scaled(-400, in: proxy))

                    closeButton(in: proxy)
                        .position(
                            x: proxy.size.width / 2 + scaled(190, in: proxy),
                            y: proxy.size.height / 2 + scaled(-374, in: proxy)
                        )

                    Text(currentStory.message)
                        .font(DARCiFont.maisonNeue(.light, size: scaled(20, in: proxy)))
                        .lineSpacing(scaled(6, in: proxy))
                        .foregroundStyle(.white)
                        .frame(width: scaled(392, in: proxy), alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel(currentStory.accessibilityMessage)
                        .accessibilityIdentifier("onboarding-story-message")
                        .id(currentStory.id)
                        .transition(.opacity)
                        .position(
                            x: proxy.size.width / 2,
                            y: proxy.size.height / 2 + scaled(-288, in: proxy)
                        )
                }
            }
            .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
        .accessibilityIdentifier("onboarding-stories")
        .onAppear {
            progress = 0
        }
        .onReceive(timer) { _ in
            tickStoryProgress()
        }
    }

    private func closeButton(in proxy: GeometryProxy) -> some View {
        Button(action: onClose) {
            Image(systemName: "xmark")
                .font(.system(size: scaled(18, in: proxy), weight: .medium))
                .foregroundStyle(.white)
                .frame(width: scaled(25, in: proxy), height: scaled(25, in: proxy))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close onboarding")
    }

    private func tickStoryProgress() {
        guard !stories.isEmpty else {
            return
        }

        let nextProgress = progress + CGFloat(tickInterval / storyDuration)

        if nextProgress >= 1 {
            advanceStory()
        } else {
            progress = nextProgress
        }
    }

    private func advanceStory() {
        guard !stories.isEmpty else {
            onComplete()
            return
        }

        if currentStoryIndex < stories.count - 1 {
            currentStoryIndex += 1
            progress = 0
        } else {
            onComplete()
        }
    }

    private var storyTapZones: some View {
        HStack(spacing: 0) {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture(perform: retreatStory)

            Color.clear
                .contentShape(Rectangle())
                .onTapGesture(perform: advanceStory)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private func retreatStory() {
        if currentStoryIndex > 0 {
            currentStoryIndex -= 1
        }

        progress = 0
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, proxy.size.height / designSize.height)
    }
}

private struct StoryTimelineView: View {
    let storyCount: Int
    let currentIndex: Int
    let progress: CGFloat

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<storyCount, id: \.self) { index in
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color(red: 0.39, green: 0.39, blue: 0.39).opacity(0.61))

                        Rectangle()
                            .fill(DARCiTheme.onboardingGreen)
                            .frame(width: proxy.size.width * fillAmount(for: index))
                    }
                }
            }
        }
    }

    private func fillAmount(for index: Int) -> CGFloat {
        if index < currentIndex {
            return 1
        }

        if index == currentIndex {
            return min(max(progress, 0), 1)
        }

        return 0
    }
}

private struct FullBleedBundledImage: View {
    let name: String
    let fileExtension: String

    var body: some View {
        GeometryReader { proxy in
            #if canImport(UIKit)
            if let image = bundledImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: proxy.size.width, height: proxy.size.height)
            } else {
                DARCiTheme.onboardingImageFallback
                    .frame(width: proxy.size.width, height: proxy.size.height)
            }
            #else
            DARCiTheme.onboardingImageFallback
                .frame(width: proxy.size.width, height: proxy.size.height)
            #endif
        }
        .clipped()
    }

#if canImport(UIKit)
    private var bundledImage: UIImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: fileExtension) else {
            return nil
        }

        return UIImage(contentsOfFile: url.path)
    }
#endif
}

#Preview {
    OnboardingFlowView()
}
