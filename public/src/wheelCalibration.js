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
    let raw = null;

    try {
      const res = await window.api.readIniFile('controls.ini');
      if (res && res.success && typeof res.content === 'string' && res.content.trim()) {
        raw = res.content;
      }
    } catch (e) { /* on tombera sur le fallback */ }

    // ⭐ Install vierge : controls.ini n'existe pas encore → structure par défaut
    if (raw == null) {
      console.log('[Wizard] controls.ini absent → création d\'une structure par défaut');
      raw = [
        '[HEADER]',
        'INPUT_METHOD=WHEEL',
        '',
        '[CONTROLLERS]',
        '',
        '[STEER]',
        'JOY=-1',
        'AXLE=-1',
        'MIN=-1',
        'MAX=1',
        'LOCK=900',
        'FF_GAIN=1',
        '',
        '[THROTTLE]',
        'JOY=-1',
        'AXLE=-1',
        'MIN=-1',
        'MAX=1',
        'GAMMA=1',
        '',
        '[BRAKES]',
        'JOY=-1',
        'AXLE=-1',
        'MIN=-1',
        'MAX=1',
        'GAMMA=2.4',
        '',
        '[CLUTCH]',
        'JOY=-1',
        'AXLE=-1',
        'MIN=-1',
        'MAX=1',
        'GAMMA=1',
        '',
        '[HANDBRAKE]',
        'JOY=-1',
        'AXLE=-1',
        'MIN=-1',
        'MAX=1',
        'GAMMA=1',
        '',
      ].join('\n');
    }

    const sections = global.IniParser.parseIni(raw);
    return { sections, raw };
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
  // Trouve une étape par nom de section (STEER, THROTTLE, ...)
  // ---------------------------------------------------------------------------
  function getStepBySection(section) {
    return STEPS.find(s => s.section === section) || null;
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
  function renderWelcome(singleStep) {
    const isSingle = singleStep && typeof singleStep === 'object';
    const title = isSingle
      ? 'Reconfiguration : ' + singleStep.title
      : 'Calibration du volant';
    const icon  = isSingle ? singleStep.icon : '🎯';
    const intro = isSingle
      ? 'Ce guide va redétecter uniquement l\'axe <strong>' + singleStep.title.toLowerCase() + '</strong>.'
      : 'Ce guide va détecter la correspondance entre ton volant et Assetto Corsa.';

    elements.content.innerHTML =
      '<div class="wheel-calib-step">' +
        '<div class="wheel-calib-icon">' + icon + '</div>' +
        '<h3>' + title + '</h3>' +
        '<p>' + intro + '</p>' +
        '<p class="wheel-calib-hint">Pour commencer, <strong>bouge un peu le volant</strong> ou <strong>appuie sur une pédale</strong>.</p>' +
        '<div class="wheel-calib-loading">⏳ En attente d\'un mouvement…</div>' +
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
    const step = state.steps[state.currentStep];
    const isMove = state.subStep === 'move';
    const isSteer = step.section === 'STEER';

    elements.content.innerHTML = '';
    const box = el('div', { class: 'wheel-calib-step' });
    const progressText = state.isSingleStep
      ? 'Reconfiguration'
      : 'Étape ' + (state.currentStep + 1) + ' / ' + state.steps.length;
    box.appendChild(el('div', { class: 'wheel-calib-progress', text: progressText }));
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

    // ⭐ Capture les valeurs brutes pour calculer la polarité (MIN/MAX)
    const step = state.steps[state.currentStep];
    const acAxis = readAxle(state.controls.sections, step.section);
    const restVal = state.baselineAxes[state.detectedAxis];         // valeur AU REPOS
    const pressedVal = (state.detectedValue != null)                // valeur QUAND BOUGÉ À FOND
      ? state.detectedValue
      : restVal;

    state.results.push({
      id: step.id,
      chromiumAxis: state.detectedAxis,
      acAxis: acAxis,
      restVal: restVal,
      pressedVal: pressedVal,
    });

    console.log('[Wizard] ' + step.section + ' : rest=' + restVal.toFixed(2) +
                ' pressed=' + pressedVal.toFixed(2) +
                ' → polarité ' + (restVal < pressedVal ? 'normale' : 'INVERSÉE'));

    // Étape suivante
    state.currentStep++;
    state.subStep = 'move';
    state.detectedAxis = null;
    state.detectedValue = null;

    if (state.currentStep >= state.steps.length) {
      finalizeAndSummary();
    } else {
      runCurrentStep();
    }
  }

  function runCurrentStep() {
    if (!state) return;

    // ⭐ Vérif en PREMIER : si on a fini toutes les étapes, on saute au résumé
    if (state.currentStep >= state.steps.length) {
      finalizeAndSummary();
      return;
    }

    const step = state.steps[state.currentStep];
    const acAxis = readAxle(state.controls.sections, step.section);

    // ⭐ Pas d'AXLE configuré → on continue quand même (sera assigné par défaut à la fin)
    if (acAxis === null) {
      console.log('[Wizard] ' + step.section + ' : AXLE vide, une valeur par défaut sera écrite à la fin');
    }

    renderStepScreen();
  }

  // ---------------------------------------------------------------------------
  // Résumé
  // ---------------------------------------------------------------------------
  // ⭐ Extrait le nom lisible d'un gamepad Chromium
  // "FANATEC Wheel (Vendor: 0eb7 Product: 0020)" → "FANATEC Wheel"
  function extractDeviceName(chromiumId) {
    if (!chromiumId) return '';
    return String(chromiumId).replace(/\s*\(Vendor:.*$/i, '').trim();
  }

  // ⭐ Génère un __IGUID déterministe (mais unique par index)
  // Format observé dans controls.ini : XXXX-NNNN-NNNN-800X-444553540000
  function makeIguid(index) {
    // Premier bloc : pseudo-aléatoire mais déterministe par index
    const a = ((0x5251B780 + index * 0x1A2B3C) >>> 0).toString(16).toUpperCase().padStart(8, '0');
    const b = '7DD1';
    const c = '11F1';
    const d = (0x8001 + index).toString(16).toUpperCase().padStart(4, '0');
    return a + '-' + b + '-' + c + '-' + d + '-444553540000';
  }

  // ⭐ Construit la liste des devices AC à partir des gamepads Chromium
  // Retourne [{ acIndex, name, iguid, pguid, chromiumIndex }]
  function buildAcControllersFromChromium() {
    const out = [];
    if (!global.GamepadMapper || !global.GamepadMapper.getChromiumGamepads) return out;
    const pads = global.GamepadMapper.getChromiumGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.vendor || !p.product) continue;
      out.push({
        acIndex: i,
        name: extractDeviceName(p.id) || ('Device ' + i),
        iguid: makeIguid(i),
        pguid: p.product.toUpperCase() + p.vendor.toUpperCase() + '-0000-0000-0000-504944564944',
        chromiumIndex: p.chromiumIndex,
        vendor: p.vendor,
        product: p.product,
      });
    }
    return out;
  }

  async function finalizeAndSummary() {
    stopLive();

    // ⭐ Valeurs AC par défaut par section (convention AC / Content Manager)
    const DEFAULT_AC_AXIS = {
      'STEER':     0,
      'THROTTLE':  1,
      'BRAKES':    2,
      'CLUTCH':    6,
      'HANDBRAKE': 5,
    };

    // ⭐ On (re)construit la liste des devices AC à partir des gamepads Chromium.
    //    C'est ce qui manquait : [CONTROLLERS] doit être rempli AVANT d'écrire JOY=n.
    const acControllers = buildAcControllersFromChromium();
    console.log('[Wizard] Devices AC reconstruits :',
      acControllers.map(c => c.acIndex + '=' + c.name + '(' + c.vendor + ':' + c.product + ')').join(', ') || '(aucun)');

    // ⭐ Trouve l'index AC du device qui a été détecté par le wizard
    let acJoy = 0;
    if (state.device && state.device.vendor && state.device.product) {
      const match = acControllers.find(c =>
        c.vendor === state.device.vendor && c.product === state.device.product
      );
      if (match) acJoy = match.acIndex;
      else console.warn('[Wizard] device détecté introuvable dans la liste Chromium');
    }
    console.log('[Wizard] JOY (AC) =', acJoy, '| device =', state.device.vendor + ':' + state.device.product);

    const axes = {};
    const updates = [];

    for (const r of state.results) {
      if (r.chromiumAxis == null) continue;
      const step = state.steps.find(s => s.id === r.id);
      if (!step) continue;

      // ⭐ AXLE=-1 = "non assigné" → on utilise la valeur par défaut
      const isAssigned = (r.acAxis != null && r.acAxis >= 0);
      const targetAcAxis = isAssigned
        ? r.acAxis
        : (DEFAULT_AC_AXIS[step.section] !== undefined
            ? DEFAULT_AC_AXIS[step.section]
            : r.chromiumAxis);

      axes[String(r.chromiumAxis)] = targetAcAxis;
      updates.push({
        section: step.section,
        axle: targetAcAxis,
        restVal: r.restVal,
        pressedVal: r.pressedVal,
      });
    }

    // 1) Sauvegarde du profil appris (pour la preview live dans les widgets)
    if (Object.keys(axes).length > 0) {
      try {
        await window.api.saveWheelProfile(state.device.vendor, state.device.product, {
          axes, source: 'wizard',
        });
        if (global.GamepadMapper.refreshLearnedProfiles) {
          await global.GamepadMapper.refreshLearnedProfiles();
        }
      } catch (e) {
        console.warn('[Wizard] saveWheelProfile KO :', e.message);
      }
    }

    // 2) ⭐ ÉCRITURE dans controls.ini :
    //    a) [CONTROLLERS] rempli avec les devices détectés
    //    b) JOY/AXLE/MIN/MAX dans chaque section cible
    try {
      // ⭐ Lit le fichier s'il existe, sinon utilise la structure par défaut
      //    construite par loadControlsData() (state.controls.raw)
      let baseContent = null;
      try {
        const res = await window.api.readIniFile('controls.ini');
        if (res && res.success && typeof res.content === 'string' && res.content.trim()) {
          baseContent = res.content;
        }
      } catch (e) { /* ignore, on tombe sur le fallback */ }

      if (!baseContent) {
        baseContent = state.controls.raw;
        console.log('[Wizard] controls.ini absent → utilisation de la structure par défaut');
      }

      {
        const sections = global.IniParser.parseIni(baseContent);

        // --- 2.a) Réécrit [CONTROLLERS] en entier
        if (acControllers.length > 0) {
          let ctrlSec = sections.find(s => s.name === 'CONTROLLERS');
          if (!ctrlSec) {
            ctrlSec = { name: 'CONTROLLERS', entries: [] };
            sections.push(ctrlSec);
          }
          // On vide les entrées existantes et on réécrit tout proprement
          ctrlSec.entries = [];
          for (const c of acControllers) {
            ctrlSec.entries.push({ kind: 'kv', key: 'CON' + c.acIndex,  value: c.name,  comment: '' });
            ctrlSec.entries.push({ kind: 'kv', key: '__IGUID' + c.acIndex, value: c.iguid, comment: '' });
            ctrlSec.entries.push({ kind: 'kv', key: 'PGUID' + c.acIndex,  value: c.pguid, comment: '' });
          }
          console.log('[Wizard] [CONTROLLERS] réécrit avec ' + acControllers.length + ' device(s)');
        }

        // --- 2.a-bis) INPUT_METHOD=WHEEL dans [HEADER] (si un volant/pad est utilisé)
        if (state.device) {
          let headSec = sections.find(s => s.name === 'HEADER');
          if (!headSec) {
            headSec = { name: 'HEADER', entries: [] };
            sections.unshift(headSec);
          }
          let imEntry = headSec.entries.find(x => x.kind === 'kv' && x.key === 'INPUT_METHOD');
          if (imEntry) imEntry.value = 'WHEEL';
          else headSec.entries.push({ kind: 'kv', key: 'INPUT_METHOD', value: 'WHEEL', comment: '' });
          console.log('[Wizard] [HEADER] INPUT_METHOD = WHEEL');
        }

        // --- 2.b) Écrit JOY/AXLE/MIN/MAX dans les sections cibles
        for (const u of updates) {
          const sec = sections.find(s => s.name === u.section);
          if (!sec) continue;

          const setKV = (key, val) => {
            const e = sec.entries.find(x => x.kind === 'kv' && x.key === key);
            if (e) e.value = val;
            else sec.entries.push({ kind: 'kv', key, value: val, comment: '' });
          };

          setKV('JOY',  String(acJoy));
          setKV('AXLE', String(u.axle));

          // ⭐ Calcul MIN/MAX (convention AC) :
          //    - MIN = valeur brute de l'axe AU REPOS
          //    - MAX = valeur brute de l'axe À FOND
          //    Peu importe que MIN > MAX numériquement : AC interprète
          //    toujours MIN comme 0% et MAX comme 100%.
          //    - STEER : symétrique, on garde -1 / +1
          let minVal = '-1';
          let maxVal = '1';

          if (u.section !== 'STEER' && u.restVal != null && u.pressedVal != null) {
            const r = parseFloat(u.restVal.toFixed(2));
            const p = parseFloat(u.pressedVal.toFixed(2));
            const span = Math.abs(p - r);

            if (span < 0.3) {
              // L'axe n'a pas assez bougé → valeurs par défaut
              console.warn('[Wizard] ' + u.section +
                ' : amplitude trop faible (' + span.toFixed(2) + '), MIN/MAX par défaut');
              minVal = '-1';
              maxVal = '1';
            } else {
              // ⭐ Toujours : MIN = repos, MAX = à fond
              minVal = String(r);
              maxVal = String(p);
              console.log('[Wizard] ' + u.section +
                ' : MIN=' + minVal + ' MAX=' + maxVal +
                (r > p ? ' (inversé — normal pour ce type d\'axe)' : ' (normal)'));
            }
          }
          setKV('MIN', minVal);
          setKV('MAX', maxVal);
        }

        const newContent = global.IniParser.serializeIni(sections);
        await window.api.writeIniFile('controls.ini', newContent);
        console.log('[Wizard] controls.ini mis à jour (' + updates.length + ' section(s), JOY=' + acJoy + ')');

        // ⭐ Force le rechargement de l'éditeur INI pour que l'UI affiche les nouvelles valeurs
        if (global.SettingsIni && typeof global.SettingsIni.reloadByName === 'function') {
          try {
            await global.SettingsIni.reloadByName('controls.ini');
            console.log('[Wizard] Éditeur controls.ini rechargé');
          } catch (e) {
            console.warn('[Wizard] reloadByName KO :', e.message);
          }
        }
      }
    } catch (e) {
      console.warn('[Wizard] écriture controls.ini KO :', e.message);
    }

    const rows = state.results
      .filter(r => r.chromiumAxis != null)
      .map(r => {
        const step = state.steps.find(s => s.id === r.id);
        return '<tr>' +
          '<td>' + step.icon + ' ' + step.title + '</td>' +
          '<td><code>Chromium ' + r.chromiumAxis + '</code></td>' +
          '<td>→</td>' +
          '<td><code>AC AXLE=' + r.acAxis + '</code></td>' +
        '</tr>';
      }).join('');

    const finalTitle = state.isSingleStep
      ? 'Reconfiguration réussie !'
      : 'Calibration réussie !';
    const finalSub = state.isSingleStep
      ? 'Axe mis à jour dans <code>controls.ini</code> pour <code>' + state.device.vendor + ':' + state.device.product + '</code>'
      : 'Profil enregistré dans <code>controls.ini</code> pour <code>' + state.device.vendor + ':' + state.device.product + '</code>';

    elements.content.innerHTML =
      '<div class="wheel-calib-step">' +
        '<div class="wheel-calib-icon">✅</div>' +
        '<h3>' + finalTitle + '</h3>' +
        '<p>' + finalSub + '</p>' +
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
      steps: STEPS.slice(),
      isSingleStep: false,
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
    // ⭐ Prévient les modules qui attendent la fermeture (ex : setup wizard)
    try {
      window.dispatchEvent(new CustomEvent('qacrl:wheelcalib-closed'));
    } catch (e) { /* ignore */ }
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

  // ---------------------------------------------------------------------------
  // Lance une mini-calibration pour UNE SEULE étape (ex: 'STEER')
  // ---------------------------------------------------------------------------
  async function startSingleStep(sectionName) {
    const step = getStepBySection(sectionName);
    if (!step) {
      alert('Impossible de trouver l\'étape pour la section "' + sectionName + '".');
      return;
    }

    if (!elements) cacheElements();
    if (!elements.modal) return;

    state = {
      device: null, controls: null,
      currentStep: 0, subStep: 'move',
      results: [], baselineAxes: [],
      detectedAxis: null, detectedValue: null,
      steps: [step],                 // ⭐ uniquement cette étape
      isSingleStep: true,
    };
    elements.modal.classList.add('visible');
    renderWelcome(step);

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

  global.WheelCalibration = { init, start, startSingleStep, close };
})(window);