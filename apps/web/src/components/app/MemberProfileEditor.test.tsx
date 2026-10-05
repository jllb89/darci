import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MemberProfileEditor } from "./MemberProfileEditor";

vi.mock("@/lib/auth", () => ({ useStoredUser: () => ({ id: "member", firstName: "Jorge Luis", lastName: "Lopez", email: "member@example.com", phone: "+14155550123" }) }));
vi.mock("@/lib/memberProfile", () => ({}));

it("offers individually labeled profile edits without changing the existing card typography", () => {
  const html = renderToStaticMarkup(<MemberProfileEditor />);
  expect(html).toContain("Jorge Luis Lopez"); expect(html).toContain("member@example.com"); expect(html).toContain("+14155550123");
  for (const field of ["name", "email", "phone"]) expect(html).toContain(`aria-label="Edit ${field}"`);
  expect(html).toContain("text-sm"); expect(html).toContain("break-all");
  expect(html).not.toContain("Verification code");
});
