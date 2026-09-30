// @effect-diagnostics nodeBuiltinImport:off
import * as NodeOS from "node:os";

import { CommandId, type OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import { readHostAliases } from "../hostAliases.ts";
import { forkParked } from "../serverActivation.ts";
import * as OrchestrationEngine from "./Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "./Services/ProjectionSnapshotQuery.ts";
import { settledThreadTitle } from "./threadTitles.ts";

type SettledEvent = Extract<OrchestrationEvent, { type: "thread.settled" }>;

export class ThreadSettleRenameReactor extends Context.Service<
  ThreadSettleRenameReactor,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly drain: Effect.Effect<void>;
  }
>()("t3/orchestration/ThreadSettleRenameReactor") {}

export const make = Effect.gen(function* () {
  const engine = yield* OrchestrationEngine.OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const config = yield* ServerConfig.ServerConfig;
  const crypto = yield* Crypto.Crypto;

  const rename = Effect.fn("ThreadSettleRenameReactor.rename")(function* (event: SettledEvent) {
    const snapshot = yield* snapshots.getShellSnapshot();
    const thread = snapshot.threads.find((item) => item.id === event.payload.threadId);
    if (
      thread === undefined ||
      thread.archivedAt !== null ||
      (thread.settledOverride !== "settled" && thread.settledAt === null)
    )
      return;
    const project = snapshot.projects.find((item) => item.id === thread.projectId);
    if (project === undefined) return;
    // Read on every settlement so edits to the shared etc directory apply without a restart.
    const aliases = yield* readHostAliases(config.baseDir);
    const title = settledThreadTitle(
      thread.title,
      project.workspaceRoot,
      NodeOS.hostname(),
      aliases,
    );
    if (title === thread.title) return;
    const uuid = yield* crypto.randomUUIDv4;
    yield* engine.dispatch({
      type: "thread.meta.update",
      commandId: CommandId.make(`server:settle-rename:${thread.id}:${uuid}`),
      threadId: thread.id,
      title,
    });
  });

  const worker = yield* makeDrainableWorker((event: SettledEvent) =>
    rename(event).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("settled thread rename failed", {
              threadId: event.payload.threadId,
              cause: Cause.pretty(cause),
            }),
      ),
    ),
  );
  const start: ThreadSettleRenameReactor["Service"]["start"] = Effect.fn(
    "ThreadSettleRenameReactor.start",
  )(function* () {
    const events = yield* engine.subscribeDomainEvents;
    yield* forkParked(
      Stream.runForEach(events, (event) =>
        event.type === "thread.settled" && event.metadata.historyImport !== true
          ? worker.enqueue(event)
          : Effect.void,
      ),
    );
  });

  return { start, drain: worker.drain } satisfies ThreadSettleRenameReactor["Service"];
});

export const layer = Layer.effect(ThreadSettleRenameReactor, make);
