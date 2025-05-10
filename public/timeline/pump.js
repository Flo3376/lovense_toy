(() => {
  const pumpHTML = `
      <div id="pumpModal" style="
        display: none;
        position: fixed;
        z-index: 50;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: #222;
        color: white;
        padding: 20px;
        border: 2px solid deeppink;
        border-radius: 10px;
        box-shadow: 0 0 10px deeppink;
        text-align: center;
        width: 680px;
      ">
        <h4>💦 Ajouter Pump</h4>
        <label>Durée : <span id="pumpDurationLabel">1.0</span>s</label><br>
        <input style="width: 100%;" type="range" id="pumpDuration" min="1" max="10" step="0.5" value="1.0"><br>
  
        <label style="margin-top: 10px;">
          Durée infinie
          <label class="switch">
            <input type="checkbox" id="pumpInfiniteToggle">
            <span class="slider-round"></span>
          </label>
        </label>
  
        <h5 style="margin-top: 20px;">Intensité :</h5>
        <div class="sous-ensemble" id="pumpIntensityPresets"
          style="display: flex; flex-wrap: wrap; justify-content: center; gap: 5px;">
        </div>
  
        <br>
        <button onclick="validerPump()">✅ Valider</button>
        <button onclick="fermerPumpModal()">❌ Annuler</button>
      </div>
    `;

  document.body.insertAdjacentHTML('beforeend', pumpHTML);

  // Valeur sélectionnée
  let pumpSelectedIntensity = 0.5;

  // Init des presets d’intensité
  function initPumpPresets() {
    const container = document.getElementById('pumpIntensityPresets');
    container.innerHTML = '';
    const levels = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
    levels.forEach((val, i) => {
      const card = document.createElement('div');
      card.className = 'control-card';
      card.style.backgroundColor = `hsl(${200 + i * 10}, 100%, ${90 - i}px)`;
      card.innerHTML = `<div class="card-icon">💦</div><div class="card-label">${Math.round(val * 100)}%</div>`;
      card.onmouseenter = () => reqLov_pump(val);
      card.onmouseleave = () => stopAll();
      card.onclick = () => {
        pumpSelectedIntensity = val;
        document.querySelectorAll('#pumpIntensityPresets .control-card')
          .forEach(el => el.classList.remove('selected-intensity'));
        card.classList.add('selected-intensity');
      };
      container.appendChild(card);
    });
  }

  document.getElementById('pumpDuration').addEventListener('input', e => {
    document.getElementById('pumpDurationLabel').textContent = parseFloat(e.target.value).toFixed(1);
  });

  let pumpSelectedRow = null;
  let pumpSelectedTime = null;

  window.openPumpModal = (row, time) => {
    pumpSelectedRow = row;
    pumpSelectedTime = time;
    pumpSelectedIntensity = 0.5;
    initPumpPresets();
    document.getElementById('pumpModal').style.display = 'block';
  };

  window.fermerPumpModal = () => {
    document.getElementById('pumpModal').style.display = 'none';
  };

  window.validerPump = () => {

    const infinite = document.getElementById('pumpInfiniteToggle').checked;
    const duration = parseFloat(document.getElementById('pumpDuration').value);
    const time = pumpSelectedTime;
    const id = Date.now();
    console.log("tata");
    console.log("selectedRow =", window.selectedRow, "selectedTime =", time);

    const row = pumpSelectedRow;

    if (!row || typeof time === 'undefined') return;
    console.log("toto");
    const steps = [];
    const end = infinite ? video.duration : time + duration;

    for (let t = time; t < end; t += window.stepSize || 0.1) {
      steps.push({
        time: parseFloat(t.toFixed(1)),
        type: 'pump',
        id,
        value: pumpSelectedIntensity
      });
    }

    window.actionsByType.pump.push(...steps);
    window.actionsByType.pump.sort((a, b) => a.time - b.time);

    console.log(`💦 Pump ${pumpSelectedIntensity * 100}% ajouté de ${time}s à ${end}s`);
    window.updateTimeline(video.currentTime);
    window.reindexActionIDs?.();
    fermerPumpModal();
  };
})();
