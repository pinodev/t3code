import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  AgentSessionImportInput,
  AgentSessionImportSelectedInput,
  AgentSessionScanResult,
} from "./agentSessions.ts";

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

describe("agent session import inputs", () => {
  const decodeUnfiltered = Schema.decodeUnknownExit(AgentSessionImportInput);
  const decodeSelected = Schema.decodeUnknownExit(AgentSessionImportSelectedInput);

  it("keeps the unfiltered import input as it was", () => {
    const decoded = decodeUnfiltered({ projectId: "project-1", expectedWorkspaceRoot: "/repo" });
    expect(decoded._tag === "Success" ? decoded.value : decoded).toEqual({
      projectId: "project-1",
      expectedWorkspaceRoot: "/repo",
    });
  });

  it("requires a provider-qualified session for a selected import", () => {
    for (const session of [
      undefined,
      {},
      { provider: "codex" },
      { provider: "codex", providerSessionId: "" },
      { provider: "codex", providerSessionId: "   " },
      { provider: "cursor", providerSessionId: "session-1" },
      { provider: "codex", providerInstanceId: "", providerSessionId: "session-1" },
    ]) {
      expect(decodeSelected({ projectId: "project-1", session })._tag).toBe("Failure");
    }
    expect(
      decodeSelected({
        projectId: "project-1",
        session: { provider: "codex", providerInstanceId: "codex", providerSessionId: "session-1" },
      })._tag,
    ).toBe("Success");
  });
});
