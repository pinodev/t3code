import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const threadId = ThreadId.make("thread-1");
const forkThreadId = ThreadId.make("thread-1-fork");

function makeThread(id: ThreadId) {
  return {
    id,
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    pullRequests: [],
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    deletedAt: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  };
}

function makeReadModel(threadIds: ReadonlyArray<ThreadId>): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: threadIds.map(makeThread),
    updatedAt: NOW,
  };
}

const command = {
  type: "thread.fork" as const,
  commandId: CommandId.make("fork-1"),
  threadId,
  forkThreadId,
  turnCount: 1,
  createdAt: NOW,
};

it.layer(NodeServices.layer)("thread fork decider", (it) => {
  it.effect("requests a fork on the source thread's stream", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command,
        readModel: makeReadModel([threadId]),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((event) => event.type)).toEqual(["thread.fork-requested"]);
      // The fork's own thread does not exist yet, so the event belongs to the
      // source aggregate and the reactor is what creates the thread.
      expect(events[0]?.aggregateId).toBe(threadId);
      expect(events[0]?.payload).toMatchObject({ threadId, forkThreadId, turnCount: 1 });
    }),
  );

  it.effect("carries an explicit fork title when one is given", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: { ...command, title: "Another direction" },
        readModel: makeReadModel([threadId]),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events[0]?.payload).toMatchObject({ title: "Another direction" });
    }),
  );

  it.effect("rejects a fork whose thread id is already taken", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command,
        readModel: makeReadModel([threadId, forkThreadId]),
      }).pipe(Effect.flip);
      expect(result._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("rejects a fork of a thread that does not exist", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command,
        readModel: makeReadModel([]),
      }).pipe(Effect.flip);
      expect(result._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});
