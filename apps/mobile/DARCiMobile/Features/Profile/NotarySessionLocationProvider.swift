import CoreLocation
import Foundation

@MainActor
protocol NotarySessionLocationProviding: AnyObject {
    func prepareForLocationCapture()
    func stopPreparingLocationCapture()
    func currentGeolocation(captureStage: String) async throws -> NotaryGeolocationPayload
}

@MainActor
extension NotarySessionLocationProviding {
    func prepareForLocationCapture() {}
    func stopPreparingLocationCapture() {}
}

@MainActor
final class CoreLocationNotarySessionProvider: NSObject, NotarySessionLocationProviding, @preconcurrency CLLocationManagerDelegate {
    private let manager: CLLocationManager
    private var pendingContinuation: CheckedContinuation<CLLocation, Error>?
    private var pendingRetryTask: Task<Void, Never>?
    private var pendingTimeoutTask: Task<Void, Never>?
    private var warmupTimeoutTask: Task<Void, Never>?
    private var cachedLocation: CLLocation?
    private var pendingRetryCount = 0
    private let maximumLocationUnknownRetries = 8
    private let maximumRecentLocationAge: TimeInterval = 120
    private let preferredAccuracyMeters: CLLocationAccuracy = 100

    override init() {
        manager = CLLocationManager()
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
    }

    func prepareForLocationCapture() {
        guard pendingContinuation == nil else { return }

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            warmupTimeoutTask?.cancel()
            manager.startUpdatingLocation()
            warmupTimeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(30))
                guard Task.isCancelled == false else { return }
                self?.stopPreparingLocationCapture()
            }
        case .notDetermined, .denied, .restricted:
            break
        @unknown default:
            break
        }
    }

    func stopPreparingLocationCapture() {
        warmupTimeoutTask?.cancel()
        warmupTimeoutTask = nil
        manager.stopUpdatingLocation()
    }

    func currentGeolocation(captureStage: String) async throws -> NotaryGeolocationPayload {
        guard pendingContinuation == nil else {
            throw NotarySessionLocationError.requestInProgress
        }

        if let recentLocation = recentUsableLocation(preferredAccuracyOnly: true) {
            return Self.payload(from: recentLocation, captureStage: captureStage)
        }

        let location = try await withCheckedThrowingContinuation { continuation in
            pendingContinuation = continuation
            pendingRetryCount = 0
            pendingTimeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(25))
                guard Task.isCancelled == false else { return }
                if let recentLocation = self?.recentUsableLocation(preferredAccuracyOnly: false) {
                    self?.finish(with: .success(recentLocation))
                } else {
                    self?.finish(with: .failure(NotarySessionLocationError.unavailable))
                }
            }

            switch manager.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                manager.requestLocation()
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            case .denied, .restricted:
                finish(with: .failure(NotarySessionLocationError.permissionDenied))
            @unknown default:
                finish(with: .failure(NotarySessionLocationError.unavailable))
            }
        }

        return Self.payload(from: location, captureStage: captureStage)
    }

    private static func payload(from location: CLLocation, captureStage: String) -> NotaryGeolocationPayload {
        return NotaryGeolocationPayload(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracyMeters: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil,
            altitudeMeters: location.verticalAccuracy >= 0 ? location.altitude : nil,
            sampleKind: "device_gps",
            captureStage: captureStage
        )
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard pendingContinuation != nil else {
            return
        }

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            finish(with: .failure(NotarySessionLocationError.permissionDenied))
        case .notDetermined:
            break
        @unknown default:
            finish(with: .failure(NotarySessionLocationError.unavailable))
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            if pendingContinuation != nil {
                finish(with: .failure(NotarySessionLocationError.unavailable))
            }
            return
        }

        if location.horizontalAccuracy >= 0 {
            cachedLocation = location
        }

        if pendingContinuation != nil {
            finish(with: .success(location))
        } else if location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= preferredAccuracyMeters {
            stopPreparingLocationCapture()
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard pendingContinuation != nil else {
            if (error as? CLError)?.code != .locationUnknown {
                stopPreparingLocationCapture()
            }
            return
        }

        if (error as? CLError)?.code == .denied {
            finish(with: .failure(NotarySessionLocationError.permissionDenied))
        } else if (error as? CLError)?.code == .locationUnknown,
                  pendingRetryCount < maximumLocationUnknownRetries {
            pendingRetryCount += 1
            pendingRetryTask?.cancel()
            pendingRetryTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(750))
                guard Task.isCancelled == false,
                      let self,
                      self.pendingContinuation != nil else { return }
                self.manager.requestLocation()
            }
        } else if let recentLocation = recentUsableLocation(preferredAccuracyOnly: false) {
            finish(with: .success(recentLocation))
        } else {
            finish(with: .failure(NotarySessionLocationError.unavailable))
        }
    }

    private func recentUsableLocation(preferredAccuracyOnly: Bool) -> CLLocation? {
        let location = cachedLocation ?? manager.location
        guard let location,
              location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) <= maximumRecentLocationAge else {
            return nil
        }

        if preferredAccuracyOnly && location.horizontalAccuracy > preferredAccuracyMeters {
            return nil
        }

        return location
    }

    private func finish(with result: Result<CLLocation, Error>) {
        let continuation = pendingContinuation
        pendingContinuation = nil
        pendingRetryTask?.cancel()
        pendingRetryTask = nil
        pendingTimeoutTask?.cancel()
        pendingTimeoutTask = nil
        stopPreparingLocationCapture()
        pendingRetryCount = 0
        continuation?.resume(with: result)
    }
}

enum NotarySessionLocationError: LocalizedError, Equatable {
    case permissionDenied
    case requestInProgress
    case unavailable

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            "Location access is required for the in-person session. Enable it in Settings and try again."
        case .requestInProgress:
            "A location request is already in progress."
        case .unavailable:
            "Your current location is unavailable. Try again from the session screen."
        }
    }
}