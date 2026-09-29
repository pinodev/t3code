import * as Encoding from "effect/Encoding";
import { CheckpointRef, ProjectId, type ThreadId } from "@t3tools/contracts";
import { resolveProjectCwdInWorktree } from "@t3tools/shared/path";

const CHECKPOINT_REFS_PREFIX = "refs/t3/checkpoints";

export function checkpointRefForThreadTurn(threadId: ThreadId, turnCount: number): CheckpointRef {
  return CheckpointRef.make(
    `${CHECKPOINT_REFS_PREFIX}/${Encoding.encodeBase64Url(threadId)}/turn/${turnCount}`,
  );
}

export function resolveThreadWorkspaceCwd(input: {
  readonly thread: {
    readonly projectId: ProjectId;
    readonly worktreePath: string | null;
  };
  readonly projects: ReadonlyArray<{
    readonly id: ProjectId;
    readonly workspaceRoot: string;
    readonly repositoryIdentity?: { readonly rootPath?: string | undefined } | null | undefined;
  }>;
}): string | undefined {
  const project = input.projects.find((candidate) => candidate.id === input.thread.projectId);
  if (!project) return input.thread.worktreePath ?? undefined;
  return resolveProjectCwdInWorktree({
    workspaceRoot: project.workspaceRoot,
    repositoryRoot: project.repositoryIdentity?.rootPath,
    worktreePath: input.thread.worktreePath,
  });
}
