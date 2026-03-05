import { initTelemetry } from "./telemetry";

if (process.env.OTEL_SDK_DISABLED !== "1") {
	void initTelemetry();
}
