import { describe, expect, it, vi } from "vitest";
import {
  GeolocationCaptureError,
  getCurrentGeolocationSample,
} from "./geolocation";

const makePosition = (accuracy = 18): GeolocationPosition => ({
  coords: {
    latitude: 39.9612,
    longitude: -82.9988,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
  toJSON: () => ({}),
});

const makePositionError = (code: number): GeolocationPositionError => ({
  code,
  message: "location failed",
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
});

const makeGeolocation = (
  outcomes: Array<GeolocationPosition | GeolocationPositionError>,
): Geolocation => {
  const getCurrentPosition = vi.fn((
    success: PositionCallback,
    error?: PositionErrorCallback | null,
  ) => {
    const outcome = outcomes.shift();
    if (!outcome) {
      error?.(makePositionError(2));
      return;
    }

    if ("coords" in outcome) {
      success(outcome);
    } else {
      error?.(outcome);
    }
  });

  return {
    getCurrentPosition,
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
  } as unknown as Geolocation;
};

describe("getCurrentGeolocationSample", () => {
  it("retries transient browser geolocation failures", async () => {
    const geolocation = makeGeolocation([makePositionError(2), makePosition(12)]);

    const sample = await getCurrentGeolocationSample({ geolocation });

    expect(sample).toMatchObject({
      latitude: 39.9612,
      longitude: -82.9988,
      accuracyMeters: 12,
      sampleKind: "device_gps",
    });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("does not retry when permission is denied", async () => {
    const geolocation = makeGeolocation([makePositionError(1), makePosition()]);

    await expect(getCurrentGeolocationSample({ geolocation })).rejects.toMatchObject({
      code: "permission_denied",
      message: expect.stringContaining("permission is blocked"),
    });
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("throws a typed unsupported error without browser geolocation", async () => {
    await expect(getCurrentGeolocationSample({ geolocation: null })).rejects.toBeInstanceOf(
      GeolocationCaptureError,
    );
  });
});
