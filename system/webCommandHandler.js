module.exports = function handleJSONCommand(cmd) {
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
        stopRamp();
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