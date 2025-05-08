// system/toyOrchestration.js

let config = null;
let initface = null;
let pendingCommands = null;
let currentCommandId = null;
let solaceIndex = null;
let getElapsedTime = () => '0.000';
let getCurrentId = () => 1;
let incrementId = () => 1;

let isCustomVibrating = false;
let customMin = 0.25;
let customMax = 0.75;
let customSpeed = 100;

function setDependencies(opts) {
  config = opts.config;
  initface = opts.initface;
  pendingCommands = opts.pendingCommands;
  getElapsedTime = opts.getElapsedTime;
  getCurrentId = opts.getCurrentId;
  incrementId = opts.incrementId;

  // Ajout : accès direct à solaceIndex
  solaceIndex = opts.getSolaceIndex();
  opts.getSolaceIndex && console.log('[INIT] SolaceIndex reçu:', solaceIndex);
}

function setSolaceIndex(index) {
  solaceIndex = index;
  console.log(`[SET] toyOrchestration: solaceIndex = ${index}`);
}

function updateCustomLoopParams(min, max, speed) {
  customMin = min / 100;
  customMax = max / 100;
  customSpeed = speed;
}

function stopCustomLoopOnly() {
  if (isCustomVibrating) {
    console.log("🛑 Boucle custom interrompue");
  }
  isCustomVibrating = false;
}

function stopCustomVibration(lovenseStop = () => {}) {
  stopCustomLoopOnly();
  currentCommandId = null;
  lovenseStop();
}

function req_customLoop(min, max, speed, id) {
  currentCommandId = id;

  if (isCustomVibrating) {
    console.log("🔁 Mise à jour des paramètres Custom Loop");
    stopCustomLoopOnly();
  }

  updateCustomLoopParams(min, max, speed);
  startCustomVibration();
}

function startCustomVibration() {
  if (solaceIndex === null) {
    console.warn("⚠️ startCustomVibration → aucun toy détecté !");
    return;
  }

  stopCustomLoopOnly();
  isCustomVibrating = true;

  let current = customMin;
  let toggleDirection = true;
  const thisCommandId = currentCommandId;

  function loop() {
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

    const id = incrementId();
    const cmd = [{
      LinearCmd: {
        Id: id,
        DeviceIndex: solaceIndex,
        Vectors: [{ Index: 0, Duration: duration, Position: position }]
      }
    }];

    const arrow = toggleDirection ? '⬅️' : '➡️';
    toggleDirection = !toggleDirection;

    console.log(`${arrow} [${id}] Move vers ${position * 100}%, durée ${duration}ms, correction ${Math.round(correction)}ms, attente ${Math.round(attente)}ms | ${getElapsedTime()}s`);
    if (toggleDirection) console.log();

    pendingCommands.set(id, () => {
      if (isCustomVibrating && thisCommandId === currentCommandId) {
        setTimeout(loop, attente);
      } else {
        console.log("🔁🛑 Boucle interrompue (ID changé)/terminée");
      }
    });

    if (!isCustomVibrating) return;
    initface.send(JSON.stringify(cmd));
  }

  loop();
}

function rampInterpolated(start, end, duration, steps = 20) {
  if (solaceIndex === null) {
    console.warn("⚠️ rampInterpolated → aucun toy détecté !");
    return;
  }

  const totalStepTime = Math.floor(duration / steps);
  const delta = (end - start) / steps;

  for (let i = 0; i <= steps; i++) {
    const value = start + delta * i;
    const delay = totalStepTime * i;

    setTimeout(() => {
      const id = incrementId();
      const cmd = [{
        ScalarCmd: {
          Id: id,
          DeviceIndex: solaceIndex,
          Scalars: [{
            Index: 0,
            ActuatorType: "Oscillate",
            Scalar: Math.min(1, Math.max(0, value))
          }]
        }
      }];
      initface.send(JSON.stringify(cmd));
      console.log(`↗️ Step ${i}/${steps} → ${Math.round(value * 100)}%`);
    }, delay);
  }
}

module.exports = {
  setDependencies,
  setSolaceIndex,
  req_customLoop,
  stopCustomLoopOnly,
  stopCustomVibration,
  updateCustomLoopParams,
  rampInterpolated
};
