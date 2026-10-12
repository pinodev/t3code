import {
  MAX_SCRIPT_ID_LENGTH,
  SCRIPT_RUN_COMMAND_PATTERN,
  type KeybindingCommand,
  type ProjectScript,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
const isScriptRunCommand = Schema.is(SCRIPT_RUN_COMMAND_PATTERN);

export interface ProjectScriptInput {
  readonly name: ProjectScript["name"];
  readonly command: ProjectScript["command"];
  readonly icon: ProjectScript["icon"];
  readonly runOnWorktreeCreate: ProjectScript["runOnWorktreeCreate"];
  readonly waitForSetup: boolean;
  readonly previewUrl: Exclude<ProjectScript["previewUrl"], undefined> | null;
  readonly autoOpenPreview: boolean;
}

export function buildProjectScript(id: string, input: ProjectScriptInput): ProjectScript {
  return {
    id,
    name: input.name,
    command: input.command,
    icon: input.icon,
    runOnWorktreeCreate: input.runOnWorktreeCreate,
    ...(input.runOnWorktreeCreate && input.waitForSetup ? { async: false } : {}),
    ...(input.previewUrl === null
      ? {}
      : {
          previewUrl: input.previewUrl,
          autoOpenPreview: input.autoOpenPreview,
        }),
  };
}

function normalizeScriptId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    return "script";
  }
  if (cleaned.length <= MAX_SCRIPT_ID_LENGTH) {
    return cleaned;
  }
  return cleaned.slice(0, MAX_SCRIPT_ID_LENGTH).replace(/-+$/g, "") || "script";
}

/** Legacy script IDs may not support shortcuts; keep those scripts usable without one. */
export function commandForProjectScript(scriptId: string): KeybindingCommand | null {
  const command = `script.${scriptId}.run`;
  return isScriptRunCommand(command) ? command : null;
}

export function projectScriptIdFromCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!isScriptRunCommand(trimmed)) {
    return null;
  }
  const [prefix, , suffix] = SCRIPT_RUN_COMMAND_PATTERN.parts;
  return trimmed.slice(prefix.literal.length, -suffix.literal.length);
}

export function nextProjectScriptId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(Array.from(existingIds));
  const baseId = normalizeScriptId(name);
  if (!taken.has(baseId)) return baseId;

  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = `${baseId}-${suffix}`;
    const safeCandidate =
      candidate.length <= MAX_SCRIPT_ID_LENGTH
        ? candidate
        : `${baseId.slice(0, Math.max(1, MAX_SCRIPT_ID_LENGTH - String(suffix).length - 1))}-${suffix}`;
    if (!taken.has(safeCandidate)) {
      return safeCandidate;
    }
    suffix += 1;
  }

  // This last-resort fallback only triggers after exhausting thousands of suffixes.
  return `${baseId}-${Date.now()}`.slice(0, MAX_SCRIPT_ID_LENGTH);
}

export function primaryProjectScript(scripts: ReadonlyArray<ProjectScript>): ProjectScript | null {
  const regular = scripts.find((script) => !script.runOnWorktreeCreate);
  return regular ?? scripts[0] ?? null;
}

/** Placeholders an action's command can use, e.g. `echo {threadTitle}`. Each is also
    exported to the action's terminal as T3CODE_<NAME> (threadTitle -> T3CODE_THREAD_TITLE),
    which is the quoting-safe way to pass free text such as titles. */
export const PROJECT_SCRIPT_PLACEHOLDERS = [
  "serverGuid",
  "serverName",
  "projectGuid",
  "projectName",
  "projectRoot",
  "threadGuid",
  "threadTitle",
  "threadProvider",
  "threadModel",
  "threadEffort",
  "branch",
  "worktreePath",
  "cwd",
] as const;

export type ProjectScriptPlaceholder = (typeof PROJECT_SCRIPT_PLACEHOLDERS)[number];
export type ProjectScriptContext = Partial<Record<ProjectScriptPlaceholder, string | null>>;

const isProjectScriptPlaceholder = (name: string): name is ProjectScriptPlaceholder =>
  (PROJECT_SCRIPT_PLACEHOLDERS as readonly string[]).includes(name);

// Values are typed into a terminal: a line break would submit a second command.
const singleLine = (value: string) => value.replace(/[\r\n]+/g, " ");

/** Replaces known `{placeholder}`s with the context's values (empty when unknown for this
    thread). Anything else in braces, such as a PowerShell script block, is left untouched. */
export function expandProjectScriptPlaceholders(
  command: string,
  context: ProjectScriptContext,
): string {
  return command.replace(/\{([A-Za-z]+)\}/g, (match, name: string) =>
    isProjectScriptPlaceholder(name) ? singleLine(context[name] ?? "") : match,
  );
}

/** The same context as T3CODE_* environment variables, skipping empty values. */
export function projectScriptContextEnv(context: ProjectScriptContext): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of PROJECT_SCRIPT_PLACEHOLDERS) {
    const value = context[name];
    if (value) env[`T3CODE_${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`] = value;
  }
  return env;
}
