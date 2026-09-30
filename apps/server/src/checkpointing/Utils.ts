import * as Encoding from "effect/Encoding";
import { CheckpointRef, ProjectId, type ThreadId } from "@t3tools/contracts";
import { resolveProjectCwdInWorktree } from "@t3tools/shared/path";

const CHECKPOINT_REFS_PREFIX = "refs/t3/checkpoints";

export function checkpointRefForThreadTurn(threadId: ThreadId, turnCount: number): CheckpointRef {
  return CheckpointRef.make(
    `${CHECKPOINT_REFS_PREFIX}/${Encoding.encodeBase64Url(threadId)}/turn/${turnCount}`,
  );
}

// A turn recorded without a filesystem snapshot (the workspace is not a git
// repository) still needs a ref in the ledger. This one is not a git ref and
// never resolves, so file restore and diff treat the turn as having no snapshot.
export function turnLedgerRefForThreadTurn(threadId: ThreadId, turnCount: number): CheckpointRef {
  return CheckpointRef.make(`turn-ledger:${Encoding.encodeBase64Url(threadId)}:${turnCount}`);
}

export function resolveThreadWorkspaceCwd(input: {
  readonly thread: {
    readonly projectId: ProjectId;
    readonly worktreePath: string | null;
  };
  readonly projects: ReadonlyArray<{
    readonly id: ProjectId;
    readonly workspaceRoot: string;
    readonly gitRootPath?: string | null | undefined;
    readonly repositoryIdentity?: { readonly rootPath?: string | undefined } | null | undefined;
  }>;
}): string | undefined {
  const project = input.projects.find((candidate) => candidate.id === input.thread.projectId);
  if (!project) return input.thread.worktreePath ?? undefined;
  return resolveProjectCwdInWorktree({
    workspaceRoot: project.workspaceRoot,
    repositoryRoot: project.gitRootPath ?? project.repositoryIdentity?.rootPath,
    worktreePath: input.thread.worktreePath,
  });
}
