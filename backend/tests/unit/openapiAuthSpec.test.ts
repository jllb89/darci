import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const openapiPath = path.resolve(__dirname, "../../../api/openapi.yaml");

describe("OpenAPI auth contract", () => {
  it("does not publish duplicate /auth/refresh response status keys", () => {
    const openapi = fs.readFileSync(openapiPath, "utf8");
    const refreshOperation = openapi.match(/  \/auth\/refresh:[\s\S]*?\n  \/users\/me:/)?.[0];

    expect(refreshOperation).toBeTruthy();

    const responseStatuses = Array.from(
      (refreshOperation ?? "").matchAll(/^        "(\d{3})":/gm),
      (match) => match[1],
    );

    expect(responseStatuses).toEqual(["200", "400", "401", "403", "500"]);
    expect(new Set(responseStatuses).size).toBe(responseStatuses.length);
  });
});
