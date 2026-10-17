import * as Schema from "effect/Schema";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

/** Coding agent home directories the scanner knows how to read. */
export const AgentSessionSource = Schema.Literals(["claudeAgent", "codex"]);
export type AgentSessionSource = typeof AgentSessionSource.Type;

/** File identity saved with an imported session so bounded retries can skip unchanged history. */
export const AgentSessionImportSource = Schema.Struct({
  provider: AgentSessionSource,
  providerInstanceId: ProviderInstanceId,
  providerSessionId: TrimmedNonEmptyString,
  filePath: TrimmedNonEmptyString,
  size: NonNegativeInt,
  mtimeMs: Schema.NullOr(Schema.Number),
  device: Schema.Number,
  inode: Schema.NullOr(Schema.Number),
  birthtimeMs: Schema.NullOr(Schema.Number),
});
export type AgentSessionImportSource = typeof AgentSessionImportSource.Type;

/** Imported message ids retain their origin after event metadata is projected into SQLite. */
export function isImportedAgentSessionMessageId(messageId: string): boolean {
  return messageId.startsWith("import:");
}

/**
 * Empty for now. Kept as a struct so future scan options (source filters,
 * explicit roots) can be added without a new method.
 */
export const AgentSessionScanInput = Schema.Struct({});
export type AgentSessionScanInput = typeof AgentSessionScanInput.Type;

/**
 * A directory that at least one agent CLI has run in, suitable for import as a
 * T3 Code project. `alreadyImported` marks candidates that already have an
 * active project rooted at the same path.
 */
/**
 * Git identity of a candidate directory, read from `.git/config` without
 * spawning git. `remoteKey` is the normalized origin URL, shared by every
 * clone of the same repository so the client can group them. `repository`
 * is the GitHub `owner/name` when the origin is on GitHub.
 */
export const AgentSessionProjectGit = Schema.Struct({
  remoteKey: Schema.NullOr(Schema.String),
  repository: Schema.NullOr(Schema.String),
});
export type AgentSessionProjectGit = typeof AgentSessionProjectGit.Type;

export const AgentSessionProjectCandidate = Schema.Struct({
  path: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  projectId: Schema.optional(ProjectId),
  sources: Schema.Array(AgentSessionSource),
  threadCount: NonNegativeInt,
  lastActiveAt: Schema.NullOr(IsoDateTime),
  alreadyImported: Schema.Boolean,
  /**
   * `null` when the directory is not the root of a git repository. Missing on
   * servers that predate the git scan, where the client cannot tell repositories
   * from plain folders and should treat every candidate as a standalone project.
   */
  git: Schema.optionalKey(Schema.NullOr(AgentSessionProjectGit)),
});
export type AgentSessionProjectCandidate = typeof AgentSessionProjectCandidate.Type;

export const AgentSessionScanResult = Schema.Struct({
  candidates: Schema.Array(AgentSessionProjectCandidate),
  scannedAt: IsoDateTime,
  truncated: Schema.optional(Schema.Boolean),
});
export type AgentSessionScanResult = typeof AgentSessionScanResult.Type;

/**
 * Names exactly one provider session to import. The provider (and, when the same
 * id could exist under several configured instances, the instance) qualifies the
 * id, so a Codex and a Claude session can never be confused.
 */
export const AgentSessionImportSelector = Schema.Struct({
  provider: AgentSessionSource,
  providerInstanceId: Schema.optional(ProviderInstanceId),
  providerSessionId: TrimmedNonEmptyString,
});
export type AgentSessionImportSelector = typeof AgentSessionImportSelector.Type;

/** Imports every eligible recent transcript of the project. */
export const AgentSessionImportInput = Schema.Struct({
  projectId: ProjectId,
  expectedWorkspaceRoot: Schema.optional(TrimmedNonEmptyString),
});
export type AgentSessionImportInput = typeof AgentSessionImportInput.Type;

/**
 * Imports exactly one session, through its own method: a server that predates
 * it rejects the method instead of reading the request as a whole-project import.
 * A selector that matches nothing fails without importing anything.
 */
export const AgentSessionImportSelectedInput = Schema.Struct({
  projectId: ProjectId,
  expectedWorkspaceRoot: Schema.optional(TrimmedNonEmptyString),
  session: AgentSessionImportSelector,
});
export type AgentSessionImportSelectedInput = typeof AgentSessionImportSelectedInput.Type;

export class AgentSessionImportProjectNotFoundError extends Schema.TaggedError<AgentSessionImportProjectNotFoundError>()(
  "AgentSessionImportProjectNotFoundError",
  { projectId: ProjectId },
) {
  override get message(): string {
    return `Project '${this.projectId}' does not exist.`;
  }
}

export class AgentSessionImportProjectChangedError extends Schema.TaggedError<AgentSessionImportProjectChangedError>()(
  "AgentSessionImportProjectChangedError",
  { projectId: ProjectId },
) {
  override get message(): string {
    return `Project '${this.projectId}' changed directories. Scan for projects again before importing history.`;
  }
}

export class AgentSessionImportSessionNotFoundError extends Schema.TaggedError<AgentSessionImportSessionNotFoundError>()(
  "AgentSessionImportSessionNotFoundError",
  { projectId: ProjectId, session: AgentSessionImportSelector },
) {
  override get message(): string {
    return `No recent ${this.session.provider} session '${this.session.providerSessionId}' was found for project '${this.projectId}'. Nothing was imported.`;
  }
}

export class AgentSessionImportSessionAmbiguousError extends Schema.TaggedError<AgentSessionImportSessionAmbiguousError>()(
  "AgentSessionImportSessionAmbiguousError",
  {
    projectId: ProjectId,
    session: AgentSessionImportSelector,
    providerInstanceIds: Schema.Array(ProviderInstanceId),
  },
) {
  override get message(): string {
    return `${this.session.provider} session '${this.session.providerSessionId}' exists under several provider instances (${this.providerInstanceIds.join(", ")}). Name the instance; nothing was imported.`;
  }
}

export class AgentSessionImportSessionInUseError extends Schema.TaggedError<AgentSessionImportSessionInUseError>()(
  "AgentSessionImportSessionInUseError",
  {
    projectId: ProjectId,
    session: AgentSessionImportSelector,
    ownerThreadIds: Schema.Array(ThreadId),
  },
) {
  override get message(): string {
    return `${this.session.provider} session '${this.session.providerSessionId}' already continues in thread ${this.ownerThreadIds.join(", ")}. Nothing was imported.`;
  }
}

export const AgentSessionImportResult = Schema.Struct({
  importedCount: NonNegativeInt,
  skippedCount: NonNegativeInt,
  /** Set for a selected-session import: the thread the session now lives in. */
  importedThreadIds: Schema.optional(Schema.Array(ThreadId)),
});
export type AgentSessionImportResult = typeof AgentSessionImportResult.Type;

export class AgentSessionScanError extends Schema.TaggedError<AgentSessionScanError>()(
  "AgentSessionScanError",
  {
    operation: Schema.Literals(["read-settings", "read-projects", "read-bindings"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to scan agent sessions during ${this.operation}.`;
  }
}
