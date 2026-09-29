// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off
import * as NodeOS from "node:os";

import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import * as ThreadSettleRenameReactor from "./ThreadSettleRenameReactor.ts";

const NOW = "2026-09-29T12:00:00.000Z";
const PROJECT_ID = ProjectId.make("project");
const THREAD_ID = ThreadId.make("thread");
type RenameCommand = Extract<OrchestrationCommand, { type: "thread.meta.update" }>;

const project: OrchestrationProjectShell = {
  id: PROJECT_ID,
  title: "Forge",
  workspaceRoot: "C:\\kdb\\Forge",
  defaultModelSelection: null,
  scripts: [],
  createdAt: NOW,
  updatedAt: NOW,
};
const thread: OrchestrationThreadShell = {
  id: THREAD_ID,
  projectId: PROJECT_ID,
  title: "Fix login",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  pullRequests: [],
  latestTurn: null,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  settledOverride: "settled",
  settledAt: NOW,
  session: null,
  latestUserMessageAt: NOW,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};

function settledEvent(historyImport = false): OrchestrationEvent {
  return {
    sequence: 1,
    eventId: EventId.make("settled"),
    aggregateKind: "thread",
    aggregateId: THREAD_ID,
    occurredAt: NOW,
    commandId: CommandId.make("settle"),
    causationEventId: null,
    correlationId: null,
    metadata: historyImport ? { historyImport: true } : {},
    type: "thread.settled",
    payload: { threadId: THREAD_ID, settledAt: NOW, updatedAt: NOW },
  };
}

describe("ThreadSettleRenameReactor", () => {
  it.effect("ignores the settle emitted by history import", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const done = yield* Deferred.make<void>();
        const reads = yield* Ref.make(0);
        const layer = ThreadSettleRenameReactor.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.mock(OrchestrationEngineService)({
                subscribeDomainEvents: Effect.succeed(
                  Stream.fromIterable([settledEvent(true)]).pipe(
                    Stream.ensuring(Deferred.succeed(done, undefined)),
                  ),
                ),
              }),
              Layer.mock(ProjectionSnapshotQuery)({
                getShellSnapshot: () =>
                  Ref.update(reads, (count) => count + 1).pipe(
                    Effect.as({
                      snapshotSequence: 1,
                      projects: [project],
                      threads: [thread],
                      updatedAt: NOW,
                    }),
                  ),
              }),
              Layer.succeed(ServerConfig.ServerConfig, {
                baseDir: "C:\\t3home",
              } as ServerConfig.ServerConfig["Service"]),
              FileSystem.layerNoop({}),
              Layer.succeed(
                Crypto.Crypto,
                Crypto.make({
                  randomBytes: (size) => new Uint8Array(size).fill(1),
                  digest: (_algorithm, data) => Effect.succeed(data),
                }),
              ),
            ),
          ),
        );
        yield* Effect.gen(function* () {
          const reactor = yield* ThreadSettleRenameReactor.ThreadSettleRenameReactor;
          yield* reactor.start();
          yield* Deferred.await(done);
          yield* reactor.drain;
          expect(yield* Ref.get(reads)).toBe(0);
        }).pipe(Effect.provide(layer));
      }),
    ),
  );

  it.effect("renames a settled thread and re-reads aliases on another settlement", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const events = yield* PubSub.unbounded<OrchestrationEvent>();
        const reads = yield* Queue.unbounded<void>();
        const commands = yield* Ref.make<ReadonlyArray<RenameCommand>>([]);
        const aliases = yield* Ref.make(JSON.stringify({ [NodeOS.hostname()]: "PS252" }));
        const current = yield* Ref.make(thread);
        const layer = ThreadSettleRenameReactor.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.mock(OrchestrationEngineService)({
                subscribeDomainEvents: PubSub.subscribe(events).pipe(
                  Effect.map((subscription) => Stream.fromSubscription(subscription)),
                ),
                dispatch: (command) => {
                  if (command.type !== "thread.meta.update")
                    return Effect.die("unexpected command");
                  return Ref.update(commands, (all) => [...all, command]).pipe(
                    Effect.andThen(
                      Ref.update(current, (value) => ({ ...value, title: command.title! })),
                    ),
                    Effect.as({ sequence: 2 }),
                  );
                },
              }),
              Layer.mock(ProjectionSnapshotQuery)({
                getShellSnapshot: () =>
                  Ref.get(current).pipe(
                    Effect.tap(() => Queue.offer(reads, undefined)),
                    Effect.map((value) => ({
                      snapshotSequence: 1,
                      projects: [project],
                      threads: [value],
                      updatedAt: NOW,
                    })),
                  ),
              }),
              Layer.succeed(ServerConfig.ServerConfig, {
                baseDir: "C:\\t3home",
              } as ServerConfig.ServerConfig["Service"]),
              FileSystem.layerNoop({ readFileString: () => Ref.get(aliases) }),
              Layer.succeed(
                Crypto.Crypto,
                Crypto.make({
                  randomBytes: (size) => new Uint8Array(size).fill(1),
                  digest: (_algorithm, data) => Effect.succeed(data),
                }),
              ),
            ),
          ),
        );

        yield* Effect.gen(function* () {
          const reactor = yield* ThreadSettleRenameReactor.ThreadSettleRenameReactor;
          yield* reactor.start();
          yield* PubSub.publish(events, settledEvent(true));
          yield* PubSub.publish(events, settledEvent());
          yield* Queue.take(reads);
          yield* reactor.drain;
          const first = yield* Ref.get(commands);
          expect(first).toHaveLength(1);
          expect(first[0]?.title).toBe("(PS252) forge - Fix login");

          yield* Ref.set(aliases, JSON.stringify({ [NodeOS.hostname()]: "OTHER" }));
          yield* PubSub.publish(events, settledEvent());
          yield* Queue.take(reads);
          yield* reactor.drain;
          expect(yield* Ref.get(commands)).toHaveLength(1);
        }).pipe(Effect.provide(layer));
      }),
    ),
  );
});
