const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORT_SERIE = 'COM9';       // You can make this configurable later
const BAUDRATE = 115200;

let isAvailable = false;

const port = new SerialPort({
  path: PORT_SERIE,
  baudRate: BAUDRATE,
  autoOpen: false
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

/**
 * Opens the serial port and sets availability status.
 */
function openPort() {
  port.open((err) => {
    if (err) {
      isAvailable = false;
      console.error('⚡ Failed to open serial port:', err.message);
    } else {
      isAvailable = true;
      console.log('🛰️ Serial port successfully opened!');
    }
  });
}

/**
 * Writes a message to the serial port if open.
 * @param {string} message - Text to send
 */
function sendToSerial(message) {
  if (port && port.isOpen) {
    port.write(`${message}\n`);
  } else {
    console.warn('⛔ Cannot send to serial: port not open.');
  }
}

/**
 * Returns current availability of the serial port.
 * @returns {boolean}
 */
function serialIsAvailable() {
  return isAvailable;
}

module.exports = {
  port,
  parser,
  openPort,
  sendToSerial,
  serialIsAvailable
};
