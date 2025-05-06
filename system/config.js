/**
 * Configuration file for Lovense Toy Interface
 * All key settings centralized here for clarity and flexibility
 */

module.exports = {
    // Network configuration
    ports: {
      websocket: 12346, // Port for connecting to Intiface (default: 12345)
      http: 3000        // Port for the web UI
    },
  
    // Device detection behavior
    detection: {
      maxAttempts: 10   // Number of tries before giving up on device detection
    },
  
    // Correction factors for custom movement loops
    // -------------------------------------------------
    // These values are used to compute a time buffer between each move()
    // to ensure the device has completed the motion before receiving a new one.
    //
    // Formula:
    //   amplitude = |max - min|
    //   corr_A = min + (max - min) * amplitude
    //   corr_T = min + (max - min) * (duration / 2000)
    //   final_wait = duration + corr_A + corr_T
    //
    // This avoids jerky transitions or overlapping commands,
    // especially when looping quickly between distant positions.
    correction: {
      amplitude: {
        min: 10,        // Minimum delay (ms) for small movements
        max: 100        // Max delay (ms) for full-range movement
      },
      timing: {
        min: 2,         // Base delay (ms) for fast moves (~instant commands)
        max: 20         // Max delay (ms) for long moves (~2s)
      }
    },
  
    // Default parameters for custom vibration loop
    customVibeDefaults: {
      min: 0.25,        // Starting low position (0.0 to 1.0)
      max: 0.75,        // Target high position (0.0 to 1.0)
      speed: 100        // Duration of each move (in ms)
    }
  };
  