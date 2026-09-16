const origin = "http://127.0.0.1:3773";
const token = process.env.T3_TOKEN;
const r = await fetch(`${origin}/api/auth/websocket-ticket`, {
	method: "POST",
	headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
	body: "{}",
});
const { ticket } = await r.json();
const url = `ws://127.0.0.1:3773/ws?wsTicket=${encodeURIComponent(ticket)}`;
const ws = new WebSocket(url);
ws.addEventListener("open", () => {
	console.log("OPEN readyState", ws.readyState);
	ws.send(JSON.stringify({ _tag: "Ping" }));
});
ws.addEventListener("message", (e) => console.log("MSG", String(e.data).slice(0, 300)));
ws.addEventListener("error", (e) => console.log("ERROR", e.message ?? e.type));
ws.addEventListener("close", (e) => {
	console.log("CLOSE", e.code, e.reason);
	process.exit(0);
});
setTimeout(() => {
	console.log("timeout; state", ws.readyState);
	process.exit(0);
}, 8000);
