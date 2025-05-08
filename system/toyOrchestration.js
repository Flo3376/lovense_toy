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

/**
 * Initializes shared dependencies for this module.
 * Must be called before using any toy orchestration functions.
 * @param {object} opts - Set of required references and utilities
 */
function setDependencies(opts) {
  config = opts.config;
  initface = opts.initface;
  pendingCommands = opts.pendingCommands;
  getElapsedTime = opts.getElapsedTime;
  getCurrentId = opts.getCurrentId;
  incrementId = opts.incrementId;

  solaceIndex = opts.getSolaceIndex();
  opts.getSolaceIndex;
}

function setSolaceIndex(index) {
  solaceIndex = index;
  console.log(`[SET] toyOrchestration: solaceIndex = ${index}`);
}

/**
 * Updates parameters for the custom vibration loop.
 * Values are converted to 0–1 scale internally.
 * @param {number} min - Minimum intensity (0–100)
 * @param {number} max - Maximum intensity (0–100)
 * @param {number} speed - Duration in ms for each movement
 */
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

/**
 * Halts the custom vibration loop without resetting command state.
 * Useful when replacing or pausing loop logic.
 */
function stopCustomVibration(lovenseStop = () => {}) {
  stopCustomLoopOnly();
  currentCommandId = null;
  lovenseStop();
}

/**
 * Initiates or updates a custom vibration loop.
 * Interrupts previous loop if running and starts a new one.
 * @param {number} min - Minimum intensity (0–100)
 * @param {number} max - Maximum intensity (0–100)
 * @param {number} speed - Time (ms) for each vibration step
 * @param {number} id - Unique ID for this loop command
 */
function req_customLoop(min, max, speed, id) {
  currentCommandId = id;

  if (isCustomVibrating) {
    console.log("🔁 Mise à jour des paramètres Custom Loop");
    stopCustomLoopOnly();
  }

  updateCustomLoopParams(min, max, speed);
  startCustomVibration();
}

/**
 * Starts the custom vibration loop using configured min/max/speed.
 * Alternates between min and max positions with adjusted timing.
 * Aborts if no device is detected or if another command interrupts.
 */
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
    const waitTime = duration + correction;

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

    console.log(`${arrow} [${id}] Move vers ${position * 100}%, durée ${duration}ms, correction ${Math.round(correction)}ms, attente ${Math.round(waitTime)}ms | ${getElapsedTime()}s`);
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

/**
 * Gradually ramps vibration from start to end intensity.
 * Useful for soft transitions.
 * @param {number} start - Starting intensity (0–1)
 * @param {number} end - Ending intensity (0–1)
 * @param {number} duration - Total time in ms
 * @param {number} steps - Number of interpolation steps (default: 20)
 */
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
