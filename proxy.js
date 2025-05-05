const WebSocket = require("ws");
const fs = require("fs");

const in_port=12345;
const out_port=12346;

const INTAFICE_WS = `ws://127.0.0.1:${out_port}`;
const LOG_FILE = "ws_traffic.log";
const BUFFER_FLUSH_INTERVAL = 200;

let logBuffer = [];

function logTraffic(line) {
  console.log(line);
  logBuffer.push(`[${new Date().toISOString()}] ${line}`);
  if (logBuffer.length >= BUFFER_FLUSH_INTERVAL) {
    flushLogBuffer();
  }
}

function flushLogBuffer() {
  if (logBuffer.length === 0) return;
  fs.appendFile(LOG_FILE, logBuffer.join("\n") + "\n", (err) => {
    if (err) console.error("Erreur d'écriture dans le fichier de log :", err);
  });
  logBuffer = [];
}

process.on("exit", flushLogBuffer);
process.on("SIGINT", () => { flushLogBuffer(); process.exit(); });

const proxyServer = new WebSocket.Server({ port: in_port }, () => {
  console.log(`🛰️ Proxy WebSocket lancé sur ws://localhost:${in_port}`);
});

proxyServer.on("connection", (hsSocket) => {
  console.log("🎮 Connexion de Honey Select détectée");

  const intifaceSocket = new WebSocket(INTAFICE_WS);

  intifaceSocket.on("open", () => {
    console.log("✅ Connecté à Intiface");

    hsSocket.on("message", (msg, isBinary) => {
      if (isBinary) {
        logTraffic("⬅️ HS → Intiface (binaire)");
      } else {
        const msgText = msg.toString();
        logTraffic(`⬅️ HS → Intiface : ${msgText}`);
      }
      intifaceSocket.send(msg, { binary: isBinary });
    });

    intifaceSocket.on("message", (msg, isBinary) => {
      if (isBinary) {
        logTraffic("➡️ Intiface → HS (binaire)");
      } else {
        const msgText = msg.toString();
        logTraffic(`➡️ Intiface → HS : ${msgText}`);
      }
      hsSocket.send(msg, { binary: isBinary });
    });
  });

  hsSocket.on("close", () => {
    console.log("❌ HS déconnecté");
    intifaceSocket.close();
  });

  intifaceSocket.on("close", () => {
    console.log("❌ Intiface déconnecté");
    hsSocket.close();
  });

  hsSocket.on("error", (err) => console.error("HS socket error:", err));
  intifaceSocket.on("error", (err) => console.error("Intiface socket error:", err));
});