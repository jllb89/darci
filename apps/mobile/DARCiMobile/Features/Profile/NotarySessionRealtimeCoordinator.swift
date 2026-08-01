import Foundation
import Supabase

enum NotarySessionRealtimeState: Equatable, Sendable {
    case idle
    case connecting
    case live
    case degraded
}

struct DARCiSupabaseConfiguration: Equatable, Sendable {
    let url: URL
    let anonKey: String

    static func current(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> DARCiSupabaseConfiguration? {
        let urlValue = configuredValue(
            environment["DARCI_SUPABASE_URL"]
                ?? bundle.object(forInfoDictionaryKey: "DARCI_SUPABASE_URL") as? String
        )
        let keyValue = configuredValue(
            environment["DARCI_SUPABASE_ANON_KEY"]
                ?? bundle.object(forInfoDictionaryKey: "DARCI_SUPABASE_ANON_KEY") as? String
        )

        guard let urlValue,
              let url = URL(string: urlValue),
              ["http", "https"].contains(url.scheme?.lowercased()),
              url.host?.isEmpty == false,
              let keyValue else {
            return nil
        }

        return DARCiSupabaseConfiguration(url: url, anonKey: keyValue)
    }

    private static func configuredValue(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedValue.isEmpty == false, trimmedValue.hasPrefix("$(") == false else {
            return nil
        }
        return trimmedValue
    }
}

@MainActor
protocol NotarySessionRealtimeProviding: AnyObject {
    func start(
        requestId: String,
        accessToken: String,
        onStateChange: @escaping @MainActor @Sendable (NotarySessionRealtimeState) -> Void,
        onInvalidate: @escaping @MainActor @Sendable () async -> Void
    )
    func stop()
}

@MainActor
final class NotarySessionRealtimeCoordinator: NotarySessionRealtimeProviding {
    static let broadcastEvent = "request_changed"

    private let configuration: DARCiSupabaseConfiguration?
    private let debounceDuration: Duration
    private let minimumInvalidateInterval: Duration

    private var client: SupabaseClient?
    private var channel: RealtimeChannelV2?
    private var connectionTask: Task<Void, Never>?
    private var statusTask: Task<Void, Never>?
    private var debounceTask: Task<Void, Never>?
    private var lastInvalidationStartedAt: ContinuousClock.Instant?
    private var isInvalidating = false
    private var rerunAfterCurrentInvalidation = false
    private var onStateChange: (@MainActor @Sendable (NotarySessionRealtimeState) -> Void)?
    private var onInvalidate: (@MainActor @Sendable () async -> Void)?

    init(
        configuration: DARCiSupabaseConfiguration? = .current(),
        debounceDuration: Duration = .milliseconds(400),
        minimumInvalidateInterval: Duration = .seconds(5)
    ) {
        self.configuration = configuration
        self.debounceDuration = debounceDuration
        self.minimumInvalidateInterval = minimumInvalidateInterval
    }

    func start(
        requestId: String,
        accessToken: String,
        onStateChange: @escaping @MainActor @Sendable (NotarySessionRealtimeState) -> Void,
        onInvalidate: @escaping @MainActor @Sendable () async -> Void
    ) {
        stop()
        self.onStateChange = onStateChange
        self.onInvalidate = onInvalidate

        guard let configuration else {
            onStateChange(.degraded)
            return
        }

        onStateChange(.connecting)
        let client = SupabaseClient(
            supabaseURL: configuration.url,
            supabaseKey: configuration.anonKey,
            options: SupabaseClientOptions(
                auth: .init(
                    autoRefreshToken: false,
                    accessToken: { accessToken }
                )
            )
        )
        let channel = client.channel("request:\(requestId)") { config in
            config.isPrivate = true
            config.broadcast.acknowledgeBroadcasts = false
            config.broadcast.receiveOwnBroadcasts = false
        }
        let broadcasts = channel.broadcastStream(event: Self.broadcastEvent)
        self.client = client
        self.channel = channel

        connectionTask = Task { [weak self] in
            do {
                try await channel.subscribeWithError()
                guard Task.isCancelled == false else { return }
                self?.handleState(.live)
                self?.observeStatus(of: channel)

                for await _ in broadcasts {
                    guard Task.isCancelled == false else { return }
                    self?.scheduleInvalidation()
                }
            } catch is CancellationError {
                return
            } catch {
                guard Task.isCancelled == false else { return }
                self?.handleState(.degraded)
            }
        }
    }

    func stop() {
        connectionTask?.cancel()
        connectionTask = nil
        statusTask?.cancel()
        statusTask = nil
        debounceTask?.cancel()
        debounceTask = nil
        isInvalidating = false
        rerunAfterCurrentInvalidation = false
        lastInvalidationStartedAt = nil
        onInvalidate = nil
        onStateChange?(.idle)
        onStateChange = nil

        let client = client
        let channel = channel
        self.client = nil
        self.channel = nil
        Task {
            if let client, let channel {
                await client.removeChannel(channel)
            }
        }
    }

    private func observeStatus(of channel: RealtimeChannelV2) {
        statusTask?.cancel()
        statusTask = Task { [weak self] in
            for await status in channel.statusChange {
                guard Task.isCancelled == false else { return }
                switch status {
                case .subscribed:
                    self?.handleState(.live)
                case .subscribing:
                    self?.handleState(.connecting)
                case .unsubscribed:
                    self?.handleState(.degraded)
                case .unsubscribing:
                    break
                }
            }
        }
    }

    private func handleState(_ state: NotarySessionRealtimeState) {
        onStateChange?(state)
    }

    private func scheduleInvalidation() {
        if isInvalidating {
            rerunAfterCurrentInvalidation = true
            return
        }

        debounceTask?.cancel()
        let clock = ContinuousClock()
        let elapsed = lastInvalidationStartedAt.map { $0.duration(to: clock.now) }
        let throttleDelay = elapsed.map { max(.zero, minimumInvalidateInterval - $0) } ?? .zero
        let delay = max(debounceDuration, throttleDelay)

        debounceTask = Task { [weak self] in
            do {
                try await Task.sleep(for: delay)
            } catch {
                return
            }
            guard Task.isCancelled == false else { return }
            await self?.runInvalidation()
        }
    }

    private func runInvalidation() async {
        guard let onInvalidate else { return }
        isInvalidating = true
        lastInvalidationStartedAt = ContinuousClock().now
        await onInvalidate()
        isInvalidating = false

        if rerunAfterCurrentInvalidation {
            rerunAfterCurrentInvalidation = false
            scheduleInvalidation()
        }
    }
}
