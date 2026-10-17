import { describe, expect, it } from "@effect/vitest";
import {
  AgentSessionImportInput,
  AgentSessionImportResult,
  ProjectId,
  ThreadId,
  WS_METHODS,
  WsAgentSessionsImportRpc,
  WsAgentSessionsImportSelectedRpc,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import type * as RpcMessage from "effect/unstable/rpc/RpcMessage";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

const PROJECT_ID = ProjectId.make("project-1");
const SELECTED = {
  projectId: PROJECT_ID,
  session: { provider: "codex", providerSessionId: "codex-b" },
} as const;

// A server built before agentSessions.importSelected existed: it knows only the
// unfiltered import, with its original input.
const LegacyAgentSessionsGroup = RpcGroup.make(
  Rpc.make(WS_METHODS.agentSessionsImport, {
    payload: AgentSessionImportInput,
    success: AgentSessionImportResult,
  }),
);
const CurrentAgentSessionsGroup = RpcGroup.make(
  WsAgentSessionsImportRpc,
  WsAgentSessionsImportSelectedRpc,
);

/**
 * The current client, wired through the RPC client/server machinery to `serverGroup`.
 * The two groups differ on purpose (an older server), so messages cross untyped.
 */
const connectCurrentClient = <Rpcs extends Rpc.Any>(serverGroup: RpcGroup.RpcGroup<Rpcs>) =>
  Effect.gen(function* () {
    let toClient: (response: RpcMessage.FromServer<Rpcs>) => Effect.Effect<void> = () =>
      Effect.void;
    const server = yield* RpcServer.makeNoSerialization(serverGroup, {
      onFromServer: (response) => toClient(response),
    });
    const current = yield* RpcClient.makeNoSerialization(WsRpcGroup, {
      supportsAck: true,
      onFromClient: ({ message }) => server.write(0, message as never),
    });
    toClient = (response) => current.write(response as never);
    return current.client;
  });

describe("agentSessions.importSelected over RPC", () => {
  it.effect("a server without it rejects a selected import and imports nothing", () => {
    const legacyCalls: Array<unknown> = [];
    return Effect.gen(function* () {
      const client = yield* connectCurrentClient(LegacyAgentSessionsGroup);

      const selected = yield* Effect.exit(client[WS_METHODS.agentSessionsImportSelected](SELECTED));
      expect(Exit.isFailure(selected)).toBe(true);
      expect(Exit.isFailure(selected) ? Cause.pretty(selected.cause) : "").toContain(
        "Unknown request tag: agentSessions.importSelected",
      );
      expect(legacyCalls).toEqual([]);

      // Ordinary callers of the old method still reach the old server.
      const unfiltered = yield* client[WS_METHODS.agentSessionsImport]({ projectId: PROJECT_ID });
      expect(unfiltered).toEqual({ importedCount: 3, skippedCount: 0 });
      expect(legacyCalls).toEqual([{ projectId: PROJECT_ID }]);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        LegacyAgentSessionsGroup.toLayer({
          [WS_METHODS.agentSessionsImport]: (input) =>
            Effect.sync(() => {
              legacyCalls.push(input);
              return { importedCount: 3, skippedCount: 0 };
            }),
        }),
      ),
    );
  });

  it.effect("a current server routes a selected import only to the selected handler", () => {
    const unfilteredCalls: Array<unknown> = [];
    const selectedCalls: Array<unknown> = [];
    return Effect.gen(function* () {
      const client = yield* connectCurrentClient(CurrentAgentSessionsGroup);

      const selected = yield* client[WS_METHODS.agentSessionsImportSelected](SELECTED);
      expect(selected.importedThreadIds).toEqual(["import:codex:codex-b"]);
      expect(selectedCalls).toEqual([SELECTED]);
      expect(unfilteredCalls).toEqual([]);

      yield* client[WS_METHODS.agentSessionsImport]({ projectId: PROJECT_ID });
      expect(unfilteredCalls).toEqual([{ projectId: PROJECT_ID }]);
      expect(selectedCalls).toHaveLength(1);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          CurrentAgentSessionsGroup.toLayer({
            [WS_METHODS.agentSessionsImport]: (input) =>
              Effect.sync(() => {
                unfilteredCalls.push(input);
                return { importedCount: 3, skippedCount: 0 };
              }),
            [WS_METHODS.agentSessionsImportSelected]: (input) =>
              Effect.sync(() => {
                selectedCalls.push(input);
                return {
                  importedCount: 1,
                  skippedCount: 0,
                  importedThreadIds: [ThreadId.make("import:codex:codex-b")],
                };
              }),
          }),
        ),
      ),
    );
  });
});
