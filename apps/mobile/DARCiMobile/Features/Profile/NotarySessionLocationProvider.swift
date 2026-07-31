import CoreLocation
import Foundation

@MainActor
protocol NotarySessionLocationProviding: AnyObject {
    func currentGeolocation(captureStage: String) async throws -> NotaryGeolocationPayload
}

@MainActor
final class CoreLocationNotarySessionProvider: NSObject, NotarySessionLocationProviding, @preconcurrency CLLocationManagerDelegate {
    private let manager: CLLocationManager
    private var pendingContinuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        manager = CLLocationManager()
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func currentGeolocation(captureStage: String) async throws -> NotaryGeolocationPayload {
        guard pendingContinuation == nil else {
            throw NotarySessionLocationError.requestInProgress
        }

        let location = try await withCheckedThrowingContinuation { continuation in
            pendingContinuation = continuation

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
            finish(with: .failure(NotarySessionLocationError.unavailable))
            return
        }

        finish(with: .success(location))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(with: .failure(error))
    }

    private func finish(with result: Result<CLLocation, Error>) {
        let continuation = pendingContinuation
        pendingContinuation = nil
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