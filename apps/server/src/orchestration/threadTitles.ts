// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import { resolveHostAlias } from "../hostAliases.ts";
export { parseHostAliases } from "../hostAliases.ts";

export const DEFAULT_THREAD_TITLE = "New thread";

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
  return `(${resolveHostAlias(hostname, aliases)}) ${projectDir} - ${title}`;
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
