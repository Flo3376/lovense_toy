
/**
 * ========================================
 *  Lovense Toy Interface – Main Engine
 * ========================================
 * 
 * 
 *  Projet conçu, structuré et développé avec soin par Bob,
 *  avec l’accompagnement constant de Lisa (ChatGPT) pour :
 *  - déblayer les nœuds logiques
 *  - ranger les fonctions comme des outils dans une boîte bien triée
 *  - clarifier les flux de données et assainir le code moteur
 * 
 *  Objectif : construire une interface propre, stable, évolutive,
 *  sans sacrifier la lisibilité ni le plaisir de bricoler.
 * 
 *  Ce fichier peut grandir. Il est pensé pour.
 *  Tu veux t’en inspirer ? Reprendre un bout ? Vas-y.
 *  Juste… respecte les cerveaux qu’on a fait chauffer.
 */

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                     CHARGEMENT DES MODULES DE BASE & INIT                ║
// ║        Importation des dépendances, config, dossiers, fonctions          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Modules de base pour serveur HTTP, WebSocket, fichiers, chemins
const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Création des répertoires pour stocker les scénarios et rythmo si absents
const scenarioDir = path.join(__dirname, 'public', 'scenarios');
const rythmoDir = path.join(__dirname, 'public', 'rythmo');
if (!fs.existsSync(scenarioDir)) fs.mkdirSync(scenarioDir);
if (!fs.existsSync(rythmoDir)) fs.mkdirSync(rythmoDir);

// Afficher la bann_ére
const { printBanner } = require('./system/banner');
printBanner();


// Chargement de la config de ports et chemins
const config = require('./system/config');

// Fonctions utilitaires partagées : temps, IPs, arrêt propre, délais
const { getElapsedTime, logLocalIPs, registerShutdownHandler, delay } = require('./system/common');

// État initial de la disponibilité du port série
let comSerialAvailable = false;

// Horodatage du démarrage du serveur (pour calculer uptime)
const serverStartTime = Date.now();


// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                   INITIALISATION & GESTION DU PROCESSUS                   ║
// ║     Affichage des IP locales, gestion de la fermeture (CTRL+C, etc.)      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
// Quand on quitte (CTRL+C, kill, etc.)
process.on('SIGINT', () => {
    console.log('🛑 Arrêt demandé (SIGINT)');

    if (intiface && intiface.readyState === WebSocket.OPEN) {
        console.log('🔌 Déconnexion de Intiface...');
        intiface.close();
    }
    /*
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
      }*/
    process.exit(0);
});

/**
 * Affiche les adresses IP locales disponibles pour accéder à l'interface web.
 * Utile pour repérer l'URL depuis d'autres appareils du réseau local.
 */
logLocalIPs();


// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                      COMMUNICATION & INTERFACE INTIFACE                   ║
// ║   Gestion de l’interface web, du WebSocket frontend,                      ║
// ║   des échanges JSON, et de la communication avec Intiface                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
// Connexion WebSocket avec Intiface (port configuré dans config.js)
const intiface = new WebSocket(`ws://localhost:${config.ports.websocket}`);

// Initialisation de l’application Express (serveur web)
const app = express();

// Création du serveur HTTP à partir de l’app Express
const server = http.createServer(app);

// Mise en place d’un serveur WebSocket côté frontend (UI)
const wss = new WebSocket.Server({ server });

// Middleware pour décoder les requêtes JSON côté API
app.use(express.json());

// Sert les fichiers statiques depuis le dossier 'public'
app.use(express.static('public'));

// Chargement des routes API spécifiques (scénarios, rythmo, etc.)
const setupRoutes = require('./system/apiRoutes');
setupRoutes(app, scenarioDir, rythmoDir, __dirname);

// Lance le serveur HTTP
server.listen(config.ports.http, () => {
    console.log(`✅ Serveur lancé sur http://localhost:${config.ports.http}`);

});

let frontendSocket = null;
wss.on('connection', (ws) => {
    frontendSocket = ws;
    console.log('🌐 Frontend connecté');

    ws.send(JSON.stringify({
        type: "com9_status",
        available: comSerialAvailable
    }));

    ws.on('message', (data) => {
        const message = data.toString().trim();
        console.log('👉 Reçu:', message);

        // Si c'est JSON, on traite, sinon on envoie brut sur le port série
        if (message.startsWith('{') || message.startsWith('[')) {
            try {
                const commande = JSON.parse(message);
                handleJSONCommand(commande); // une fonction que tu écris pour traiter les commandes "toy"
            } catch (err) {
                console.error('⚡ Erreur JSON reçu:', err.message);
            }
        } else {
            // Pas du JSON : direct pour le vibreur sur le port série
            console.log('[SERIAL]🌀 Commande ASCII pour Vibror:', message);
            //port.write(message + '\n');
        }
    });
});
/**
 * Événement déclenché à l'ouverture de la connexion avec intiface.
 * Lance la détection de périphérique.
 */
intiface.on('open', () => {
    console.log('🔌 Connecté à Intiface');

    intiface.send(JSON.stringify([{
        RequestServerInfo: {
            Id: currentId++,
            ClientName: "LUCIE",
            MessageVersion: 3
        }
    }]));
});

/**
 * Événement déclenché à l'ouverture de la connexion avec intiface.
 * Lance la détection de périphérique.
 */
intiface.on('message', (msg) => {
    console.log(`     📨 Message reçu du client : ${msg.toString()} | ${getElapsedTime(serverStartTime)}s`);
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

        if (
            entry.SensorReading &&
            entry.SensorReading.SensorType === "Battery"
        ) {
            battery_level = entry.SensorReading.Data[0];
            console.log(`🔋 Niveau de batterie : ${battery_level}%`);
        }

        if (entry.DeviceList) {
            entry.DeviceList.Devices.forEach(dev => {
                if (dev.DeviceName.includes("Lovense Solace Pro")) {
                    solaceIndex = dev.DeviceIndex;
                    console.log(`🎯 Device trouvé: ${dev.DeviceName} (index ${solaceIndex})`);
                    console.log();
                    lovense_getBattery();
                }
            });
        }
    });
});

/**
 * Traite les commandes JSON reçues depuis le WebSocket du frontend.
 * Dirige chaque commande vers la fonction correspondante (Lovense ou orchestration).
 *
 * @param {object} cmd - Objet de commande contenant au minimum un champ "type"
 */
function handleJSONCommand(cmd) {
    if (!cmd || !cmd.type) {
        console.log('⚠️ Commande JSON invalide reçue.');
        console.log();
        return;
    }
    if (cmd.id_commande !== undefined) {
        currentAction = cmd.id_commande;
    }
    console.log(cmd);
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
            frontendSocket.send(JSON.stringify({
                type: "battery",
                value: battery_level
            }));
            break;
        case 'stop':
            console.log('🛑 Commande STOP reçue (toy)');
            launchMotorCommand(() => lovense_stop());
            break;

        case 'pump':
            console.log(`🎛️ Commande VIBRATE reçue: Intensité ${cmd.intensity}`);
            launchMotorCommand(() => LovensePump({
                center: 0.25,
                amplitude: 0.25,
                speed: cmd.intensity,
                actionId: currentAction
            }));
            break;

        case 'move':
            console.log(`🎚️ Commande MOVE reçue: Position ${cmd.position}, Durée ${cmd.duration}ms`);
            launchMotorCommand(() => lovense_move(
                parseFloat(cmd.position),        // pas besoin de /100 si déjà 0.25
                Math.round(cmd.duration)         // corriger le nom
            ));
            break;
        case 'pumpRamp':
            console.log(`↗️ [pumpRamp] De ${cmd.start} à ${cmd.end} en ${cmd.duration}ms (ID ${cmd.id_commande})`);
            launchMotorCommand(() => LovensePump({
                center: 0.25,
                amplitude: 0.25,
                speed: cmd.intensity / 100
            }));
            break;
        case "is_com9_available":
            frontendSocket.send(JSON.stringify({
                type: "com9_status",
                available: comSerialAvailable
            }));
            break;

        case 'customLoop':
            console.log(`🌀 Commande customLoop reçue: Min ${cmd.min}% / Max ${cmd.max}% à ${cmd.speed}% (ID ${cmd.id_commande})`);
            launchMotorCommand(() => lovenseLoop({
                start: cmd.min / 100,
                end: cmd.max / 100,
                speed: cmd.speed,
                actionId: cmd.id_commande
            }));
            break;

        default:
            console.log('❓ Commande JSON inconnue:', cmd);
    }
}



// ╔════════════════════════════════════════════════════════════════╗
// ║                       CONTRÔLE MOTEUR                          ║
// ║       Tout ce qui suit concerne les fonctions de mouvement     ║
// ║       (pompage, insertion, glissando, retrait, etc.)           ║
// ╚════════════════════════════════════════════════════════════════╝
// Index du toy connecté (mis à jour lors de la détection)
let solaceIndex = null;

// Identifiant global pour les messages envoyés à Intiface
let currentId = 1;

// Dernier identifiant de commande reçu depuis l’interface
let currentCommandId = null;

// Identifiant de la commande moteur actuellement active
let currentAction = -1;

// Drapeau de contrôle pour les fonctions moteur (true = exécution active)
let isRunning = true;

// Niveau de batterie actuel du toy (mis à jour par la lecture capteur)
let battery_level = 0;

// Nombre de tentatives de détection du toy via Intiface
let detectionAttempts = 0;

// Table des callbacks liés aux ID de commandes en attente (non exploité ici)
const pendingCommands = new Map();

/**
 * Gère l'exécution sécurisée d'une commande moteur.
 * 
 * - Interrompt proprement toute commande en cours en désactivant isRunning.
 * - Attend un court délai pour laisser la commande précédente se terminer.
 * - Réactive isRunning puis exécute la nouvelle fonction moteur fournie.
 * 
 * @param {Function} commandFn - Fonction asynchrone représentant la commande moteur à lancer.
 */
async function launchMotorCommand(commandFn) {
    // Stopper le moteur en cours
    isRunning = false;

    // Attendre un petit délai pour que l'ancien moteur stoppe proprement
    await delay(100);

    // Réactiver le moteur
    isRunning = true;

    // Lancer la nouvelle commande
    await commandFn();
}

/**
 * Exécute un pompage autour d’un centre donné, avec surveillance de l'actionId.
 *
 * @param {object} options
 * @param {number} options.center - Position centrale (0.0 à 1.0)
 * @param {number} options.amplitude - Amplitude autour du centre (0.0 → 0.5)
 * @param {number} options.speed - Vitesse abstraite (1 = lent, 100 = rapide)
 * @param {number} [options.repeat] - Nombre d’allers-retours (null = infini)
 * @param {number} options.actionId - Identifiant unique de cette commande
 * @param {number} [options.force_coeff=9] - Coefficient de rampe
 * @param {boolean} [options.flip=false] - Inverse le sens haut/bas
 */
async function LovensePump({
    center = 0.5,
    amplitude = 0.2,
    speed = 50,
    repeat = null,
    actionId,
    force_coeff = 9,
    flip = false
} = {}) {
    if (!actionId) {
        console.warn("[PUMP]❌ Aucune actionId fournie");
        return;
    }

    if (solaceIndex === null) {
        console.warn("[PUMP]⚠️ Aucun toy connecté !");
        return;
    }

    const pause = 50;
    const minPossible = amplitude;
    const maxPossible = 1.0 - amplitude;

    if (center < minPossible) {
        console.warn(`[PUMP]⚠️ Centre trop bas, recentré à ${minPossible}`);
        center = minPossible;
    } else if (center > maxPossible) {
        console.warn(`[PUMP]⚠️ Centre trop haut, recentré à ${maxPossible}`);
        center = maxPossible;
    }

    const min = Math.round((center - amplitude) * 100);
    const max = Math.min(Math.round((center + amplitude) * 100), 100);
    const distance = Math.abs(max - min);

    if (distance < 1) {
        console.warn("[PUMP]❌ Amplitude trop faible, mouvement ignoré.");
        return;
    }

    const duration = Math.round(
        //((speed - 1) / 99) * (distance * force_coeff - 50) + 50
        ((100 - speed) / 99) * (distance * force_coeff - 50) + 50
    );

    console.log(`\n🪠 Pompage autour de ${Math.round(center * 100)}% ± ${Math.round(amplitude * 100)}% | ${duration}ms`);

    let pos = min;
    let count = 0;

    while (actionId === currentAction && (repeat === null || count < repeat * 2)) {
        const realPos = (flip ? (100 - pos) : pos) / 100;
        lovense_move(realPos, duration);
        await delay(duration + pause);
        pos = (pos === min) ? max : min;
        count++;
    }

    lovense_stop();
    console.log("⏹️ Pompage terminé ou interrompu.");
}

/**
* Effectue un aller-retour en boucle entre deux positions, avec vitesse abstraite.
*
* @param {number} start - Position de départ (entre 0.0 et 1.0)
* @param {number} end - Position finale (entre 0.0 et 1.0)
* @param {number} speed - Vitesse abstraite (1 = lent, 100 = rapide)
* @param {number} actionId - Identifiant unique de la commande
* @param {number} [repeat] - Nombre de cycles (si omis = boucle infinie)
* @param {number} [force_coeff=9] - Coefficient de rampe
*/
async function lovenseLoop({
    start = 0.0,
    end = 1.0,
    speed = 50,
    actionId,
    repeat = null,
    force_coeff = 9
} = {}) {
    if (!actionId) {
        console.warn("[LOOP]❌ Aucune actionId fournie");
        return;
    }

    if (solaceIndex === null) {
        console.warn("[LOOP]⚠️ Aucun toy connecté !");
        return;
    }

    const pause = 50;
    const min = Math.round(Math.min(start, end) * 100);
    const max = Math.round(Math.max(start, end) * 100);
    const distance = Math.abs(max - min);

    if (distance < 1) {
        console.warn("[LOOP]❌ Distance trop faible, mouvement ignoré.");
        return;
    }

    const duration = Math.round(
        ((100 - speed) / 99) * (distance * force_coeff - 50) + 50
    );

    console.log(`\n🔁 Loop : ${min}% ↔ ${max}% | Durée ${duration}ms`);

    let pos = min;
    let count = 0;

    while (actionId === currentAction && (repeat === null || count < repeat * 2)) {
        const realPos = pos / 100;
        lovense_move(realPos, duration);
        await delay(duration + pause);
        pos = (pos === min) ? max : min;
        count++;
    }

    lovense_stop();
    console.log("⏹️ Loop terminé ou interrompu.");
}

/**
 * Exécute de petit allez et retour et ce décalle petit à petit.
 * 
 * Chaque phase correspond à un groupe d’aller-retour autour d’un point
 * qui se déplace progressivement de `start` à `end`.
 * L’amplitude reste constante, seule la base du mouvement évolue.
 * 
 * Exemple : 
 *   - start = 0.0, end = 1.0, phase = 5, amplitude = 0.3
 *   → oscillations de 0.0↔0.3, 0.25↔0.55, 0.5↔0.8, ...
 *
 * @param {number} start - Position de départ (0.0 à 1.0)
 * @param {number} end - Position finale (0.0 à 1.0)
 * @param {number} speed - Vitesse de mouvement (1 = lent, 100 = rapide)
 * @param {number} amplitude - Distance de chaque oscillation (ex: 0.3 pour 30%)
 * @param {number} phase - Nombre de positions intermédiaires (au moins 2)
 * @param {number} repeat - Nombre d’allers-retours par phase
 */
async function LovenseMovingOscillations({
    start = 0.0,
    end = 1.0,
    speed = 50,          // 1 = lent, 100 = rapide
    amplitude = 0.3,
    phase = 5,
    repeat = 2
} = {}) {
    if (solaceIndex === null) {
        console.warn("[PHASE-GLISS]⚠️ Aucun toy connecté !");
        return;
    }

    if (phase < 2) {
        console.warn("[PHASE-GLISS]❌ Il faut au moins 2 phases pour un glissage");
        return;
    }

    const pause = 50;
    const step = (end - start) / (phase - 1);

    for (let i = 0; i < phase; i++) {
        if (!isRunning) {
            console.log("⏹️ Crescendo interrompu !");
            break;
        }

        const base = start + i * step;
        const min = Math.round(base * 100);
        const max = Math.min(Math.round((base + amplitude) * 100), 100);

        const distance = Math.abs(max - min);
        if (distance < 1) {
            console.log(`⚠️ Phase ${i + 1}: déplacement trop petit (${distance}), ignorée.`);
            continue;
        }

        const duration = Math.round(
            ((speed - 1) / 99) * (distance * 9 - 50) + 50
        );

        console.log(`\n🎛️ Phase ${i + 1}/${phase}: ${min}% → ${max}% ×${repeat} | ${duration}ms`);

        let pos = min;
        for (let j = 0; j < repeat * 2; j++) {
            if (!isRunning) {
                console.log("⏹️ Crescendo interrompu !");
                break;
            }
            lovense_move((100 - pos) / 100, duration);
            await delay(duration + pause);
            pos = (pos === min) ? max : min;
        }
    }

    lovense_stop();
    console.log("\n✅ Glissando phasé terminé.");
}

/**
* Exécute des allez retour de plus en plus profond.
* 
* @param {number} step - Incrément d'amplitude à chaque cycle (ex: 0.1)
* @param {number} repeat - Nombre d’allers-retours à chaque niveau
* @param {number} speed - Vitesse abstraite (1 = lent, 100 = rapide)
* @param {number} maxAmplitude - Amplitude maximale à atteindre (en % de course)
* @param {number} force_coeff - forçage coéfficient de vitesse (9.17 par défaut, plus bas plus rapide, plus haut plus lent)
*/
async function LovenseDeeperAndDeeper({
    step = 0.1,
    repeat = 2,
    speed = 50,
    maxAmplitude = 1.0,
    force_coeff = 9
} = {}) {
    if (solaceIndex === null) {
        console.warn("[CRESCENDO]⚠️ Aucun toy connecté !");
        return;
    }

    const pause = 50;
    const origin = 1.0; // haut

    for (let amp = step; amp <= maxAmplitude; amp += step) {
        if (!isRunning) {
            console.log("⏹️ Crescendo interrompu !");
            break;
        }
        const high = 100; // toujours 100
        const low = Math.max(Math.round((origin - amp) * 100), 0); // plus profond
        const distance = Math.abs(high - low);
        if (distance < 1) {
            console.log(`⚠️ Amplitude trop petite (${distance}), ignorée.`);
            continue;
        }

        const duration = Math.round(
            ((speed - 1) / 99) * (distance * force_coeff - 50) + 50
        );

        console.log(`\n📉 Crescendo inversé: ${high}% → ${low}% ×${repeat} | ${duration}ms`);

        let pos = high; // on commence toujours par le haut
        for (let i = 0; i < repeat * 2; i++) {
            if (!isRunning) {
                console.log("⏹️ Crescendo interrompu !");
                break;
            }
            const realPos = pos / 100;
            lovense_move(realPos, duration);
            await delay(duration + pause);
            pos = (pos === high) ? low : high;
        }
    }

    lovense_stop();
    console.log("\n✅ Crescendo terminé.");
}

/**
 * Exécute un retrait progressif (amplitude décroissante du haut vers le bas).
 * 
 * @param {number} step - Réduction d'amplitude à chaque cycle (ex: 0.1)
 * @param {number} repeat - Nombre d’allers-retours à chaque niveau
 * @param {number} speed - Vitesse abstraite (1 = lent, 100 = rapide)
 * @param {number} startAmplitude - Amplitude initiale (maximale)
 * @param {number} force_coeff - Coefficient de rampe (par défaut = 9)
 */
async function LovenseLessAndLessDeep({
    step = 0.1,
    repeat = 2,
    speed = 50,
    startAmplitude = 1.0,
    force_coeff = 9
} = {}) {
    if (solaceIndex === null) {
        console.warn("[LESS-DEEP]⚠️ Aucun toy connecté !");
        return;
    }

    if (typeof isRunning === 'undefined') globalThis.isRunning = true;

    const pause = 50;
    const origin = 1.0; // position haute fixe

    for (let amp = startAmplitude; amp >= step; amp -= step) {
        if (!isRunning) {
            console.log("⏹️ Séquence interrompue !");
            break;
        }

        const high = 100; // on reste au plus haut
        const low = Math.max(Math.round((origin - amp) * 100), 0);
        const distance = Math.abs(high - low);
        if (distance < 1) {
            console.log(`⚠️ Amplitude trop petite (${distance}), ignorée.`);
            continue;
        }

        const duration = Math.round(
            ((speed - 1) / 99) * (distance * force_coeff - 50) + 50
        );

        console.log(`\n📤 Retrait: ${high}% → ${low}% ×${repeat} | ${duration}ms`);

        let pos = high;
        for (let i = 0; i < repeat * 2; i++) {
            const realPos = pos / 100;
            lovense_move(realPos, duration);
            await delay(duration + pause);
            pos = (pos === high) ? low : high;
        }
    }

    lovense_stop();
    console.log("\n✅ Retrait progressif terminé.");
}


/**
 * Envoie une commande de mouvement au toy.
 *
 * @param {number} position - Position cible (entre 0.0 et 1.0)
 * @param {number} duration - Durée du mouvement en millisecondes
 */
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

/**
 * Envoie un arrêt immédiat du moteur.
 */
function lovense_stop(callback = () => { }) {
    if (solaceIndex === null) return;
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
    isRunning = true;
}

/**
 * Demande le niveau de batterie du toy via intiface.
 */
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

    // Envoi de la commande
    intiface.send(JSON.stringify([batteryRequest]));
    console.log("📡 Requête batterie envoyée !");
}

/**
 * Lance une boucle de détection régulière pour repérer les toys connectés.
 */
function startDeviceDetectionLoop() {
    detectionAttempts = 0;
    tryDetectDevice();
}

/**
 * Tente de détecter un toy de type LinearActuator (Lovense).
 * Met à jour l'index si trouvé.
 */
function tryDetectDevice() {
    if (solaceIndex !== null) return;

    if (detectionAttempts >= config.detection.maxAttempts) {
        console.log("❌ Échec détection device après plusieurs tentatives.");
        console.log();
        return;
    }

    console.log();
    console.log(`🔍 Tentative ${detectionAttempts + 1}/${config.detection.maxAttempts} → Détection du toy...`);

    intiface.send(JSON.stringify([{ StartScanning: { Id: currentId++ } }]));
    intiface.send(JSON.stringify([{ RequestDeviceList: { Id: currentId++ } }]));

    detectionAttempts++;
    setTimeout(() => {
        if (solaceIndex === null) {
            tryDetectDevice(); // relance si non trouvé
        }
    }, 2000);
}
