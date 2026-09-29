import { describe, expect, it } from "vite-plus/test";

import { parseHostAliases, settledThreadTitle } from "./threadTitles.ts";

describe("settledThreadTitle", () => {
  it("uses the case-insensitive host alias and a lower-case Windows project directory", () => {
    const aliases = parseHostAliases({ PSZCZEPANK252: "Ps252" });
    expect(settledThreadTitle("Fix login", "C:\\kdb\\Forge", "pszczepank252", aliases)).toBe(
      "(PS252) forge - Fix login",
    );
  });

  it("uses the upper-case hostname when the alias file has no matching entry", () => {
    expect(settledThreadTitle("Fix login", "D:\\t3code", "ps26", { OTHER: "X" })).toBe(
      "(PS26) t3code - Fix login",
    );
    expect(settledThreadTitle("Fix login", "/home/me/Forge", "ps26", {})).toBe(
      "(PS26) forge - Fix login",
    );
  });

  it("names a drive-root project by its drive", () => {
    const title = settledThreadTitle("Tailscale VPN setup", "C:\\", "PS26", {});
    expect(title).toBe("(PS26) c: - Tailscale VPN setup");
    expect(settledThreadTitle(title, "C:\\", "PS26", {})).toBe(title);
  });

  it("does not prefix an already renamed title, even if the host changed", () => {
    expect(settledThreadTitle("(PS252) forge - Fix login", "C:\\kdb\\forge", "PS26", {})).toBe(
      "(PS252) forge - Fix login",
    );
  });

  it("ignores invalid alias values", () => {
    expect(parseHostAliases({ PS26: "", OTHER: 12 })).toEqual({});
  });
});
