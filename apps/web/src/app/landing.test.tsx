import React from "react";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import PrivacyPage from "./privacy/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ useStoredSession: () => false, logoutStoredAuth: vi.fn() }));

const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const html = renderToStaticMarkup(<Home />);
const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));

describe("landing page acceptance", () => {
  it("gives every navigation destination a real section, existing route, or approved mailbox", () => {
    const mailboxes = new Set(["mailto:support@illuminote.io", "mailto:incidentreports@illuminote.io"]);
    for (const href of hrefs) {
      if (href.startsWith("mailto:")) {
        expect(mailboxes.has(href), href).toBe(true);
        continue;
      }
      const url = new URL(href, "https://illuminotary.com");
      expect(url.origin).toBe("https://illuminotary.com");
      if (url.hash) expect(ids.has(url.hash.slice(1)), href).toBe(true);
      expect(existsSync(path.join(webRoot, "src/app", url.pathname, "page.tsx")), href).toBe(true);
    }
    expect(hrefs).not.toContain("#");
    expect(hrefs.filter((href) => href.includes("returnTo=%2Fapp%2Fbilling"))).toHaveLength(3);
    expect(hrefs.filter((href) => href === "/start").length).toBeGreaterThanOrEqual(5);
  });

  it("replaces placeholder shapes and unverified content with decorative SVG icons", () => {
    expect((html.match(/<svg /g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(html).not.toMatch(/placehold\.co|Sarah Mitchell|h-10 w-9|h-5 w-28|h-2 w-4/);
    expect(html).not.toMatch(/no real funds move|Private-beta Checkout|Cookie Settings|Subscribe|your@email/);
    expect(html).not.toMatch(/Facebook|Instagram|LinkedIn|YouTube/);
    for (const svg of html.matchAll(/<svg ([^>]+)>/g)) expect(svg[1]).toContain('aria-hidden="true"');
  });

  it("uses semantic headings, keyboard-operable disclosure controls and a mobile navigation menu", () => {
    expect((html.match(/<h1\b/g) ?? [])).toHaveLength(1);
    expect(html).toContain('<main id="main-content">');
    expect((html.match(/<details\b/g) ?? [])).toHaveLength(9);
    expect((html.match(/<summary\b/g) ?? [])).toHaveLength(9);
    expect(html).toContain('aria-controls="landing-mobile-navigation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("scroll-mt-24");
  });

  it("keeps DARCi correctly cased, including branding labels and accessible logo text", () => {
    const privacy = renderToStaticMarkup(<PrivacyPage />);
    expect(html).not.toMatch(/\bDARCI\b|\bDarci\b|\bDarCi\b/);
    expect(privacy).not.toMatch(/\bDARCI\b|\bDarci\b|\bDarCi\b/);
    expect(html).toContain('alt="DARCi"');
    expect(html).toMatch(/<div class="[^"]*">DARCi MEMBERSHIP<\/div>/);
    expect(html).not.toMatch(/<div class="[^"]*\buppercase\b[^"]*">DARCi MEMBERSHIP/);
    expect(privacy).not.toMatch(/<p class="[^"]*\buppercase\b[^"]*">DARCi REGISTRY/);
  });

  it("ends every Essentials and Workflow description with a period", () => {
    for (const section of ["features", "how-it-works"]) {
      const markup = html.match(new RegExp(`<section id="${section}"[\\s\\S]*?<\\/section>`))?.[0];
      expect(markup, section).toBeDefined();
      const descriptions = [...markup!.matchAll(/<p\b[^>]*>([^<]+)<\/p>/g)].map((match) => match[1]);
      // Section eyebrow labels are not sentences; the four item descriptions are.
      const itemDescriptions = descriptions.filter((text) => text !== "Essentials" && text !== "Workflow");
      expect(itemDescriptions.length).toBeGreaterThanOrEqual(4);
      for (const description of itemDescriptions) expect(description, section).toMatch(/\.$/);
    }
  });

  it("uses existing local imagery and the approved support contacts on both landing and privacy pages", () => {
    const assets = new Set([
      ...[...html.matchAll(/src="(\/[^"]+)"/g)].map((match) => match[1]),
      ...[...html.matchAll(/url\(&#x27;([^&]+)&#x27;\)/g)].map((match) => match[1]),
    ]);
    expect(assets.size).toBeGreaterThanOrEqual(7);
    for (const asset of assets) expect(existsSync(path.join(webRoot, "public", asset)), asset).toBe(true);
    const privacy = renderToStaticMarkup(<PrivacyPage />);
    for (const email of ["support@illuminote.io", "incidentreports@illuminote.io"]) {
      expect(html).toContain(`mailto:${email}`);
      expect(privacy).toContain(email);
    }
    expect(privacy).not.toContain("support@darciregistry.com");
  });
});
