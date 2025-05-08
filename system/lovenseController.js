const config = require('./../system/config');

// Internal variables set via setDependencies()
let initface = null;
let pendingCommands = null;
let stopPulse = () => { };
let getCurrentId = () => 1;
let incrementId = () => 1;
let solaceIndex = null;
let sendToFrontend = () => { };

/**
 * Returns the index of the currently selected device.
 * Used internally to identify which toy is targeted.
 * @returns {number|null} Device index or null if none selected
 */
function getSolaceIndex() {
    return solaceIndex;
}

/**
 * Sets the index of the connected device.
 * Called when a device has been successfully identified.
 * @param {number} index - The index of the detected device
 */
function setSolaceIndex(index) {
    console.log('📦 Device brut:', JSON.stringify(index, null, 2));
    solaceIndex = index;
}

/**
 * Sets shared references from main program.
 * Must be called before using any Lovense command.
 * @param {object} opts - Shared resources and state
 */
function setDependencies(opts) {
    initface = opts.initface;
    getCurrentId = opts.currentIdRef;
    incrementId = opts.incrementId;
    pendingCommands = opts.pendingCommands;
    stopPulse = opts.stopPulse || (() => { });
    stopRamp = opts.stopRamp || (() => { });
    sendToFrontend = opts.sendToFrontend || (() => { });
}

/**
 * Sends a vibration command to the toy.
 * @param {number} intensity - From 0.05 to 0.80
 * @param {function} callback - Optional callback on confirmation
 * @param {boolean} forceStop - Whether to stop pulse mode before sending
 */
function pump(intensity, callback = () => { }, forceStop = false) {
    if (getSolaceIndex() === null) return console.warn("[TOY] No toy connected!");
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

    initface.send(JSON.stringify(cmd));
}

/**
 * Sends a movement command to the toy.
 * @param {number} position - Between 0.0 and 1.0
 * @param {number} duration - Between 0 and 1500ms
 * @param {function} callback - Optional callback
 * @param {boolean} forceStop - Whether to stop pulse mode before sending
 */
function move(position, duration, callback = () => { }, forceStop = false) {
    if (getSolaceIndex() === null) return console.warn("[TOY] No toy connected!");
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

    initface.send(JSON.stringify(cmd));
}

/**
 * Sends a stop command to the toy to halt all activity.
 * @param {function} callback - Optional callback
 */
function stop(callback = () => { }) {
    if (getSolaceIndex() === null) return console.warn("[TOY] No toy connected!");
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

    initface.send(JSON.stringify(cmd));
}

/**
 * Requests the battery level from the toy.
 * Logs value to console.
 */
function getBattery() {
    if (!initface || initface.readyState !== 1) {
        return console.warn("❌ initface not connected");
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
                    sendToFrontend({
                        type: "battery",
                        value: level
                    });
                    initface.off("message", handleBatteryResponse); // stop listening
                }
            }
        } catch (err) {
            console.warn("⚠️ Error parsing battery response:", err);
        }
    };

    initface.on("message", handleBatteryResponse);
    initface.send(JSON.stringify([batteryRequest]));
    console.log("📡 Battery request sent");
}

/**
 * Starts the detection loop to search for a connected device.
 * Will retry until success or max attempts is reached.
 */
function startDeviceDetectionLoop() {
    detectionAttempts = 0;
    tryDetectDevice();
}

/**
 * Attempts to detect a device by scanning and requesting the device list.
 * If detection fails, retries after a delay until max attempts.
 */
function tryDetectDevice() {
    const currentIndex = getSolaceIndex ? getSolaceIndex() : '⚠️ getSolaceIndex not defined';

    if (getSolaceIndex() !== null) return;

    if (detectionAttempts >= config.detection.maxAttempts) {
        console.log("❌ Échec détection device après plusieurs tentatives.");
        console.log();
        return;
    }

    console.log();
    console.log(`🔍 Tentative ${detectionAttempts + 1}/${config.detection.maxAttempts} → Détection du toy...`);

    initface.send(JSON.stringify([{ StartScanning: { Id: incrementId() } }]));
    initface.send(JSON.stringify([{ RequestDeviceList: { Id: incrementId() } }]));

    detectionAttempts++;
    setTimeout(() => {
        if (getSolaceIndex() === null) {
            tryDetectDevice(); // relance si non trouvé
        }
    }, 2000);
}


module.exports = {
    setDependencies,
    pump,
    move,
    stop,
    getBattery,
    startDeviceDetectionLoop,
    setSolaceIndex,
    getSolaceIndex,
};
