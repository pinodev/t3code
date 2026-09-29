// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

export const DEFAULT_THREAD_TITLE = "New thread";

export function parseHostAliases(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    ),
  );
}

export function settledThreadTitle(
  title: string,
  workspaceRoot: string,
  hostname: string,
  aliases: Readonly<Record<string, string>>,
): string {
  // A drive root (C:\) has no basename; name it by its drive instead ("c:").
  const projectDir = (
    NodePath.win32.basename(workspaceRoot) ||
    workspaceRoot.replace(/[\\/]+$/, "") ||
    workspaceRoot
  ).toLowerCase();
  const existingPrefix = new RegExp(
    `^\\([^)]+\\) ${projectDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - `,
    "i",
  );
  if (existingPrefix.test(title)) return title;
  const host =
    Object.entries(aliases).find(([name]) => name.toLowerCase() === hostname.toLowerCase())?.[1] ??
    hostname;
  return `(${host.toUpperCase()}) ${projectDir} - ${title}`;
}

export function canReplaceThreadTitle(currentTitle: string, titleSeed?: string): boolean {
  const trimmedCurrentTitle = currentTitle.trim();
  if (trimmedCurrentTitle === DEFAULT_THREAD_TITLE) {
    return true;
  }

  const trimmedTitleSeed = titleSeed?.trim();
  return trimmedTitleSeed !== undefined && trimmedTitleSeed.length > 0
    ? trimmedCurrentTitle === trimmedTitleSeed
    : false;
}
