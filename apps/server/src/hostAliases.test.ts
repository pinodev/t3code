import { describe, expect, it } from "vite-plus/test";

import { parseHostAliases, resolveHostAlias } from "./hostAliases.ts";

describe("host aliases", () => {
  it("matches hostnames without case sensitivity and uppercases the alias", () => {
    expect(resolveHostAlias("pszczepank252", parseHostAliases({ PSZCZEPANK252: "Ps252" }))).toBe(
      "PS252",
    );
  });

  it("falls back to an uppercased hostname for invalid or missing aliases", () => {
    expect(resolveHostAlias("ps26", parseHostAliases({ PS26: "", OTHER: 42 }))).toBe("PS26");
  });
});
