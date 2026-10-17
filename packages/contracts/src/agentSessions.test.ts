import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { AgentSessionImportInput, AgentSessionScanResult } from "./agentSessions.ts";

const decodeScanResult = Schema.decodeUnknownSync(AgentSessionScanResult);

const candidate = {
  path: "/projects/repo",
  title: "repo",
  sources: ["codex"],
  threadCount: 3,
  lastActiveAt: "2026-08-20T12:00:00.000Z",
  alreadyImported: false,
} as const;

describe("AgentSessionScanResult", () => {
  it("decodes candidates from servers that predate the git scan", () => {
    const result = decodeScanResult({
      candidates: [candidate],
      scannedAt: "2026-08-22T12:00:00.000Z",
    });

    expect(result.candidates[0]?.git).toBeUndefined();
  });

  it("preserves reported git identity", () => {
    const git = { remoteKey: "github.com/pingdotgg/t3code", repository: "pingdotgg/t3code" };
    const result = decodeScanResult({
      candidates: [{ ...candidate, git }],
      scannedAt: "2026-08-22T12:00:00.000Z",
    });

    expect(result.candidates[0]?.git).toEqual(git);
  });
});

describe("AgentSessionImportInput", () => {
  const decode = Schema.decodeUnknownExit(AgentSessionImportInput);

  it("keeps older callers that send no session unfiltered", () => {
    const decoded = decode({ projectId: "project-1" });
    expect(decoded._tag).toBe("Success");
    expect(decoded._tag === "Success" ? decoded.value.session : "failed").toBeUndefined();
  });

  it("rejects an empty, blank, or unknown-provider session selector", () => {
    for (const session of [
      {},
      { provider: "codex" },
      { provider: "codex", providerSessionId: "" },
      { provider: "codex", providerSessionId: "   " },
      { provider: "cursor", providerSessionId: "session-1" },
      { provider: "codex", providerInstanceId: "", providerSessionId: "session-1" },
    ]) {
      expect(decode({ projectId: "project-1", session })._tag).toBe("Failure");
    }
  });

  it("accepts a provider-qualified session selector", () => {
    expect(
      decode({
        projectId: "project-1",
        session: { provider: "codex", providerInstanceId: "codex", providerSessionId: "session-1" },
      })._tag,
    ).toBe("Success");
  });
});
