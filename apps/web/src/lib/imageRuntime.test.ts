import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));

describe("patched image runtime", () => {
  // GHSA-wq5f-xc86-pv6w: sharp < 0.35.5 ships vulnerable librsvg binaries.
  it("locks sharp and the native binaries to the reviewed patched release", () => {
    expect(manifest.overrides.sharp).toBe("0.35.5");
    const packages = Object.entries(lock.packages) as [string, { version?: string }][];
    const sharpPackages = packages.filter(([name]) => /(?:^|\/)node_modules\/sharp$/.test(name));
    expect(sharpPackages.length).toBeGreaterThan(0);
    for (const [, pkg] of sharpPackages) expect(pkg.version).toBe("0.35.5");
    const nativePackages = packages.filter(([name]) => name.includes("node_modules/@img/sharp-"));
    expect(nativePackages.length).toBeGreaterThan(0);
    for (const [name, pkg] of nativePackages) {
      expect(pkg.version, name).toBe(name.includes("sharp-libvips-") ? "1.3.4" : "0.35.5");
    }
  });

  it("still renders and resizes SVG images with the patched native runtime", async () => {
    const sharp = require("sharp");
    expect(sharp.versions.sharp).toBe("0.35.5");
    expect(sharp.versions.rsvg).toBe("2.63.2");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#00ff00"/></svg>');
    const { info } = await sharp(svg).resize(20, 20).png().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 20, height: 20, format: "png" });
  });
});
