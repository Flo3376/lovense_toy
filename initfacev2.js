
const WebSocket = require('ws');

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
    case 'move':
      console.log(`🎚️ Commande MOVE reçue: Position ${cmd.position}, Durée ${cmd.duration}ms`);
      lovense_move(cmd.position, cmd.duration);
      break;
    case 'customVibe':
      console.log(`🌀 Commande CustomVibe reçue: Min ${cmd.min}% / Max ${cmd.max}% à ${cmd.speed}ms (ID ${cmd.id_commande})`);
      req_customLoop(cmd.min, cmd.max, cmd.speed, cmd.id_commande);
      break;

    default:
      console.log('❓ Commande JSON inconnue:', cmd);
  }
}


intiface.on('open', () => {
  console.log('🔌 Connecté à Intiface');

  intiface.send(JSON.stringify([{
    RequestServerInfo: {
      Id: currentId++,
      ClientName: "My_interface V2",
      MessageVersion: 3
    }
  }]));
});

intiface.on('message', (msg) => {
  // console.log(`     📨 Message reçu du client : ${msg.toString()} | ${getElapsedTime()}s`);
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
         
                
            runPump({
              center: 0.5,
              amplitude: 0.15,
              speed: 1,
              repeat: 50,
            });
        }
      });
    }
  });
});

let isRunning = true; // variable de contrôle globale ou partagée

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




/*====================*/

function lovense_getBattery() {
  if (!intiface || intiface.readyState !== WebSocket.OPEN) {
    console.warn("❌ Intiface non connecté, impossible de lire la batterie");
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

  // Écoute unique pour la réponse
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
          console.log(`🔋 Niveau de batterie : ${level}%`);

          // On arrête d'écouter après réception
          intiface.off("message", handleBatteryResponse);
        }
      }
    } catch (err) {
      console.warn("⚠️ Erreur de parsing réponse batterie :", err);
    }
  };

  intiface.on("message", handleBatteryResponse);

  // Envoi de la commande
  intiface.send(JSON.stringify([batteryRequest]));
  console.log("📡 Requête batterie envoyée !");
}



function lovense_move(position, duration, callback = () => { }) {
  if (solaceIndex === null) {
    console.warn("[TOY]⚠️ Aucun toy connecté !");
    return;
  }
  //stopPulse(); // <- ajouté ici pour couper le mode pulsé aussi

  position = parseFloat(position);
  duration = parseInt(duration);

  const id = currentId++;

  const cmd = [{
    LinearCmd: {
      Id: id,
      DeviceIndex: solaceIndex,
      Vectors: [{ Index: 0, Duration: duration, Position: position }]
    }
  }];
  console.log(cmd[0].LinearCmd.Vectors);
  pendingCommands.set(id, () => {
    // console.log(`[TOY]✅ Mouvement vers ${position * 100}% durée: ${duration} lancé`);
    callback();
  });
  intiface.send(JSON.stringify(cmd));
}






async function testSlidingOscillation(amplitude = 0.3, steps = 10) {
  if (solaceIndex === null) {
    console.warn("[SLIDE-OSC]⚠️ Aucun toy connecté !");
    return;
  }

  let lastMax = null;

  for (let base = 0; base <= (1 - amplitude); base += 0.1) {
    const min = parseFloat(base.toFixed(2));
    const max = parseFloat((base + amplitude).toFixed(2));

    // Transition douce si nécessaire
    if (lastMax !== null) {
      const transitionDistance = Math.abs(lastMax - min);
      const transitionDuration = Math.round(transitionDistance * 1000 * 0.009); // distance * 9ms
      console.log(`\n↪️ Transition : ${lastMax * 100}% → ${min * 100}% (${transitionDuration}ms)`);
      lovense_move(min, transitionDuration);
      await delay(transitionDuration + strokerPauseTime);
    }

    console.log(`\n🚶‍♂️ Oscillation : ${min * 100}% → ${max * 100}% (x${steps})`);
    await runPumpSequence(min, max, sweepDuration, steps, false);

    lastMax = max;
  }

  lovense_stop();
  console.log("\n✅ Oscillation glissante terminée.");
}


/*
async function testSlidingOscillation(amplitude = 0.3, steps =25) {
  if (solaceIndex === null) {
    console.warn("[SLIDE-OSC]⚠️ Aucun toy connecté !");
    return;
  }

  for (let base = 0; base <= (1 - amplitude); base += 0.1) {
    const min = parseFloat(base.toFixed(2));
    const max = parseFloat((base + amplitude).toFixed(2));

    console.log(`\n🚶‍♂️ Oscillation glissante : ${min * 100}% → ${max * 100}%`);
    await runPumpSequence(min, max, sweepDuration, steps, false);
  }

  console.log("\n✅ Oscillation glissante terminée.");
}

async function testRampTolerance() {
  if (solaceIndex === null) {
    console.warn("[RAMP-TOL]⚠️ Aucun toy connecté !");
    return;
  }

  const durations = [];

  
  // Puis de 950 à 100 par pas de 50
  for (let d = 500; d >= 50; d -= 50) {
    durations.push(d);
  }

  for (const dur of durations) {
    console.log(`\n🎚️ Test durée = ${dur}ms`);
    await runPumpSequence(0, 1, dur, 20, false); // pas de stop entre les cycles
  }

  console.log("\n✅ Test de tolérance terminé.");
}
*/

async function testRampDissipation() {
  if (solaceIndex === null) {
    console.warn("[TEST]⚠️ Aucun toy connecté !");
    return;
  }

  console.log("[TEST] 🔁 Phase 1: Rampe chargée (0↔1, 1000ms)");
  await runPumpSequence(0, 1, 1000, 10);

  //console.log("[TEST] 🥷 Phase 2: Dissipation micro-mouvements (0↔0.05, 250ms)");
  //await runPumpSequence(0, 0.1, 250, 50);

  console.log("[TEST] 🚦 Phase 3: Re-test pompage rapide (0↔1, 250ms)");
  await runPumpSequence(0, 1, 25, 50);

  console.log("[TEST] 🚦 Phase 3: Re-test pompage rapide (0↔1, 250ms)");
  await runPumpSequence(0, 1, 500, 50);

  console.log("[TEST] ✅ Séquence terminée !");
}
const strokerPauseTime = 100; // temps d'attente entre 2 commandes, sans laisser rebond

async function runPumpSequence(min, max, duration, cycles, doStop = true) {
  let pos = min;
  for (let i = 0; i < cycles; i++) {
    lovense_move(pos, duration);
    await delay(duration + strokerPauseTime);
    pos = (pos === min) ? max : min;
  }
  if (doStop) lovense_stop();
}

function lovense_stop(callback = () => { }) {
  if (solaceIndex === null) return;
  //stopPulse(); // <- ajouté ici pour couper le mode pulsé aussi

  const id = currentId++;
  const cmd = [{
    StopDeviceCmd: {
      Id: id,
      DeviceIndex: solaceIndex
    }
  }];
  pendingCommands.set(id, () => {
    console.log(`[TOY]🛑 Stop demandé`);
    callback();
  });
  intiface.send(JSON.stringify(cmd));
}

async function testMoveWithConditionalStop(position, duration, id) {
  currentCommandId = id;
  const thisCommandId = currentCommandId;

  console.log(`🚦 [ID ${id}] Début du mouvement vers ${position * 100}%, durée ${duration}ms`);

  lovense_move(position, duration);

  await delay(duration); // on attend la fin du mouvement voulu

  if (currentCommandId === thisCommandId) {
    console.log(`🛑 [ID ${id}] Aucun changement détecté, envoi du STOP`);
    lovense_stop();
  } else {
    console.log(`🔄 [ID ${id}] Commande remplacée, pas de STOP`);
  }
}

function sequenceTest() {
  if (solaceIndex === null) {
    console.warn("[SEQUENCE]⚠️ Aucun toy connecté !");
    return;
  }

  rampTestSequence();

}

// Durée des mouvements (modifiable facilement)
let rampStepDuration = 250 // en ms

async function rampTestSequence(steps = 100) {
  if (solaceIndex === null) {
    console.warn("[RAMPTEST]⚠️ Aucun toy connecté !");
    return;
  }

  let current = 0;

  for (let i = 0; i < steps; i++) {
    lovense_move(current, rampStepDuration);
    console.log(`[RAMPTEST] Step ${i + 1}/${steps} → Move ${current} (${rampStepDuration}ms)`);
    await delay(rampStepDuration + 75); // on laisse le stroker finir
    current = current === 0 ? 0.3 : 0; // on alterne
  }

  console.log("[RAMPTEST] ✅ Séquence terminée");
}



function executeSteps(steps) {
  if (steps.length === 0) return;

  const step = steps.shift();
  const result = step();

  if (result instanceof Promise) {
    result.then(() => executeSteps(steps));
  } else {
    setTimeout(() => executeSteps(steps), 0);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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