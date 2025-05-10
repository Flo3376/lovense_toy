function stopAll() {
    req_stopAll();
}

function req_stopAll() {
    id_commande++;
    currentCommandId = id_commande;

    ctrl_hardStop(); // Pour l’ensemble Lovense + COM9
}

function ctrl_hardStop() {
    isLoopActive = false;
    ws.send(JSON.stringify({ type: 'stop' }));
    console.log('🛑 [ctrl_hardStop] Stop envoyé');
    log('🛑 [ctrl_hardStop] Stop envoyé');
}

function reqLov_pump(intensity) {
    id_commande++;
    currentCommandId = id_commande;

    setTimeout(() => {
        primLov_pump(intensity, currentCommandId);
    }, 150);
}

function reqLov_loop(min, max, speed) {
    id_commande++;
    currentCommandId = id_commande;


    ctrl_loopLov(min, max, speed, currentCommandId);
}

function ctrl_loopLov(min, max, speed, id) {
    isLoopActive = true;

    ws.send(JSON.stringify({
        type: 'customVibe',
        min: min,
        max: max,
        speed: speed,
        id_commande: id
    }));
    console.log(`🌀 [customLoop] min: ${min}%, max: ${max}%, duration: ${speed}ms (ID ${id})`);
    log(`🌀 [customLoop] min: ${min}%, max: ${max}%, duration: ${speed}ms (ID ${id})`);
}

function primLov_pump(intensity, id) {
    ws.send(JSON.stringify({
        type: 'pump',
        intensity,
        id_commande: id
    }));
    console.log(`📡 [primLov_pump] Intensité ${Math.round(intensity * 100)}% (ID ${id})`);
    log(`📡 [primLov_pump] Intensité ${Math.round(intensity * 100)}% (ID ${id})`);
}

function reqLov_move(position, duration) {
    id_commande++; // Nouvelle commande = nouveau token
    //ctrl_hardStop(); // Coupe toute action précédente

    setTimeout(() => {
        primLov_move(position, duration, id_commande);
    }, 100); // ou 200ms si nécessaire
}

function primLov_move(position, duration, id) {
    ws.send(JSON.stringify({
        type: 'move',
        position: position,   // entre 0.0 et 1.0
        duration: duration,   // en ms
        id_commande: id
    }));
    console.log(`➡️ [prim_move] Vers ${position * 100}% en ${duration}ms (ID ${id})`);
    log(`➡️ [prim_move] Vers ${position * 100}% en ${duration}ms (ID ${id})`);
}
