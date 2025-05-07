/**
 * ========================================
 *  Lovense Toy Interface – Main Engine
 * ========================================
 * 
 *  This project was designed, organized, and developed by [Your Name],
 *  with regular and invaluable support from Lisa (ChatGPT),
 *  to help structure, refactor, and stabilize the whole system.
 * 
 *  The goal: build a solid, clean, and flexible interface
 *  without sacrificing readability or the joy of tinkering.
 * 
 *  Feel free to reuse and adapt—just show a little respect
 *  for the brain cells we burned along the way.
 */

const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');
const fs = require('fs');
const serverStartTime = Date.now();
const scenarioDir = path.join(__dirname, 'public', 'scenarios');
const rythmoDir = path.join(__dirname, 'public', 'rythmo');
if (!fs.existsSync(scenarioDir)) fs.mkdirSync(scenarioDir);
if (!fs.existsSync(rythmoDir)) fs.mkdirSync(rythmoDir);

const config = require('./system/config');







//////////////////////////////
const initface = new WebSocket(`ws://localhost:${config.ports.websocket}`);
const { port, parser, openPort } = require('./system/serialManager');
const { getElapsedTime, logLocalIPs, registerShutdownHandler } = require('./system/common');

let solaceIndex = null;
let currentId = 1;
const pendingCommands = new Map();

let isCustomVibrating = false;
let rampActive = false;
let customMin = config.customVibeDefaults.min;
let customMax = config.customVibeDefaults.max;
let customSpeed = config.customVibeDefaults.speed;
let currentCommandId = null;


logLocalIPs();
registerShutdownHandler(initface, port);

const lovense = require('./system/lovenseController');
lovense.setDependencies({
  initface,
  solaceIndexRef: () => solaceIndex,
  setSolaceIndex: (val) => solaceIndex = val, // ⬅️ AJOUTE ÇA
  currentIdRef: () => currentId,
  incrementId: () => currentId++,
  pendingCommands,
  stopPulse,
  stopRamp,
});


//////////////////////////////
openPort();

port.on('open', () => {
  console.log('🛰️ Serial port open!');
});

parser.on('data', (line) => {
  console.log('📨 Serial response:', line.trim());
});

port.on('open', () => {
  comSerialAvailable = true;
  console.log('🛰️ Port série ouvert !');
  console.log();
});

port.on('error', (err) => {
  comSerialAvailable = false;
  console.error('⚡ Erreur série:', err.message);
  console.log();
});

// Timer pour "coucou"
setInterval(() => {
  if (port && port.isOpen) {
    if (Date.now() - lastCommandTime > 1500) {
      console.log('🐣 Envoi automatique: coucou');
      port.write('coucou\n');
      lastCommandTime = Date.now();
    }
  }
}, 1000);


parser.on('data', (message) => {
  const cleaned = message.trim();
  if (cleaned.length > 0) {
    console.log('📨 Réponse série :', cleaned);
    // Broadcast vers tous les clients WebSocket
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(cleaned);
      }
    });
  }
});


//////////////////////////////////





//serveur web pour l'interface de pilotage
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.json());
app.use(express.static('public'));
const setupRoutes = require('./system/apiRoutes');
setupRoutes(app, scenarioDir, rythmoDir, __dirname);

// Lance le serveur HTTP
server.listen(config.ports.http, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${config.ports.http}`);

});




function handleJSONCommand(cmd) {
  if (!cmd || !cmd.type) {
    console.log('⚠️ Commande JSON invalide reçue.');
    console.log();
    return;
  }

  if (cmd.id_commande !== undefined) {
    currentCommandId = cmd.id_commande;
    console.log();
    console.log(`🎯 Nouvelle commande reçue : ID ${currentCommandId}`);
    console.log();
  }

  switch (cmd.type) {
    case 'get_battery':
      console.log('🔋❓ Demande état batterie (toy)');
      lovense.getBattery();
      break;
    case 'stop':
      console.log('🛑 Commande STOP reçue (toy)');
      stopCustomVibration();
      stopRamp();
      break;

    case 'pump':
      console.log(`🎛️ Commande VIBRATE reçue: Intensité ${cmd.intensity}`);
      lovense.pump(cmd.intensity);
      break;

    case 'move':
      console.log(`🎚️ Commande MOVE reçue: Position ${cmd.position}, Durée ${cmd.duration}ms`);
      lovense.move(cmd.position, cmd.duration);
      break;
    case 'pumpRamp':
      console.log(`↗️ [pumpRamp] De ${cmd.start} à ${cmd.end} en ${cmd.duration}ms (ID ${cmd.id_commande})`);
      lovense_rampInterpolated(cmd.start, cmd.end, cmd.duration);
      break;
    case "is_com9_available":
      frontendSocket.send(JSON.stringify({
        type: "com9_status",
        available: comSerialAvailable
      }));
      break;

    case 'customVibe':
      console.log(`🌀 Commande CustomVibe reçue: Min ${cmd.min}% / Max ${cmd.max}% à ${cmd.speed}ms (ID ${cmd.id_commande})`);
      req_customLoop(cmd.min, cmd.max, cmd.speed, cmd.id_commande);
      break;

    default:
      console.log('❓ Commande JSON inconnue:', cmd);
  }
}

let frontendSocket = null;
wss.on('connection', (ws) => {
  frontendSocket = ws;
  console.log('🌐 Frontend connecté');

  ws.on('message', (data) => {
    const message = data.toString().trim();
    console.log('👉 Reçu:', message);

    // Si c'est JSON, on traite, sinon on envoie brut sur le port série
    if (message.startsWith('{') || message.startsWith('[')) {
      try {
        const commande = JSON.parse(message);
        handleJSONCommand(commande); // une fonction que tu écris pour traiter les commandes "toy"
      } catch (err) {
        console.error('⚡ Erreur JSON reçu:', err.message);
      }
    } else {
      // Pas du JSON : direct pour le vibreur sur le port série
      console.log('[SERIAL]🌀 Commande ASCII pour Vibror:', message);
      port.write(message + '\n');
    }
  });
});

initface.on('open', () => {
  console.log('🔌 Connecté à initface');

  initface.send(JSON.stringify([{
    RequestServerInfo: {
      Id: currentId++,
      ClientName: "TestToyApp",
      MessageVersion: 3
    }
  }]));
  lovense.startDeviceDetectionLoop();
});

initface.on('message', (msg) => {
  if (!msg.toString().includes('"Ok"')) {
    console.log(`     📨 Message reçu du client : ${msg.toString()} | ${getElapsedTime(serverStartTime)}s`);
  }
  const parsed = JSON.parse(msg.toString());

  parsed.forEach(entry => {
    if (entry.Ok) {
      const id = entry.Ok.Id;
      const cb = pendingCommands.get(id);
      if (cb) {
        cb();
        pendingCommands.delete(id);
      }
    }

    if (entry.ServerInfo) {
      //lovense.startDeviceDetectionLoop();
    }

    if (entry.DeviceList) {
      entry.DeviceList.Devices.forEach(dev => {
        if (dev.DeviceName.includes("Lovense Solace Pro")) {
          lovense.setSolaceIndex(dev.DeviceIndex);
          console.log(`🎯 Device trouvé: ${dev.DeviceName} (index ${lovense.getSolaceIndex()})`);
          console.log();
          lovense.getBattery();
        }
      });
    }
  });

  if (frontendSocket && frontendSocket.readyState === WebSocket.OPEN && !msg.toString().includes('"Ok"')) {
    frontendSocket.send(msg.toString());
  }
});


function stopCustomLoopOnly() {
  isCustomVibrating = false;
}

function stopPulse() {
  if (solaceIndex === null) {
    console.warn("⚠️ Aucun toy connecté !");
    return;
  }
  // 🔇 Fonction bouchon : à compléter plus tard si besoin
  isCustomVibrating = false;
  console.log('🛑 (stopPulse appelé )');
}

function stopRamp() {
  if (solaceIndex === null) {
    console.warn("⚠️ Aucun toy connecté !");
    return;
  }
  // 🔇 Fonction bouchon : à compléter plus tard si besoin
  rampActive = false;
  console.log('🛑 (stopRamp appelé)');
}

function startCustomVibration() {
  if (solaceIndex === null) return;

  stopCustomLoopOnly(); // ⬅️ juste casser la boucle précédente, PAS de stop physique !

  isCustomVibrating = true;

  let current = customMin;
  let toggleDirection = true;

  const thisCommandId = currentCommandId; // on capture l'état à l'instant T

  function loop() {
    // vérifie que la commande est toujours valide
    if (!isCustomVibrating || thisCommandId !== currentCommandId) {
      console.log("🔁❌ Boucle annulée (commande remplacée)");
      return;
    }

    const position = current;
    current = (current === customMin) ? customMax : customMin;
    const duration = customSpeed;
    const amplitude = Math.abs(customMax - customMin);

    const corr_A = config.correction.amplitude.min + (config.correction.amplitude.max - config.correction.amplitude.min) * amplitude;
    const corr_T = config.correction.timing.min + (config.correction.timing.max - config.correction.timing.min) * (duration / 2000);
    const correction = corr_A + corr_T;
    const attente = duration + correction;

    const id = currentId++;
    const cmd = [{
      LinearCmd: {
        Id: id,
        DeviceIndex: solaceIndex,
        Vectors: [{ Index: 0, Duration: duration, Position: position }]
      }
    }];

    const arrow = toggleDirection ? '⬅️' : '➡️';
    toggleDirection = !toggleDirection;

    console.log(`${arrow} [${id}] Move vers ${position * 100}%, durée ${duration}ms, correction ${Math.round(correction)}ms, attente ${Math.round(attente)}ms | ${getElapsedTime(serverStartTime)}s`);

    // Ajout d'une ligne vide toutes les 2 itérations (quand la flèche repasse à gauche)
    if (toggleDirection) console.log();

    pendingCommands.set(id, () => {
      if (isCustomVibrating && thisCommandId === currentCommandId) {
        setTimeout(loop, attente);
      }
      else {
        console.log("🔁🛑 Boucle interrompue (ID changé)/terminée");
      }
    });
    if (!isCustomVibrating) return;
    initface.send(JSON.stringify(cmd));
  }

  loop();
}

function stopCustomVibration() {
  if (isCustomVibrating) {
    isCustomVibrating = false;
    customVibeConfig = null;
    console.log("🛑 Boucle custom interrompue");
  }
  lovense.stop(); // Envoie un vrai StopDeviceCmd
}

/*à tester*/
function updateCustomLoopParams(min, max, speed) {
  customMin = min / 100;
  customMax = max / 100;
  customSpeed = speed;
}

function req_customLoop(min, max, speed, id) {
  currentCommandId = id;

  if (isCustomVibrating) {
    console.log("🔁 Mise à jour des paramètres Custom Loop");
    stopCustomLoopOnly(); // <- stop flag
  }

  updateCustomLoopParams(min, max, speed);
  startCustomVibration();
}

function lovense_rampInterpolated(start, end, duration, steps = 20) {
  if (solaceIndex === null) return;

  rampActive = true;

  const totalStepTime = Math.floor(duration / steps);
  const delta = (end - start) / steps;

  for (let i = 0; i <= steps; i++) {
    const value = start + delta * i;
    const delay = totalStepTime * i;

    setTimeout(() => {
      if (!rampActive) return
      const id = currentId++;
      const cmd = [{
        ScalarCmd: {
          Id: id,
          DeviceIndex: solaceIndex,
          Scalars: [{
            Index: 0,
            ActuatorType: "Oscillate",
            Scalar: Math.min(1, Math.max(0, value)) // clamp entre 0 et 1
          }]
        }
      }];
      initface.send(JSON.stringify(cmd));
      console.log(`↗️ Step ${i}/${steps} → ${Math.round(value * 100)}%`);
    }, delay);
  }
}