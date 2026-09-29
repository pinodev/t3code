#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalConsole:off
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { parseHostAliases, settledThreadTitle } from "../src/orchestration/threadTitles.ts";

const { values } = NodeUtil.parseArgs({
  options: {
    origin: { type: "string" },
    "token-file": { type: "string" },
    "home-dir": { type: "string" },
    hostname: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!values.origin || !values["token-file"]) {
  throw new Error(
    "Usage: node apps/server/scripts/rename-settled-threads.ts --origin <url> --token-file <path> [--home-dir <server T3 home>] [--hostname <server hostname>] [--dry-run]",
  );
}

const origin = new URL(values.origin);
const token = (await NodeFSP.readFile(values["token-file"], "utf8")).trim();
if (!token) throw new Error("Bearer token file is empty");
const request = (path: string, init?: RequestInit) =>
  fetch(new URL(path, origin), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
    },
  });

const response = await request("/api/orchestration/shell");
if (!response.ok) throw new Error(`Shell request failed: HTTP ${response.status}`);
const shell = (await response.json()) as {
  projects: Array<{ id: string; workspaceRoot: string }>;
  threads: Array<{
    id: string;
    projectId: string;
    title: string;
    archivedAt: string | null;
    settledAt: string | null;
    settledOverride: "settled" | "active" | null;
  }>;
};
const projects = new Map(shell.projects.map((project) => [project.id, project]));
const aliases = await NodeFSP.readFile(
  NodePath.join(
    values["home-dir"] ?? NodePath.join(NodeOS.homedir(), ".t3"),
    "etc",
    "host-aliases.json",
  ),
  "utf8",
)
  .then((contents) => parseHostAliases(JSON.parse(contents) as unknown))
  .catch(() => ({}));
const serverHostname = values.hostname ?? NodeOS.hostname();
let renamed = 0;

for (const thread of shell.threads) {
  if (
    thread.archivedAt !== null ||
    (thread.settledOverride !== "settled" && thread.settledAt === null)
  )
    continue;
  const project = projects.get(thread.projectId);
  if (!project) continue;
  const title = settledThreadTitle(thread.title, project.workspaceRoot, serverHostname, aliases);
  if (title === thread.title) continue;
  console.log(`${thread.id}: ${JSON.stringify(thread.title)} -> ${JSON.stringify(title)}`);
  if (values["dry-run"]) continue;
  const result = await request("/api/orchestration/dispatch", {
    method: "POST",
    body: JSON.stringify({
      type: "thread.meta.update",
      commandId: `server:settle-rename-backfill:${thread.id}:${NodeCrypto.randomUUID()}`,
      threadId: thread.id,
      title,
    }),
  });
  if (!result.ok) throw new Error(`Rename failed for ${thread.id}: HTTP ${result.status}`);
  renamed++;
}

console.log(values["dry-run"] ? "Dry run complete" : `Renamed ${renamed} threads`);
