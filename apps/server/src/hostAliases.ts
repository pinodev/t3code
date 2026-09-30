// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

export function parseHostAliases(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    ),
  );
}

export function resolveHostAlias(
  hostname: string,
  aliases: Readonly<Record<string, string>>,
): string {
  return (
    Object.entries(aliases).find(([name]) => name.toLowerCase() === hostname.toLowerCase())?.[1] ??
    hostname
  ).toUpperCase();
}

export const readHostAliases = Effect.fn("readHostAliases")(function* (baseDir: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readFileString(NodePath.join(baseDir, "etc", "host-aliases.json")).pipe(
    Effect.map((contents) => {
      try {
        return parseHostAliases(JSON.parse(contents) as unknown);
      } catch {
        return {};
      }
    }),
    Effect.orElseSucceed(() => ({})),
  );
});
