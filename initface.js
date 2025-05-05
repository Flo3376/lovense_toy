const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');
const fs = require('fs');

const out_port = 12346; //normalement 12345, le décallage permet d'interconnecté mon sniffer en 12345 et il appelle ici en 12346
const serverStartTime = Date.now();
let detectionAttempts = 0;
const MAX_DETECTION_ATTEMPTS = 10;


const scenarioDir = path.join(__dirname, 'public', 'scenarios');
const rythmoDir = path.join(__dirname, 'public', 'rythmo');
if (!fs.existsSync(rythmoDir)) fs.mkdirSync(rythmoDir);

//////////////////////////////
const intiface = new WebSocket(`ws://localhost:${out_port}`);
const { port, parser,openPort } = require('./system/serialManager');
const { getElapsedTime, logLocalIPs, registerShutdownHandler } = require('./system/common');

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


logLocalIPs();
registerShutdownHandler(intiface, port);

const lovense = require('./system/lovenseController');
lovense.setDependencies({
  intiface,
  solaceIndexRef: () => solaceIndex,
  currentIdRef: () => currentId,
  incrementId: () => currentId++,
  pendingCommands,
  stopPulse
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
  console.log(`     📨 Message reçu du client : ${msg.toString()} | ${getElapsedTime(serverStartTime)}s`);
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
          lovense.getBattery();
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

    console.log(`➡️ [${id}] Move vers ${position * 100}%, durée ${duration}ms, correction ${Math.round(correction)}ms, attente ${Math.round(attente)}ms | ${getElapsedTime(serverStartTime)}s`);

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