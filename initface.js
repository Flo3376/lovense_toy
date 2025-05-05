const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const { SerialPort } = require('serialport');
const http = require('http');
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('fs');
const scenarioDir = path.join(__dirname, 'public', 'scenarios');
const rythmoDir = path.join(__dirname, 'public', 'rythmo');
if (!fs.existsSync(rythmoDir)) fs.mkdirSync(rythmoDir);
const out_port = 12346; //normalement 12345, le décallage permet d'interconnecté mon sniffer en 12345 et il appelle ici en 12346
const serverStartTime = Date.now();
let detectionAttempts = 0;
const MAX_DETECTION_ATTEMPTS = 10;

const intiface = new WebSocket(`ws://localhost:${out_port}`);
let solaceIndex = null;
let currentId = 1;
const pendingCommands = new Map();

let isCustomVibrating = false;
let customMin = 0.25;
let customMax = 0.75;
let customSpeed = 100;

//anticipateur et correcteur
const min_cor_A = 10;
const max_cor_A = 100;
const min_cor_T = 2;
const max_cor_T = 20;

let currentCommandId = null;

function getElapsedTime() {
  const now = Date.now();
  const elapsedMs = now - serverStartTime;
  const seconds = Math.floor(elapsedMs / 1000);
  const milliseconds = elapsedMs % 1000;
  return `${seconds}.${milliseconds.toString().padStart(3, '0')}`; // ex: "1.100"
}

//rechercher et indiquer la ou les adresses ip où tourne se programme
const os = require('os');
const interfaces = os.networkInterfaces();
Object.keys(interfaces).forEach((ifname) => {
  interfaces[ifname].forEach((iface) => {
    if (iface.family === 'IPv4' && !iface.internal) {
      console.log(`🌐 IP Locale (${ifname}): ${iface.address}`);
    }
  });
  console.log();
});


//serveur web pour l'interface de pilotage
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/*
// D'abord, route personnalisée pour la racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'echecindex.html'));
});*/



app.get('/', (req, res) => {
  const scenarioFiles = fs.readdirSync(scenarioDir).filter(f => f.endsWith('.json'));

  const scenarioData = scenarioFiles.map(filename => {
    try {
      const content = fs.readFileSync(path.join(scenarioDir, filename), 'utf-8');
      const parsed = JSON.parse(content);

      // On ne garde que si les des infos sont présente
      if (!parsed.id || !parsed.name || !parsed.button) return null;

      return {
        id: parsed.id,
        name: parsed.name,
        button: parsed.button,
        category: parsed.category || 'medium',
        file: filename
      };
    } catch (err) {
      console.warn(`⚠️ Erreur parsing fichier ${filename} :`, err.message);
      return null;
    }
  }).filter(x => x !== null);

  // Lecture HTML et injection à la balise <scenario>
  let html = fs.readFileSync(path.join(__dirname, 'public', 'main.html'), 'utf-8');
  const injection = `<script>const mesScenarios = ${JSON.stringify(scenarioData)};</script>`;
  html = html.replace('</scenario>', `${injection}\n</scenario>`);

  res.send(html);
});

app.get('/player/:videoname', (req, res) => {
  const file = req.params.videoname;

  // On pourrait vérifier ici que le fichier existe dans /public/videos/
  const allowedExt = ['.mp4', '.mkv', '.webm'];
if (!allowedExt.some(ext => file.endsWith(ext))) {
  return res.status(400).send('Format de fichier non valide');
}

  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/rythmo/:nom.json', (req, res) => {
  const filepath = path.join(rythmoDir, `${req.params.nom}.json`);
  if (!fs.existsSync(filepath)) return res.json([]);
  const content = fs.readFileSync(filepath, 'utf-8');
  res.setHeader('Content-Type', 'application/json');
  res.send(content);
});

app.use(express.json());
app.post('/rythmo/:nom.json', (req, res) => {
  const filepath = path.join(rythmoDir, `${req.params.nom}.json`);
  fs.writeFileSync(filepath, JSON.stringify(req.body, null, 2));
  res.json({ status: 'ok', saved: filepath });
});


app.use(express.static('public'));
const PORT_WEB = 3000;

// Lance le serveur HTTP
server.listen(PORT_WEB, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT_WEB}`);

});

//communication port serie
const PORT_SERIE = 'COM9';
const BAUDRATE = 115200;
let com9Available = false;

const port = new SerialPort({
  path: PORT_SERIE,
  baudRate: BAUDRATE
});

port.on('open', () => {
  com9Available = true;
  console.log('🛰️ Port série ouvert !');
  console.log();
});

port.on('error', (err) => {
  com9Available = false;
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
  } else {
    // Tu peux logger une seule fois que le port est fermé si tu veux
    // console.log("⛔ Port série fermé, pas de coucou.");
  }
}, 1000);

// Parser les messages dans qui viennt du port série
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

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
      lovense_getBattery();
      break;
    case 'stop':
      console.log('🛑 Commande STOP reçue (toy)');
      stopCustomVibration();
      break;

    case 'pump':
      console.log(`🎛️ Commande VIBRATE reçue: Intensité ${cmd.intensity}`);
      lovense_pump(cmd.intensity);
      break;

    case 'move':
      console.log(`🎚️ Commande MOVE reçue: Position ${cmd.position}, Durée ${cmd.duration}ms`);
      lovense_move(cmd.position, cmd.duration);
      break;
    case 'pumpRamp':
      console.log(`↗️ [pumpRamp] De ${cmd.start} à ${cmd.end} en ${cmd.duration}ms (ID ${cmd.id_commande})`);
      lovense_rampInterpolated(cmd.start, cmd.end, cmd.duration);
      break;
    case "is_com9_available":
      frontendSocket.send(JSON.stringify({
        type: "com9_status",
        available: com9Available
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

intiface.on('open', () => {
  console.log('🔌 Connecté à Intiface');

  intiface.send(JSON.stringify([{
    RequestServerInfo: {
      Id: currentId++,
      ClientName: "TestToyApp",
      MessageVersion: 3
    }
  }]));
});

intiface.on('message', (msg) => {
  console.log(`     📨 Message reçu du client : ${msg.toString()} | ${getElapsedTime()}s`);
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
      startDeviceDetectionLoop();
    }

    if (entry.DeviceList) {
      entry.DeviceList.Devices.forEach(dev => {
        if (dev.DeviceName.includes("Lovense Solace Pro")) {
          solaceIndex = dev.DeviceIndex;
          console.log(`🎯 Device trouvé: ${dev.DeviceName} (index ${solaceIndex})`);
          console.log();
          lovense_getBattery();
        }
      });
    }
  });

  if (frontendSocket && frontendSocket.readyState === WebSocket.OPEN && !msg.toString().includes('"Ok"')) {
    frontendSocket.send(msg.toString());
  }
});

function startDeviceDetectionLoop() {
  detectionAttempts = 0;
  tryDetectDevice();
}

function tryDetectDevice() {
  if (solaceIndex !== null) return;

  if (detectionAttempts >= MAX_DETECTION_ATTEMPTS) {
    console.log("❌ Échec détection device après plusieurs tentatives.");
    console.log();
    return;
  }

  console.log();
  console.log(`🔍 Tentative ${detectionAttempts + 1}/${MAX_DETECTION_ATTEMPTS} → Détection du toy...`);

  intiface.send(JSON.stringify([{ StartScanning: { Id: currentId++ } }]));
  intiface.send(JSON.stringify([{ RequestDeviceList: { Id: currentId++ } }]));

  detectionAttempts++;
  setTimeout(() => {
    if (solaceIndex === null) {
      tryDetectDevice(); // relance si non trouvé
    }
  }, 2000);
}

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
  console.log('🛑 (stopPulse appelé - placeholder)');
}

function startCustomVibration() {
  if (solaceIndex === null) return;

  stopCustomLoopOnly(); // ⬅️ juste casser la boucle précédente, PAS de stop physique !

  isCustomVibrating = true;

  let current = customMin;

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

    const corr_A = min_cor_A + (max_cor_A - min_cor_A) * amplitude;
    const corr_T = min_cor_T + (max_cor_T - min_cor_T) * (duration / 2000);
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

    console.log(`➡️ [${id}] Move vers ${position * 100}%, durée ${duration}ms, correction ${Math.round(correction)}ms, attente ${Math.round(attente)}ms | ${getElapsedTime()}s`);

    pendingCommands.set(id, () => {
      if (isCustomVibrating && thisCommandId === currentCommandId) {
        setTimeout(loop, attente);
      }
      else {
        console.log("🔁🛑 Boucle interrompue (ID changé)/terminée");
      }
    });
    if (!isCustomVibrating) return;
    intiface.send(JSON.stringify(cmd));
  }

  loop();
}

function stopCustomVibration() {
  isCustomVibrating = false;
  customVibeConfig = null;
  lovense_stop(); // Envoie un vrai StopDeviceCmd
}

/*à tester*/
function updateCustomLoopParams(min, max, speed) {
  customMin = min / 100;
  customMax = max / 100;
  customSpeed = speed;
}

function req_customLoop(min, max, speed, id) {
  currentCommandId = id;

  // Si déjà en cours → on met juste à jour les paramètres
  if (isCustomVibrating) {
    console.log("🔁 Mise à jour des paramètres Custom Loop");
    updateCustomLoopParams(min, max, speed);
    startCustomVibration();
    //return;
  }

  // Sinon, on met à jour et on lance
  updateCustomLoopParams(min, max, speed);
  startCustomVibration();
}
function lovense_rampInterpolated(start, end, duration, steps = 20) {
  if (solaceIndex === null) return;

  const totalStepTime = Math.floor(duration / steps);
  const delta = (end - start) / steps;

  for (let i = 0; i <= steps; i++) {
    const value = start + delta * i;
    const delay = totalStepTime * i;

    setTimeout(() => {
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
      intiface.send(JSON.stringify(cmd));
      console.log(`↗️ Step ${i}/${steps} → ${Math.round(value * 100)}%`);
    }, delay);
  }
}




/**
primarys connands for lovence solace pro
*/

/**
 * Requests the current battery level from the connected Lovense toy.
 * Sends result to frontend if available.
 */
function lovense_getBattery() {
  if (!intiface || intiface.readyState !== WebSocket.OPEN) {
    console.warn("❌ Intiface not connected, cannot request battery level.");
    return;
  }

  const requestId = currentId++;
  const batteryRequest = {
    SensorReadCmd: {
      Id: requestId,
      DeviceIndex: solaceIndex,
      SensorIndex: 0,
      SensorType: "Battery"
    }
  };

  // Temporary listener for the expected battery response
  const handleBatteryResponse = (msg) => {
    try {
      const parsed = JSON.parse(msg);
      for (const entry of parsed) {
        if (
          entry.SensorReading &&
          entry.SensorReading.Id === requestId &&
          entry.SensorReading.SensorType === "Battery"
        ) {
          const level = entry.SensorReading.Data[0];
          console.log(`🔋 Battery level: ${level}%`);

          // Forward to frontend
          if (frontendSocket && frontendSocket.readyState === WebSocket.OPEN) {
            frontendSocket.send(JSON.stringify({
              type: "battery",
              value: level
            }));
          }

          intiface.off("message", handleBatteryResponse); // cleanup
        }
      }
    } catch (err) {
      console.warn("⚠️ Battery response parse error:", err);
    }
  };

  intiface.on("message", handleBatteryResponse);
  intiface.send(JSON.stringify([batteryRequest]));
  console.log("📡 Battery request sent!");
}


/**
 * Sends a vibration command to the Lovense toy.
 * @param {number} intensity - Float between 0.05 and 0.80 (oscillation power)
 * @param {function} callback - Optional callback on completion
 * @param {boolean} forceStop - If true, stops ongoing pulse loop before execution
 */
function lovense_pump(intensity, callback = () => {}, forceStop = false) {
  if (solaceIndex === null) {
    console.warn("[TOY]⚠️ No toy connected!");
    return;
  }

  if (typeof intensity !== 'number' || isNaN(intensity)) {
    console.error(`[TOY]❌ Invalid intensity type: ${intensity}`);
    return;
  }

  if (intensity < 0.05 || intensity > 0.80) {
    console.error(`[TOY]❌ Intensity out of range: ${intensity}`);
    return;
  }

  const precision = (intensity.toString().split('.')[1] || '').length;
  if (precision > 2) {
    console.warn(`[TOY]⚠️ Intensity has too many decimal places: ${intensity}`);
  }

  if (forceStop) stopPulse();

  const id = currentId++;
  const cmd = [{
    ScalarCmd: {
      Id: id,
      DeviceIndex: solaceIndex,
      Scalars: [{ Index: 0, ActuatorType: "Oscillate", Scalar: intensity }]
    }
  }];

  pendingCommands.set(id, () => {
    console.log(`[TOY]✅ Vibration started at ${intensity}`);
    callback();
  });

  intiface.send(JSON.stringify(cmd));
}

/**
 * Sends a movement command to the Lovense toy.
 * @param {number} position - Float between 0.0 and 1.0 (target position)
 * @param {number} duration - Integer in ms between 0 and 1500 (move duration)
 * @param {function} callback - Optional callback on completion
 * @param {boolean} forceStop - If true, stops ongoing pulse loop before execution
 */
function lovense_move(position, duration, callback = () => {}, forceStop = false) {
  if (solaceIndex === null) {
    console.warn("[TOY]⚠️ No toy connected!");
    return;
  }

  position = parseFloat(position);
  duration = parseInt(duration);

  if (isNaN(position) || position < 0.0 || position > 1.0) {
    console.error(`[TOY]❌ Position out of range: ${position}`);
    return;
  }

  const precision = (position.toString().split('.')[1] || '').length;
  if (precision > 2) {
    console.warn(`[TOY]⚠️ Position has too many decimal places: ${position}`);
  }

  if (isNaN(duration) || duration < 0 || duration > 1500) {
    console.error(`[TOY]❌ Duration out of range: ${duration}`);
    return;
  }

  if (forceStop) stopPulse();

  const id = currentId++;

  const cmd = [{
    LinearCmd: {
      Id: id,
      DeviceIndex: solaceIndex,
      Vectors: [{ Index: 0, Duration: duration, Position: position }]
    }
  }];

  pendingCommands.set(id, () => {
    console.log(`[TOY]✅ Move to ${position * 100}% for ${duration}ms`);
    callback();
  });

  intiface.send(JSON.stringify(cmd));
}

/**
 * Sends a stop command to the Lovense toy.
 * Stops current vibrations or movements immediately.
 * @param {function} callback - Optional callback on confirmation
 */
function lovense_stop(callback = () => {}) {
  if (solaceIndex === null) {
    console.warn("[TOY]⚠️ No toy connected!");
    return;
  }

  stopPulse(); // Always stops the custom loop mode

  const id = currentId++;
  const cmd = [{
    StopDeviceCmd: {
      Id: id,
      DeviceIndex: solaceIndex
    }
  }];

  pendingCommands.set(id, () => {
    console.log(`[TOY]🛑 Stop command confirmed`);
    callback();
  });

  intiface.send(JSON.stringify(cmd));
}



// Quand on quitte (CTRL+C, kill, etc.)
process.on('SIGINT', () => {
  console.log('🛑 Arrêt demandé (SIGINT)');

  if (intiface && intiface.readyState === WebSocket.OPEN) {
    console.log('🔌 Déconnexion de Intiface...');
    intiface.close();
  }

  if (port && port.isOpen) {
    console.log('🔌 Envoi du STOP final au vibreur...');
    port.write('e,id=999,target=vibror,mode=stop\n', () => {
      port.close(() => {
        console.log('✅ Port série fermé');
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
});
