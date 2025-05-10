// === Variables partagées globales ===
window.actionsByType = {
  pump: [],
  loop: [],
  stop: [],
  move: []
};

window.closeAllModals = () => {
  const modals = ["pumpModal", "loopModal", "moveModal", "stopModal","stepContextMenu"];
  modals.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
};

window.closeAllContextMenus = () => {
  const menus = ["contextMenu", "stepContextMenu"];
  menus.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
};



window.selectedRow = null;
window.selectedTime = null;

// Durée d’un step en secondes (modifiable au besoin)
window.stepSize = 0.5;

// Valeur tempo partagée par le rythmPanel
window.tempoMs = null;

// Placeholder pour future commande
window.currentCommandId = null;

// Reindex (doit être défini ailleurs ou remplacé ici par une version simple)
window.reindexActionIDs = window.reindexActionIDs || function () {
  let id = 1;
  for (const type in actionsByType) {
    actionsByType[type].forEach(step => {
      step.id = id++;
    });
  }
};
