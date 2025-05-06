// Internal variables set via setDependencies()
let intiface = null;
let pendingCommands = null;
let stopPulse = () => {};

let getSolaceIndex = () => null;
let getCurrentId = () => 1;
let incrementId = () => 1;


/**
 * Sets shared references from main program.
 * Must be called before using any Lovense command.
 * @param {object} opts - Shared resources and state
 */
function setDependencies(opts) {
    intiface = opts.intiface;
    getSolaceIndex = opts.solaceIndexRef;
    getCurrentId = opts.currentIdRef;
    incrementId = opts.incrementId;
    pendingCommands = opts.pendingCommands;
    stopPulse = opts.stopPulse || (() => {});
    stopRamp=opts.stopRamp || (() => {});
  }

/**
 * Sends a vibration command to the toy.
 * @param {number} intensity - From 0.05 to 0.80
 * @param {function} callback - Optional callback on confirmation
 * @param {boolean} forceStop - Whether to stop pulse mode before sending
 */
function pump(intensity, callback = () => {}, forceStop = false) {
  if (getSolaceIndex === null) return console.warn("[TOY] No toy connected!");
  if (forceStop) stopPulse();

  const id = incrementId();
  const cmd = [{
    ScalarCmd: {
      Id: id,
      DeviceIndex: getSolaceIndex(),
      Scalars: [{ Index: 0, ActuatorType: "Oscillate", Scalar: intensity }]
    }
  }];

  pendingCommands.set(id, () => {
    console.log(`[TOY]✅ Vibration at ${intensity}`);
    callback();
  });

  intiface.send(JSON.stringify(cmd));
}

/**
 * Sends a movement command to the toy.
 * @param {number} position - Between 0.0 and 1.0
 * @param {number} duration - Between 0 and 1500ms
 * @param {function} callback - Optional callback
 * @param {boolean} forceStop - Whether to stop pulse mode before sending
 */
function move(position, duration, callback = () => {}, forceStop = false) {
  if (getSolaceIndex === null) return console.warn("[TOY] No toy connected!");
  if (forceStop) stopPulse();

  position = parseFloat(position);
  duration = parseInt(duration);

  const id = incrementId();
  const cmd = [{
    LinearCmd: {
      Id: id,
      DeviceIndex: getSolaceIndex(),
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
 * Sends a stop command to the toy to halt all activity.
 * @param {function} callback - Optional callback
 */
function stop(callback = () => {}) {
  if (getSolaceIndex === null) return console.warn("[TOY] No toy connected!");
  stopPulse();

  const id = incrementId();
  const cmd = [{
    StopDeviceCmd: {
      Id: id,
      DeviceIndex: getSolaceIndex()
    }
  }];

  pendingCommands.set(id, () => {
    console.log(`[TOY]🛑 Stop confirmed`);
    callback();
  });

  intiface.send(JSON.stringify(cmd));
}

/**
 * Requests the battery level from the toy.
 * Logs value to console.
 */
function getBattery() {
  if (!intiface || intiface.readyState !== 1) {
    return console.warn("❌ Intiface not connected");
  }

  const requestId = incrementId();
  const batteryRequest = {
    SensorReadCmd: {
      Id: requestId,
      DeviceIndex: getSolaceIndex(),
      SensorIndex: 0,
      SensorType: "Battery"
    }
  };

  // Temporary listener for battery response
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
          intiface.off("message", handleBatteryResponse); // stop listening
        }
      }
    } catch (err) {
      console.warn("⚠️ Error parsing battery response:", err);
    }
  };

  intiface.on("message", handleBatteryResponse);
  intiface.send(JSON.stringify([batteryRequest]));
  console.log("📡 Battery request sent");
}

module.exports = {
  setDependencies,
  pump,
  move,
  stop,
  getBattery
};
