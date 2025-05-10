(() => {
    const html = `
    

      <div id="loopModal" style="
        display: none;
        position: fixed;
        z-index: 999;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        background: #222;
        color: white;
        padding: 20px;
        border: 2px solid deeppink;
        border-radius: 10px;
        box-shadow: 0 0 10px deeppink;
        width: 400px;
      ">
        <h4>🔁 Ajouter Loop</h4>
  
        <div class="slider-box">
          <span>Plage :</span>
          <div class="wrapper">
            <div class="values">
              <span id="loopMinLabel">25%</span>
              <span id="loopMaxLabel">75%</span>
            </div>
  
            <style>
            #loopModal .loop-slider-wrapper {
            position: relative;
            height: 60px;
            background: none;
            }
            #loopModal .loop-slider-track {
            height: 6px;
            background: #999;
            border-radius: 5px;
            width: 100%;
            margin: 0 auto;
            }
            #loopModal .loop-slider {
            width: 100%;
            margin: 0;
            background: transparent;
            z-index: 1;
            }
            #loopModal .loop-slider-values {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            margin-top: 4px;
            color: white;
            }
            #loopModal .loop-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            height: 18px;
            width: 18px;
            background: deeppink;
            border-radius: 50%;
            border: 2px solid white;
            cursor: pointer;
            }
            </style>

         <div class="slider-track"></div>
  


          <input type="range" id="loopMinSlider" min="0" max="100" value="25">
            <input type="range" id="loopMaxSlider" min="0" max="100" value="75">
          </div>
  


      </div>
  



        <label>Durée sur le scénario : <span id="loopDurationLabel">1.0</span>s</label><br>
        <input type="range" id="loopDurationSlider" min="0.5" max="10" step="0.5" value="5.0"><br>
  
        <label style="margin-top: 5px; display: block;">
          Répétition infinie :
          <label class="switch">
            <input type="checkbox"  class="loop-slider" id="loopInfiniteToggle">
            <span class="slider-round"></span>
          </label>
        </label>
        <label style="margin-top: 5px; display: block;">
  Aller / Aller-retour :
  <label class="switch">
    <input type="checkbox" id="loopModeToggle" checked>
    <span class="slider-round"></span>
  </label>
</label>
        <label>Vitesse du loop : <span id="loopSpeedLabel">1000</span> ms</label><br>
        <input type="range"  class="loop-slider" id="loopSpeedSlider" min="50" max="3000" step="10" value="1000"><br>
        <button id="loopTempoCopyBtn">📋 Copier depuis le rythme</button><br><br>
  
        <button onclick="validerLoop()">✅ Valider</button>
        <button onclick="fermerLoopModal()">❌ Annuler</button>
      </div>
  


  `;
  
    document.getElementById('loopModalContainer').innerHTML = html;
  
    const sliderOne = document.getElementById("loopMinSlider");
    const sliderTwo = document.getElementById("loopMaxSlider");
    const displayValOne = document.getElementById("loopMinLabel");
    const displayValTwo = document.getElementById("loopMaxLabel");
    const sliderTrack = document.querySelector(".loop-slider-track");
  
    let loopMin = 25;
    let loopMax = 75;
    let loopSpeed = 1000;
    let loopDuration = 1.0;
    let loopInfinite = false;
    let loopRow = null;
    let loopTime = null;
    const minGap = 30;
  
    function fillColor() {
      /*const percent1 = loopMin;
      const percent2 = loopMax;
      sliderTrack.style.background = `linear-gradient(to right, #d3d3d3 ${percent1}% , deeppink ${percent1}% , deeppink ${percent2}%, #d3d3d3 ${percent2}%)`;
      */
    }
  
    sliderOne.addEventListener("input", () => {
      loopMin = parseInt(sliderOne.value);
      if (loopMin + minGap > 100) loopMin = 100 - minGap;
      if (loopMin + minGap > loopMax) {
        loopMax = loopMin + minGap;
        sliderTwo.value = loopMax;
      }
      sliderOne.value = loopMin;
      displayValOne.textContent = loopMin + "%";
      displayValTwo.textContent = loopMax + "%";
      fillColor();
    });
  
    sliderTwo.addEventListener("input", () => {
      loopMax = parseInt(sliderTwo.value);
      if (loopMax - minGap < 0) loopMax = minGap;
      if (loopMax - minGap < loopMin) {
        loopMin = loopMax - minGap;
        sliderOne.value = loopMin;
      }
      sliderTwo.value = loopMax;
      displayValOne.textContent = loopMin + "%";
      displayValTwo.textContent = loopMax + "%";
      fillColor();
    });
  
    document.getElementById("loopDurationSlider").addEventListener("input", e => {
      loopDuration = parseFloat(e.target.value);
      document.getElementById("loopDurationLabel").textContent = loopDuration.toFixed(1);
    });
  
    document.getElementById("loopInfiniteToggle").addEventListener("change", e => {
      loopInfinite = e.target.checked;
    });
  
    document.getElementById("loopSpeedSlider").addEventListener("input", e => {
      loopSpeed = parseInt(e.target.value);
      document.getElementById("loopSpeedLabel").textContent = loopSpeed;
    });
  
    document.getElementById("loopTempoCopyBtn").addEventListener("click", () => {
      if (window.tempoMs) {
        loopSpeed = tempoMs;
        document.getElementById("loopSpeedSlider").value = loopSpeed;
        document.getElementById("loopSpeedLabel").textContent = loopSpeed;
      } else {
        alert("Aucun tempo défini !");
      }
    });
  
    window.openLoopModal = (row, time) => {
      loopRow = row;
      loopTime = time;
      loopMin = 25;
      loopMax = 75;
      loopDuration = 1.0;
      loopInfinite = false;
      loopSpeed = 1000;
      sliderOne.value = loopMin;
      sliderTwo.value = loopMax;
      document.getElementById("loopDurationSlider").value = loopDuration;
      document.getElementById("loopInfiniteToggle").checked = loopInfinite;
      document.getElementById("loopSpeedSlider").value = loopSpeed;
      document.getElementById("loopSpeedLabel").textContent = loopSpeed;
      fillColor();
      document.getElementById("loopModal").style.display = "block";
    };
  
    window.fermerLoopModal = () => {
      document.getElementById("loopModal").style.display = "none";
    };
  
    window.validerLoop = () => {
      if (!loopRow || loopTime == null) return;
  
      const id = Date.now();
      const end = loopInfinite ? video.duration : loopTime + loopDuration;
      const steps = [];
      const duration = end - loopTime;
  
      for (let t = loopTime; t < end; t += window.stepSize || 0.1) {
        const rel = (t - loopTime) / duration;
        const isBack = rel > 0.5 && true;
        const fact = isBack ? 1 - ((rel - 0.5) * 2) : rel * 2;
        const pos = loopMin + (loopMax - loopMin) * fact;
        steps.push({
          time: parseFloat(t.toFixed(2)),
          type: "loop",
          id,
          start: loopMin,
        end: loopMax,
        duration: loopInfinite ? "inf" : Math.round(loopDuration * 1000),
        allerRetour: document.getElementById("loopModeToggle")?.checked ?? true
        });
      }


  
      window.actionsByType.loop.push(...steps);
      window.actionsByType.loop.sort((a, b) => a.time - b.time);
      window.updateTimeline(video.currentTime);
      window.reindexActionIDs?.();
      fermerLoopModal();
    };
  })();
  