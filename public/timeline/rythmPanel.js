(() => {
    const html = `
      <div id="rythmPanel" style="margin-top: 10px; padding: 10px; border: 1px solid deeppink; border-radius: 10px;">
        <h5 style="color: deeppink;">🧪 Rythm Designer</h5>
        <div style="display: flex; justify-content: center; align-items: center; gap: 20px;">
          <div class="hex-wrapper" id="tapHexWrapper" style="cursor: pointer;">
            <div class="hex">
              <div class="inner-circle" id="tapHex"></div>
            </div>
            <div style="text-align: center; font-size: 12px;">TAP</div>
          </div>
          <div class="hex-wrapper">
            <div class="hex">
              <div class="inner-circle" id="tempoHex"></div>
            </div>
            <div style="text-align: center; font-size: 12px;">Tempo</div>
          </div>
        </div>
        <div style="text-align: center; margin-top: 5px;">
          Moyenne : <strong id="tempoDisplay">--</strong> ms
          <button id="tempoResetBtn" style="margin-left: 10px; font-size: 0.8em;">🛑</button>
        </div>
      </div>
    `;

    document.getElementById('rythmPanelContainer').innerHTML = html;

    // === CSS local (optionnel si pas déjà dans ton CSS général) ===
    const style = document.createElement('style');
    style.textContent = `
      .#rythmPanel {
    background: #1b1b1b;
    border: 1px solid deeppink;
    border-radius: 8px;
    margin-top: 10px;
    padding: 10px;
    font-family: monospace;
}

#tempoDisplay {
    color: lightgreen;
    font-size: 1.1em;
}

#tempoLight {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #444;
    border: 2px solid #666;
    box-shadow: 0 0 4px #000;
}

.hex-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.hex {
    width: 150px;
    height: 150px;
    background-color: #666;
    position: relative;
    margin: 17.32px 0;
    clip-path: polygon(50% 0%,
            93% 25%,
            93% 75%,
            50% 100%,
            7% 75%,
            7% 25%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
    background: radial-gradient(circle at center, #777 30%, #555 100%);
    border: 1px solid #444;
}

.inner-circle {

    width: 100px;
    height: 100px;
    border-radius: 50%;
    background-color: #444;
    border: 8px solid #8aff00;
    box-shadow: 0 0 0 transparent;
    transition: background-color 0.2s, box-shadow 0.2s;
    box-shadow: 0 0 8px rgba(138, 255, 0, 0.3);

}

.inner-circle.active {
    background-color: #aaff00;
    box-shadow: 0 0 10px #aaff00;
}

#tempoDisplay.warning {
    color: red;
    animation: blink-red 1s step-start infinite;
}

@keyframes blink-red {
    50% {
        color: #ff4444;
    }
}
    `;
    document.head.appendChild(style);

    // === Logique TAP
    let tapTimes = [];
    let tempoInterval = null;
    let tempoTimeout = null;

    const tapHex = document.getElementById('tapHex');
    const tempoHex = document.getElementById('tempoHex');
    const tempoDisplay = document.getElementById('tempoDisplay');
    const panel = document.getElementById('rythmPanel');

    window.tempoMs = null; // accessible globalement

    function startTempoLoop() {
        if (!tempoMs || tempoInterval) return;
        tempoInterval = setInterval(() => {
            tempoHex.classList.add('active');
            setTimeout(() => tempoHex.classList.remove('active'), 150);
        }, tempoMs);
    }

    function stopTempoLoop() {
        if (tempoInterval) {
            clearInterval(tempoInterval);
            tempoInterval = null;
        }
    }

    function resetTempo() {
        stopTempoLoop();
        tapTimes = [];
        tempoMs = null;
        tempoDisplay.textContent = '--';
        tempoHex.classList.remove('active');
    }

    document.getElementById('tempoResetBtn').addEventListener('click', resetTempo);

    document.getElementById('tapHexWrapper').addEventListener('click', () => {
        tapHex.classList.add('active');
        setTimeout(() => tapHex.classList.remove('active'), 100);

        const now = Date.now();
        tapTimes.push(now);
        if (tapTimes.length > 5) tapTimes.shift();

        if (tapTimes.length >= 2) {
            const intervals = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
            tempoMs = Math.round(intervals.reduce((a, b) => a + b) / intervals.length);
            tempoDisplay.textContent = `${tempoMs} ms`;

            stopTempoLoop();
            startTempoLoop();
        }
    });

    panel.addEventListener('mouseleave', () => {
        tempoTimeout = setTimeout(() => {
            stopTempoLoop();
        }, 10000);
    });

    panel.addEventListener('mouseenter', () => {
        if (tempoTimeout) {
            clearTimeout(tempoTimeout);
            tempoTimeout = null;
        }
        if (tempoMs && !tempoInterval) {
            startTempoLoop();
        }
    });
})();
