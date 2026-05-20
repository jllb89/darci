import { describe, expect, it } from "vitest";

import { toStringArrayValue } from "./startPageUtils";

describe("startPageUtils", () => {
  it("preserves whitespace for repeatable text inputs while editing", () => {
    expect(toStringArrayValue(["Jamie ", " Taylor"], { trim: false })).toEqual([
      "Jamie ",
      " Taylor",
    ]);
  });

  it("trims string arrays by default for selection values", () => {
    expect(toStringArrayValue([" real_property "])).toEqual(["real_property"]);
  });
});