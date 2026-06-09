import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/index";

describe("GET /health", () => {
  it("returns ok", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(typeof response.headers["x-request-id"]).toBe("string");
    expect((response.headers["x-request-id"] as string).length).toBeGreaterThan(0);
  });

  it("echoes caller provided x-request-id", async () => {
    const response = await request(app)
      .get("/health")
      .set("X-Request-Id", "phase2-health-test-request-id");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("phase2-health-test-request-id");
  });
});
