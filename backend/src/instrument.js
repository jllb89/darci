"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const telemetry_1 = require("./telemetry");
if (process.env.OTEL_SDK_DISABLED !== "1") {
    void (0, telemetry_1.initTelemetry)();
}
//# sourceMappingURL=instrument.js.map