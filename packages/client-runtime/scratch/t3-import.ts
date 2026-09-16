import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";
import { WsRpcGroup, WS_METHODS } from "@t3tools/contracts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const origin = process.env.T3_ORIGIN ?? "http://127.0.0.1:3773";

function readToken(): string {
  if (process.env.T3_TOKEN) return process.env.T3_TOKEN;
  const tokenPath = path.join(os.homedir(), ".t3", ".ps26-agent-token");
  try {
    return fs.readFileSync(tokenPath, "utf8").trim().split(/\r?\n/)[0] ?? "";
  } catch {
    return "";
  }
}

function normalizePath(p: string): string {
  return p
    .replace(/\//g, "\\")
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

function printUsage() {
  console.error("usage: node t3-import.ts <projectId> [--session <uuid>]");
  console.error("       node t3-import.ts --cwd <path> [--session <uuid>]");
}

// Parse argv: either a bare projectId, or --cwd <path>, plus optional --session <uuid>.
const args = process.argv.slice(2);
let projectId = "";
let cwdArg = "";
let sessionId = "";
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--cwd") {
    cwdArg = args[++i] ?? "";
  } else if (a === "--session") {
    sessionId = args[++i] ?? "";
  } else if (!a.startsWith("--") && !projectId) {
    projectId = a;
  }
}

const token = readToken();
if (!token || (!projectId && !cwdArg)) {
  printUsage();
  process.exit(2);
}

if (cwdArg) {
  const shellRes = await fetch(`${origin}/api/orchestration/shell`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const shellJson: any = await shellRes.json();
  const target = normalizePath(cwdArg);
  const projects: any[] = shellJson.projects ?? [];
  const match = projects.find((p) => normalizePath(p.workspaceRoot ?? "") === target);
  if (!match) {
    console.error(`FAILED: no project found with workspaceRoot matching "${cwdArg}"`);
    console.error("available workspaceRoots:");
    for (const p of projects) console.error(`  - ${p.workspaceRoot}`);
    process.exit(1);
  }
  projectId = match.id;
}

const res = await fetch(`${origin}/api/auth/websocket-ticket`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: "{}",
});
const ticketJson: any = await res.json();
console.log("ticket:", res.status, JSON.stringify(ticketJson).slice(0, 160));
const ticket: string = ticketJson.ticket ?? ticketJson.wsTicket ?? ticketJson.token;
const wsUrl = `${origin.replace(/^http/, "ws")}/ws?wsTicket=${encodeURIComponent(ticket)}&clientSurface=web`;

const protocolLayer = Layer.effect(
  RpcClient.Protocol,
  RpcClient.makeProtocolSocket({ retryTransientErrors: false, retryPolicy: Schedule.recurs(0) }),
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Socket.layerWebSocket(wsUrl, { openTimeout: 10_000 }).pipe(
        Layer.provide(Socket.layerWebSocketConstructorGlobal),
      ),
      RpcSerialization.layerJson,
    ),
  ),
);

const program = Effect.gen(function* () {
  const client = yield* RpcClient.make(WsRpcGroup);
  const result = yield* client[WS_METHODS.agentSessionsImport]({ projectId } as any);
  console.log("import result:", JSON.stringify(result));
}).pipe(Effect.scoped, Effect.provide(protocolLayer));

await Effect.runPromise(program as any).catch((e) => {
  console.error("FAILED:", e);
  process.exitCode = 1;
});
if (sessionId && (process.exitCode ?? 0) === 0) {
  const threadId = `import:claudeAgent:${sessionId}`;
  console.log(`thread: ${threadId}`);
  // thread.history.import settles the thread (imported history counts as past work); a fork is live work.
  const res2 = await fetch(`${origin}/api/orchestration/dispatch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "thread.unsettle",
      commandId: `t3fork:unsettle:${crypto.randomUUID()}`,
      threadId,
      reason: "user",
    }),
  });
  console.log(`unsettle: ${res2.status}`);
}
setTimeout(() => process.exit(process.exitCode ?? 0), 200);
