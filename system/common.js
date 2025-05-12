// commons.js
const os = require('os');
const WebSocket = require('ws');

/**
 * Calculates elapsed time since the given timestamp, formatted in seconds.milliseconds
 * @param {number} since - Timestamp in ms (e.g., from Date.now())
 * @returns {string} Formatted elapsed time (e.g., "1.100")
 */
function getElapsedTime(since) {
  const now = Date.now();
  const elapsedMs = now - since;
  const seconds = Math.floor(elapsedMs / 1000);
  const milliseconds = elapsedMs % 1000;
  return `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Logs the local IPv4 addresses to the console.
 * Useful for debugging or connecting to this machine on a LAN.
 */
function logLocalIPs() {
  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`🌐 Local IP (${ifname}): ${iface.address}`);
      }
    });
    console.log();
  });
}

/**
 * Registers a clean shutdown handler on SIGINT.
 * You must pass the initface and port used by the main program.
 * @param {WebSocket} initface - WebSocket connection to initface
 * @param {SerialPort} port - SerialPort object (e.g., from serialport lib)
 */
function registerShutdownHandler(initface, port) {
  process.on('SIGINT', () => {
    console.log('🛑 Shutdown requested (SIGINT)');

    if (initface && initface.readyState === WebSocket.OPEN) {
      console.log('🔌 Disconnecting from initface...');
      initface.close();
    }

    if (port && port.isOpen) {
      console.log('🔌 Sending final STOP to vibrator...');
      port.write('e,id=999,target=vibror,mode=stop\n', () => {
        port.close(() => {
          console.log('✅ Serial port closed');
          process.exit(0);
        });
      });
    } else {
      process.exit(0);
    }
  });
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


module.exports = {
  getElapsedTime,
  logLocalIPs,
  registerShutdownHandler,delay
};
