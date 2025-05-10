

(() => {
    const html = `
      <div id="moveModal" style="
        display: none;
        position: fixed;
        z-index: 999;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: #222;
        color: white;
        padding: 20px;
        border: 2px solid lime;
        border-radius: 10px;
        box-shadow: 0 0 10px lime;
        width: 340px;
      ">
        <h4>🎯 Ajouter Move</h4>
  
        <label>Position : <span id="movePositionLabel">50</span>%</label><br>
        <input type="range" id="movePositionSlider" min="0" max="100" value="50"><br><br>
  
        <label>Durée : <span id="moveDurationLabel">500</span> ms</label><br>
        <input type="range" id="moveDurationSlider" min="50" max="1000" step="10" value="500"><br><br>
  
        <button onclick="validerMove()">✅ Valider</button>
        <button onclick="fermerMoveModal()">❌ Annuler</button>
      </div>
    `;
  
    document.body.insertAdjacentHTML('beforeend', html);
  
    const posSlider = document.getElementById("movePositionSlider");
    const posLabel = document.getElementById("movePositionLabel");
    const durSlider = document.getElementById("moveDurationSlider");
    const durLabel = document.getElementById("moveDurationLabel");
  
    posSlider.addEventListener("input", () => {
      posLabel.textContent = posSlider.value;
    });
  
    durSlider.addEventListener("input", () => {
      durLabel.textContent = durSlider.value;
    });
  
    window.openMoveModal = (row, time) => {
      if (document.getElementById("loopModal")) document.getElementById("loopModal").style.display = "none";
      if (document.getElementById("pumpModal")) document.getElementById("pumpModal").style.display = "none";
      document.getElementById("moveModal").style.display = "block";
      window.selectedRow = row;
      window.selectedTime = time;
    };
  
    window.fermerMoveModal = () => {
      document.getElementById("moveModal").style.display = "none";
    };
  
    window.validerMove = () => {
      const time = window.selectedTime;
      const row = window.selectedRow;
      if (!row || time == null) return;
  
      const id = Date.now();
      const position = parseInt(posSlider.value) / 100;
      const duration = parseInt(durSlider.value);
  
      const moveStep = {
        time,
        id,
        type: "move",
        position,
        duration
      };
  
      if (!window.actionsByType.move) window.actionsByType.move = [];
      window.actionsByType.move.push(moveStep);
      window.actionsByType.move.sort((a, b) => a.time - b.time);
  
      console.log(`🎯 Move ajouté à ${time}s → ${position} / ${duration}ms`);
      updateTimeline(video.currentTime);
      window.reindexActionIDs?.();
      fermerMoveModal();
    };
  })();
  