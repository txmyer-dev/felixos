import { describe, expect, it } from "vitest";

import { classifyRef, isUuid, type RefCandidate } from "./entity-ref.js";

const acme: RefCandidate = { id: "11111111-1111-1111-1111-111111111111", name: "Acme Corp" };
const acmeSub: RefCandidate = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Acme Subsidiary"
};
const globex: RefCandidate = { id: "33333333-3333-3333-3333-333333333333", name: "Globex" };

describe("isUuid", () => {
  it("accepts a uuid and rejects a name", () => {
    expect(isUuid(acme.id)).toBe(true);
    expect(isUuid("Acme Corp")).toBe(false);
  });
});

describe("classifyRef", () => {
  it("resolves a unique case-insensitive exact match", () => {
    expect(classifyRef("acme corp", [acme, globex])).toEqual({
      kind: "resolved",
      id: acme.id,
      name: "Acme Corp"
    });
  });

  it("resolves a uuid reference directly", () => {
    expect(classifyRef(acme.id, [acme, acmeSub])).toEqual({
      kind: "resolved",
      id: acme.id,
      name: "Acme Corp"
    });
  });

  it("returns ambiguous candidates for multiple exact matches", () => {
    const dupe: RefCandidate = { id: "44444444-4444-4444-4444-444444444444", name: "Acme Corp" };
    const result = classifyRef("Acme Corp", [acme, dupe]);
    expect(result.kind).toBe("ambiguous");
    expect(result.kind === "ambiguous" && result.candidates).toHaveLength(2);
  });

  it("returns ambiguous candidates for substring matches when no exact match", () => {
    const result = classifyRef("Acme", [acme, acmeSub, globex]);
    expect(result.kind).toBe("ambiguous");
    expect(result.kind === "ambiguous" && result.candidates.map((c) => c.id)).toEqual([
      acme.id,
      acmeSub.id
    ]);
  });

  it("returns none for no match and for empty input", () => {
    expect(classifyRef("Nonexistent", [acme, globex])).toEqual({ kind: "none" });
    expect(classifyRef("   ", [acme])).toEqual({ kind: "none" });
  });
});
