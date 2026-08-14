export type BrowserGeolocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitudeMeters?: number;
  sampleKind: "device_gps";
};

export type GeolocationCaptureErrorCode =
  | "unsupported"
  | "permission_denied"
  | "timeout"
  | "unavailable";

export class GeolocationCaptureError extends Error {
  constructor(
    readonly code: GeolocationCaptureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GeolocationCaptureError";
  }
}

const attempts: PositionOptions[] = [
  { enableHighAccuracy: true, maximumAge: 120_000, timeout: 2_500 },
  { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  { enableHighAccuracy: false, maximumAge: 120_000, timeout: 10_000 },
];

const toSample = (position: GeolocationPosition): BrowserGeolocationSample => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
  altitudeMeters:
    typeof position.coords.altitude === "number" && Number.isFinite(position.coords.altitude)
      ? position.coords.altitude
      : undefined,
  sampleKind: "device_gps",
});

const getPosition = (
  geolocation: Geolocation,
  options: PositionOptions,
): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
};

const isGeolocationPositionError = (error: unknown): error is GeolocationPositionError => {
  return typeof error === "object" && error !== null && "code" in error;
};

const mapGeolocationError = (error: unknown): GeolocationCaptureError => {
  if (isGeolocationPositionError(error)) {
    if (error.code === error.PERMISSION_DENIED || error.code === 1) {
      return new GeolocationCaptureError(
        "permission_denied",
        "Location permission is blocked. Enable location access for this site and try again.",
      );
    }

    if (error.code === error.TIMEOUT || error.code === 3) {
      return new GeolocationCaptureError(
        "timeout",
        "Your device did not return a location in time. Move near a window, turn Wi-Fi on, and try again.",
      );
    }
  }

  return new GeolocationCaptureError(
    "unavailable",
    "Your current location is unavailable. Turn on Location Services and try again.",
  );
};

export const getCurrentGeolocationSample = async (input?: {
  geolocation?: Geolocation | null;
}): Promise<BrowserGeolocationSample> => {
  const geolocation = input?.geolocation ?? (
    typeof navigator === "undefined" ? null : navigator.geolocation
  );

  if (!geolocation) {
    throw new GeolocationCaptureError(
      "unsupported",
      "Location sharing is not available in this browser. Open the request in Safari, Chrome, or the DARCi mobile app.",
    );
  }

  let lastError: unknown = null;

  for (const options of attempts) {
    try {
      return toSample(await getPosition(geolocation, options));
    } catch (error) {
      const mappedError = mapGeolocationError(error);
      if (mappedError.code === "permission_denied") {
        throw mappedError;
      }

      lastError = error;
    }
  }

  throw mapGeolocationError(lastError);
};
