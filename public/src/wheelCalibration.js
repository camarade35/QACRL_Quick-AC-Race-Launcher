// public/src/wheelCalibration.js
// Wizard de calibration guidé par boutons OK.

(function (global) {
  'use strict';

  const MOVEMENT_THRESHOLD = 0.3;
  const REST_THRESHOLD = 0.25;

  let state = null;
  let liveInterval = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function snapshotAll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads.map(p => p ? p.axes.slice() : null);
  }

  function getPad() {
    if (!state || !state.device) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads[state.device.chromiumIndex] || null;
  }

  async function loadControlsData() {
    const res = await window.api.readIniFile('controls.ini');
    if (!res.success) throw new Error('controls.ini introuvable');
    const sections = global.IniParser.parseIni(res.content);
    return { sections, raw: res.content };
  }

  function readAxle(sections, sectionName) {
    const sec = sections.find(s => s.name === sectionName);
    if (!sec) return null;
    const entry = sec.entries.find(e => e.kind === 'kv' && e.key === 'AXLE');
    if (!entry) return null;
    const n = parseInt(entry.value, 10);
    return isNaN(n) ? null : n;
  }

  function stopLive() {
    if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  // ---------------------------------------------------------------------------
  // Détection du device
  // ---------------------------------------------------------------------------
  async function detectDevice() {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          global.GamepadCapture.stop();
          reject(new Error('Aucun mouvement détecté (15s). Bouge un peu le volant ou appuie sur une pédale.'));
        }
      }, 15000);

      global.GamepadCapture.start({
        axesThreshold: 0.3, timeoutMs: 0,
        resolveAcIndex: () => null,
        onCapture: (r) => {
          if (resolved) return;
          if (r.kind !== 'axis') return;
          resolved = true;
          clearTimeout(timeout);
          global.GamepadCapture.stop();

          const pads = navigator.getGamepads();
          const pad = pads[r.chromiumIndex];
          if (!pad) return reject(new Error('Pad introuvable'));
          const vp = global.GamepadMapper.parseChromiumGamepadId(pad.id);
          if (!vp) return reject(new Error('Device non identifié (Vendor/Product absents).'));
          resolve({ vendor: vp.vendor, product: vp.product, chromiumIndex: r.chromiumIndex, padId: pad.id });
        },
        onCancel: () => {
          if (resolved) return;
          resolved = true; clearTimeout(timeout);
          reject(new Error('Détection annulée'));
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  let elements = null;

  function cacheElements() {
    elements = {
      modal:   document.getElementById('wheel-calib-modal'),
      close:   document.getElementById('wheel-calib-close'),
      content: document.getElementById('wheel-calib-content'),
      footer:  document.getElementById('wheel-calib-footer'),
    };
  }

  // ---------------------------------------------------------------------------
  // Visuels
  // ---------------------------------------------------------------------------
  function makeWheelBar() {
    const wrap = el('div', { class: 'calib-wheel-wrap' });
    const bar = el('div', { class: 'calib-wheel-bar' });
    const centerLine = el('div', { class: 'calib-wheel-center' });
    const indicator = el('div', { class: 'calib-wheel-indicator' });
    bar.appendChild(centerLine);
    bar.appendChild(indicator);
    const labels = el('div', { class: 'calib-wheel-labels' });
    labels.appendChild(el('span', { text: '-1' }));
    labels.appendChild(el('span', { text: '0' }));
    labels.appendChild(el('span', { text: '+1' }));
    const value = el('div', { class: 'calib-wheel-value', text: '0.00' });
    wrap.appendChild(bar);
    wrap.appendChild(labels);
    wrap.appendChild(value);
    return { wrap, indicator, value };
  }

  function makePedalBar() {
    const wrap = el('div', { class: 'calib-pedal-wrap' });
    const bar = el('div', { class: 'calib-pedal-bar' });
    const fill = el('div', { class: 'calib-pedal-fill' });
    bar.appendChild(fill);
    const val = el('div', { class: 'calib-pedal-value', text: '0.00' });
    wrap.appendChild(bar);
    wrap.appendChild(val);
    return { wrap, fill, value: val };
  }

  // ---------------------------------------------------------------------------
  // Définition des étapes
  // ---------------------------------------------------------------------------
  const STEPS = [
    { id: 'steer',     section: 'STEER',     title: 'Direction',     icon: '🚗',
      moveText: 'Tourne le volant à FOND à GAUCHE',
      skippable: false },
    { id: 'throttle',  section: 'THROTTLE',  title: 'Accélérateur',  icon: '🦶',
      moveText: 'Appuie à FOND sur l\'accélérateur SEUL',
      skippable: false },
    { id: 'brakes',    section: 'BRAKES',    title: 'Freins',        icon: '🛑',
      moveText: 'Appuie à FOND sur le frein SEUL',
      skippable: false },
    { id: 'clutch',    section: 'CLUTCH',    title: 'Embrayage',     icon: '🔗',
      moveText: 'Appuie à FOND sur l\'embrayage SEUL',
      skippable: false },
    { id: 'handbrake', section: 'HANDBRAKE', title: 'Frein à main',  icon: '✋',
      moveText: 'Actionne le frein à main',
      skippable: true },
  ];

  // ---------------------------------------------------------------------------
  // Écran d'accueil
  // ---------------------------------------------------------------------------
  function renderWelcome(statusText) {
    elements.content.innerHTML =
      '<div class="wheel-calib-step">' +
        '<div class="wheel-calib-icon">🎯</div>' +
        '<h3>Calibration du volant</h3>' +
        '<p>Ce guide va détecter la correspondance entre ton volant et Assetto Corsa.</p>' +
        '<p class="wheel-calib-hint">Pour commencer, <strong>bouge un peu le volant</strong> ou <strong>appuie sur une pédale</strong>.</p>' +
        '<div class="wheel-calib-loading">' + (statusText || '⏳ En attente d\'un mouvement…') + '</div>' +
      '</div>';
    elements.footer.innerHTML =
      '<button class="filter-btn" id="wheel-calib-cancel">Annuler</button>';
    document.getElementById('wheel-calib-cancel').addEventListener('click', close);
  }

  // ---------------------------------------------------------------------------
  // Écran "position de repos"
  // ---------------------------------------------------------------------------
  function renderRestScreen() {
    stopLive();
    elements.content.innerHTML = '';
    const box = el('div', { class: 'wheel-calib-step' });
    box.appendChild(el('div', { class: 'wheel-calib-icon', text: '🛑' }));
    box.appendChild(el('h3', { text: 'Position de repos' }));
    box.appendChild(el('p', { class: 'wheel-calib-instruction',
      text: 'Centre ton volant, relâche toutes les pédales.' }));
    box.appendChild(el('p', { class: 'wheel-calib-hint',
      text: 'Ça permet d\'enregistrer la position neutre de chaque axe.' }));

    const liveBox = el('div', { class: 'calib-live-grid' });
    const pad = getPad();
    const nAxes = pad ? Math.min(pad.axes.length, 10) : 0;
    const bars = [];
    for (let i = 0; i < nAxes; i++) {
      if (i === 9) continue;
      const b = el('div', { class: 'calib-axis-row' });
      b.appendChild(el('span', { class: 'calib-axis-idx', text: 'Axe ' + i }));
      const bar = el('div', { class: 'calib-axis-bar' });
      const fill = el('div', { class: 'calib-axis-fill' });
      bar.appendChild(fill);
      const val = el('span', { class: 'calib-axis-val', text: '0.00' });
      b.appendChild(bar);
      b.appendChild(val);
      liveBox.appendChild(b);
      bars.push({ idx: i, fill, val });
    }
    box.appendChild(liveBox);
    elements.content.appendChild(box);

    elements.footer.innerHTML =
      '<button class="filter-btn" id="wheel-calib-cancel">Annuler</button>' +
      '<button class="filter-btn ini-btn-save" id="wheel-calib-ready">✓ Je suis au repos</button>';

    document.getElementById('wheel-calib-cancel').addEventListener('click', close);
    document.getElementById('wheel-calib-ready').addEventListener('click', onRestConfirmed);

    liveInterval = setInterval(() => {
      const p = getPad();
      if (!p) return;
      for (const b of bars) {
        const v = p.axes[b.idx];
        if (v == null) continue;
        const pct = ((v + 1) / 2) * 100;
        b.fill.style.width = pct.toFixed(1) + '%';
        b.val.textContent = v.toFixed(2);
      }
    }, 60);
  }

  function onRestConfirmed() {
    const pad = getPad();
    if (!pad) { alert('Pad introuvable'); return; }
    state.baselineAxes = pad.axes.slice();
    console.log('[Wizard] Baseline :', state.baselineAxes.map((v, i) => i + ':' + v.toFixed(2)).join(' '));
    state.currentStep = 0;
    state.subStep = 'move';
    runCurrentStep();
  }

  // ---------------------------------------------------------------------------
  // Écran d'étape (move ou rest)
  // ---------------------------------------------------------------------------
  function renderStepScreen() {
    stopLive();
    const step = STEPS[state.currentStep];
    const isMove = state.subStep === 'move';
    const isSteer = step.section === 'STEER';

    elements.content.innerHTML = '';
    const box = el('div', { class: 'wheel-calib-step' });
    box.appendChild(el('div', { class: 'wheel-calib-progress',
      text: 'Étape ' + (state.currentStep + 1) + ' / ' + STEPS.length }));
    box.appendChild(el('div', { class: 'wheel-calib-icon', text: step.icon }));
    box.appendChild(el('h3', { text: step.title }));

    const instructionText = isMove
      ? step.moveText
      : 'Ramène au repos (centre le volant / relâche la pédale)';
    box.appendChild(el('p', { class: 'wheel-calib-instruction', text: instructionText }));

    // Barre live sur l'axe ciblé (si déjà détecté) ou sur l'axe qui bouge
    let liveUpd = null;

    if (isMove && state.detectedAxis == null) {
      // Pas encore d'axe détecté → afficher toutes les barres pour feedback
      const liveBox = el('div', { class: 'calib-live-grid' });
      const pad = getPad();
      const nAxes = pad ? Math.min(pad.axes.length, 10) : 0;
      const bars = [];
      for (let i = 0; i < nAxes; i++) {
        if (i === 9) continue;
        const b = el('div', { class: 'calib-axis-row' });
        b.appendChild(el('span', { class: 'calib-axis-idx', text: 'Axe ' + i }));
        const bar = el('div', { class: 'calib-axis-bar' });
        const fill = el('div', { class: 'calib-axis-fill' });
        bar.appendChild(fill);
        const val = el('span', { class: 'calib-axis-val', text: '0.00' });
        b.appendChild(bar);
        b.appendChild(val);
        liveBox.appendChild(b);
        bars.push({ idx: i, fill, val });
      }
      box.appendChild(liveBox);
      liveUpd = () => {
        const p = getPad();
        if (!p) return;
        for (const b of bars) {
          const v = p.axes[b.idx];
          if (v == null) continue;
          const pct = ((v + 1) / 2) * 100;
          b.fill.style.width = pct.toFixed(1) + '%';
          b.val.textContent = v.toFixed(2);
        }
      };
    } else {
      // Axe ciblé : barre unique (horizontale pour volant, verticale pour pédale)
      const ax = state.detectedAxis != null ? state.detectedAxis : null;
      if (isSteer) {
        const w = makeWheelBar();
        box.appendChild(w.wrap);
        liveUpd = () => {
          const p = getPad();
          if (!p || ax == null) return;
          const v = p.axes[ax];
          if (v == null) return;
          const pct = ((v + 1) / 2) * 100;
          w.indicator.style.left = pct.toFixed(1) + '%';
          w.value.textContent = v.toFixed(2);
        };
      } else {
        const p = makePedalBar();
        box.appendChild(p.wrap);
        liveUpd = () => {
          const pad = getPad();
          if (!pad || ax == null) return;
          const v = pad.axes[ax];
          if (v == null) return;
          const pct = ((v + 1) / 2) * 100;
          p.fill.style.height = pct.toFixed(1) + '%';
          p.value.textContent = v.toFixed(2);
        };
      }
    }

    box.appendChild(el('div', { class: 'wheel-calib-status waiting',
      text: isMove ? '🎯 À toi de jouer !' : '🛑 Attente du repos…' }));
    elements.content.appendChild(box);

    // Footer
    let footerHtml = '';
    if (isMove && step.skippable) {
      footerHtml += '<button class="filter-btn" id="wheel-calib-skip">⏭ Passer</button>';
    }
    footerHtml += '<button class="filter-btn" id="wheel-calib-cancel">Annuler</button>';

    if (isMove) {
      footerHtml += '<button class="filter-btn ini-btn-save" id="wheel-calib-ok">✓ C\'est fait</button>';
    } else {
      footerHtml += '<button class="filter-btn ini-btn-save" id="wheel-calib-ok">✓ Au repos</button>';
    }

    elements.footer.innerHTML = footerHtml;
    document.getElementById('wheel-calib-cancel').addEventListener('click', close);
    if (isMove && step.skippable) {
      document.getElementById('wheel-calib-skip').addEventListener('click', () => {
        state.results.push({ id: step.id, chromiumAxis: null, acAxis: null, reason: 'skipped' });
        state.currentStep++;
        state.subStep = 'move';
        state.detectedAxis = null;
        runCurrentStep();
      });
    }
    document.getElementById('wheel-calib-ok').addEventListener('click', () => {
      if (isMove) onMoveConfirmed();
      else onRestConfirmedStep();
    });

    if (liveUpd) liveInterval = setInterval(liveUpd, 60);
  }

  // ---------------------------------------------------------------------------
  // Détecte l'axe qui a le plus bougé depuis la baseline
  // ---------------------------------------------------------------------------
  function findMovingAxis() {
    const pad = getPad();
    if (!pad) return null;
    let best = null;
    for (let i = 0; i < pad.axes.length; i++) {
      if (i === 9) continue;
      const b = state.baselineAxes[i];
      const v = pad.axes[i];
      if (b == null || v == null) continue;
      const amp = Math.abs(v - b);
      if (amp >= MOVEMENT_THRESHOLD && (!best || amp > best.amplitude)) {
        best = { axisIndex: i, value: v, amplitude: amp };
      }
    }
    return best;
  }

  function onMoveConfirmed() {
    // Si on n'a pas encore détecté l'axe → chercher maintenant
    if (state.detectedAxis == null) {
      const moving = findMovingAxis();
      if (!moving) {
        alert('Aucun mouvement détecté. Recommence le mouvement et clique à nouveau sur "C\'est fait".');
        return;
      }
      state.detectedAxis = moving.axisIndex;
      state.detectedValue = moving.value;
      console.log('[Wizard] Axe détecté :', moving.axisIndex, 'valeur', moving.value.toFixed(2), 'amplitude', moving.amplitude.toFixed(2));
    }

    // Passer à l'étape "repos"
    state.subStep = 'rest';
    renderStepScreen();
  }

  function onRestConfirmedStep() {
    // Vérifie que l'axe est bien revenu au repos
    const pad = getPad();
    if (pad && state.detectedAxis != null) {
      const v = pad.axes[state.detectedAxis];
      const b = state.baselineAxes[state.detectedAxis];
      if (v != null && b != null && Math.abs(v - b) > REST_THRESHOLD) {
        alert('L\'axe n\'est pas encore revenu au repos. Relâche complètement et clique à nouveau.');
        return;
      }
    }

    // Enregistre le résultat
    const step = STEPS[state.currentStep];
    const acAxis = readAxle(state.controls.sections, step.section);
    state.results.push({
      id: step.id,
      chromiumAxis: state.detectedAxis,
      acAxis: acAxis,
    });

    // Étape suivante
    state.currentStep++;
    state.subStep = 'move';
    state.detectedAxis = null;
    state.detectedValue = null;

    if (state.currentStep >= STEPS.length) {
      finalizeAndSummary();
    } else {
      runCurrentStep();
    }
  }

  function runCurrentStep() {
    if (!state) return;

    // ⭐ Vérif en PREMIER : si on a fini toutes les étapes, on saute au résumé
    if (state.currentStep >= STEPS.length) {
      finalizeAndSummary();
      return;
    }

    const step = STEPS[state.currentStep];
    const acAxis = readAxle(state.controls.sections, step.section);

    // Si pas d'AXLE configuré → skip
    if (acAxis === null) {
      state.results.push({ id: step.id, chromiumAxis: null, acAxis: null, reason: 'no-ac-axle' });
      state.currentStep++;
      state.subStep = 'move';
      state.detectedAxis = null;
      if (state.currentStep >= STEPS.length) {
        finalizeAndSummary();
      } else {
        runCurrentStep();
      }
      return;
    }

    renderStepScreen();
  }

  // ---------------------------------------------------------------------------
  // Résumé
  // ---------------------------------------------------------------------------
  async function finalizeAndSummary() {
    stopLive();
    const axes = {};
    for (const r of state.results) {
      if (r.chromiumAxis != null && r.acAxis != null) {
        axes[String(r.chromiumAxis)] = r.acAxis;
      }
    }
    if (Object.keys(axes).length > 0) {
      await window.api.saveWheelProfile(state.device.vendor, state.device.product, {
        axes, source: 'wizard',
      });
      if (global.GamepadMapper.refreshLearnedProfiles) {
        await global.GamepadMapper.refreshLearnedProfiles();
      }
    }

    const rows = state.results
      .filter(r => r.chromiumAxis != null && r.acAxis != null)
      .map(r => {
        const step = STEPS.find(s => s.id === r.id);
        return '<tr>' +
          '<td>' + step.icon + ' ' + step.title + '</td>' +
          '<td><code>Chromium ' + r.chromiumAxis + '</code></td>' +
          '<td>→</td>' +
          '<td><code>AC AXLE=' + r.acAxis + '</code></td>' +
        '</tr>';
      }).join('');

    elements.content.innerHTML =
      '<div class="wheel-calib-step">' +
        '<div class="wheel-calib-icon">✅</div>' +
        '<h3>Calibration réussie !</h3>' +
        '<p>Profil enregistré pour <code>' + state.device.vendor + ':' + state.device.product + '</code></p>' +
        '<table class="wheel-calib-summary">' + rows + '</table>' +
      '</div>';
    elements.footer.innerHTML =
      '<button class="filter-btn ini-btn-save" id="wheel-calib-finish">✓ Terminer</button>';
    document.getElementById('wheel-calib-finish').addEventListener('click', close);
  }

  // ---------------------------------------------------------------------------
  function renderError(message) {
    stopLive();
    elements.content.innerHTML =
      '<div class="wheel-calib-step">' +
        '<div class="wheel-calib-icon">⚠️</div>' +
        '<h3>Oups</h3><p>' + message + '</p>' +
      '</div>';
    elements.footer.innerHTML =
      '<button class="filter-btn" id="wheel-calib-retry">↶ Réessayer</button>' +
      '<button class="filter-btn" id="wheel-calib-close-err">Fermer</button>';
    document.getElementById('wheel-calib-retry').addEventListener('click', () => start());
    document.getElementById('wheel-calib-close-err').addEventListener('click', close);
  }

  // ---------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------
  async function start() {
    if (!elements) cacheElements();
    if (!elements.modal) return;

    state = {
      device: null, controls: null,
      currentStep: 0, subStep: 'move',
      results: [], baselineAxes: [],
      detectedAxis: null, detectedValue: null,
    };
    elements.modal.classList.add('visible');
    renderWelcome();

    try {
      state.controls = await loadControlsData();
    } catch (e) {
      renderError(e.message); return;
    }

    try {
      state.device = await detectDevice();
    } catch (e) {
      renderError(e.message); return;
    }
    if (!state) return;

    renderRestScreen();
  }

  function close() {
    stopLive();
    if (global.GamepadCapture && global.GamepadCapture.isCapturing()) {
      global.GamepadCapture.stop();
    }
    if (elements && elements.modal) elements.modal.classList.remove('visible');
    state = null;
  }

  function init() {
    cacheElements();
    if (!elements || !elements.modal) return;
    elements.close.addEventListener('click', close);
    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.modal.classList.contains('visible')) close();
    });
  }

  global.WheelCalibration = { init, start, close };
})(window);