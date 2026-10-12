// public/src/setupWizard.js
// Assistant d'installation (partie 1 : détection + identité + récap).
// Parties 2 (graphismes / CSP-Pure) et 3 (contrôles) arriveront en v1.3.1.

(function (global) {
  'use strict';

  const STEPS = ['welcome', 'detection', 'identity', 'recap'];
  let currentStep = 0;
  let detectionData = null;
  let formData = {
    playerName: '',
    onlineName: '',
    steamId: '',
    nationality: 'France',
    nationCode: 'FRA',
  };
  let onFinishCallback = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function t(key, fallback) {
    if (global.I18n) {
      const v = global.I18n.t('app.setup.' + key, null);
      if (v && v !== 'app.setup.' + key) return v;
    }
    return fallback != null ? fallback : key;
  }

  function getModal() { return document.getElementById('setup-wizard-modal'); }
  function getBody()  { return document.getElementById('setup-wizard-body'); }
  function getFooter(){ return document.getElementById('setup-wizard-footer'); }
  function getSteps() { return document.getElementById('setup-wizard-steps'); }

  // ---------------------------------------------------------------------------
  // Barre de progression
  // ---------------------------------------------------------------------------
  const STEP_LABELS = {
    welcome:   { num: 1, label: () => t('steps.welcome', 'Bienvenue') },
    detection: { num: 2, label: () => t('steps.detection', 'Détection') },
    identity:  { num: 3, label: () => t('steps.identity', 'Identité') },
    recap:     { num: 4, label: () => t('steps.recap', 'Récap') },
  };

  function renderStepsBar() {
    const wrap = getSteps();
    if (!wrap) return;
    wrap.innerHTML = '';
    const currentId = STEPS[currentStep];

    STEPS.forEach((id, idx) => {
      if (idx > 0) wrap.appendChild(el('div', { class: 'setup-wizard-step-sep' }));
      const meta = STEP_LABELS[id];
      const dot = el('div', { class: 'setup-wizard-step-dot' });
      if (id === currentId) dot.classList.add('active');
      else if (idx < currentStep) dot.classList.add('done');
      dot.appendChild(el('span', { class: 'num', text: idx < currentStep ? '✓' : String(meta.num) }));
      dot.appendChild(el('span', { text: meta.label() }));
      wrap.appendChild(dot);
    });
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function goTo(stepIndex) {
    currentStep = Math.max(0, Math.min(STEPS.length - 1, stepIndex));
    renderStepsBar();
    const id = STEPS[currentStep];
    if (id === 'welcome')        renderWelcome();
    else if (id === 'detection') renderDetection();
    else if (id === 'identity')  renderIdentity();
    else if (id === 'recap')     renderRecap();
  }

  // ---------------------------------------------------------------------------
  // Footer helpers
  // ---------------------------------------------------------------------------
  function setFooter(buttons) {
    const f = getFooter();
    if (!f) return;
    f.innerHTML = '';
    buttons.forEach(b => {
      if (b === 'spacer') {
        f.appendChild(el('div', { class: 'spacer' }));
        return;
      }
      const btn = el('button', {
        type: 'button',
        class: 'filter-btn ' + (b.variant === 'primary' ? 'ini-btn-save' : ''),
        text: b.label,
      });
      if (b.variant === 'primary') {
        btn.style.padding = '10px 22px';
        btn.style.background = 'var(--accent)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--accent)';
      }
      btn.addEventListener('click', b.onClick);
      if (b.disabled) btn.disabled = true;
      f.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------------------
  // Étape 1 : Welcome
  // ---------------------------------------------------------------------------
  function renderWelcome() {
    const body = getBody();
    body.innerHTML = '';

    const hero = el('div', { class: 'setup-wizard-hero' });
    const logo = el('img', { src: 'assets/logo.png', class: 'setup-wizard-hero-logo', alt: '' });
    logo.onerror = () => { logo.style.display = 'none'; };
    hero.appendChild(logo);
    hero.appendChild(el('h2', { text: t('welcome.title', 'Bienvenue dans QACRL !') }));
    hero.appendChild(el('p', { html: t('welcome.desc',
      'En 3 étapes rapides, on va configurer ton launcher :<br>' +
      '• Détecter automatiquement ton installation AC<br>' +
      '• Renseigner ton identité de pilote<br>' +
      '• Valider que tout est prêt pour lancer une course'
    )}));
    body.appendChild(hero);

    setFooter([
      { label: t('welcome.skip', '⏭ Passer (je connais)'), onClick: () => finish(true) },
      'spacer',
      { label: t('welcome.start', '▶ Démarrer l\'assistant'), variant: 'primary', onClick: () => goTo(1) },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Étape 2 : Détection
  // ---------------------------------------------------------------------------
  async function renderDetection() {
    const body = getBody();
    body.innerHTML = '';

    if (!detectionData) {
      const scanBox = el('div', { class: 'setup-wizard-scanning' });
      scanBox.appendChild(el('div', { class: 'spinner' }));
      scanBox.appendChild(el('div', { text: t('detection.scanning', '🔍 Analyse de ton installation…') }));
      scanBox.appendChild(el('div', {
        style: 'font-size:0.8rem;color:var(--text-tertiary);max-width:360px;',
        text: t('detection.scanningHint', 'Détection du chemin AC, du SteamID, de CSP, Pure et de tes contenus.'),
      }));
      body.appendChild(scanBox);

      setFooter([
        { label: t('common.cancel', 'Annuler'), onClick: () => finish(true) },
      ]);

      try {
        detectionData = await window.api.detectSetupStatus();
      } catch (e) {
        console.error('[SetupWizard] detection KO', e);
        detectionData = {};
      }
      return renderDetection();
    }

    body.appendChild(el('div', { class: 'setup-wizard-title', text: t('detection.title', 'Résultats de la détection') }));
    body.appendChild(el('p', { class: 'setup-wizard-subtitle', text: t('detection.subtitle', 'Vérifie que tout est bien détecté. Tu peux corriger manuellement si besoin.') }));

    const list = el('div', { class: 'setup-wizard-detect-list' });
    const d = detectionData;

    // AC path
    const acOK = !!d.acPath;
    list.appendChild(makeDetectRow(
      acOK ? '✅' : '❌',
      t('detection.acPath', 'Chemin Assetto Corsa'),
      d.acPath || t('detection.notFound', 'Non détecté'),
      acOK ? null : { label: t('detection.selectManually', 'Choisir…'), onClick: async () => {
        const sel = await window.api.selectAcFolder();
        if (sel) { detectionData.acPath = sel; detectionData.acPathSource = 'manual'; renderDetection(); }
      }}
    ));

    // Documents
    list.appendChild(makeDetectRow(
      d.documentsPath ? '✅' : '⚠️',
      t('detection.documents', 'Dossier Documents'),
      d.documentsPath || t('detection.notFound', 'Non détecté'),
      d.documentsPath ? null : { label: t('detection.selectManually', 'Choisir…'), onClick: async () => {
        const sel = await window.api.selectDocumentsFolder();
        if (sel) { detectionData.documentsPath = sel; detectionData.documentsSource = 'manual'; renderDetection(); }
      }}
    ));

    // SteamID
    list.appendChild(makeDetectRow(
      d.steamId ? '✅' : '⚠️',
      t('detection.steamId', 'SteamID (GUID)'),
      d.steamId || t('detection.notFound', 'Non détecté'),
      null
    ));

    // CSP
    list.appendChild(makeDetectRow(
      d.csp && d.csp.installed ? '✅' : '⚠️',
      t('detection.csp', 'Custom Shaders Patch'),
      d.csp && d.csp.installed ? (d.csp.version || t('detection.detected', 'Détecté')) : t('detection.notInstalled', 'Non installé'),
      null
    ));

    // Pure
    list.appendChild(makeDetectRow(
      d.pure && d.pure.installed ? '✅' : '⚠️',
      t('detection.pure', 'Pure (Weather FX)'),
      d.pure && d.pure.installed ? t('detection.detected', 'Détecté') : t('detection.notInstalled', 'Non installé'),
      null
    ));

    // 7-Zip
    list.appendChild(makeDetectRow(
      d.sevenZip && d.sevenZip.installed ? '✅' : '⚠️',
      t('detection.sevenZip', '7-Zip (extraction mods)'),
      d.sevenZip && d.sevenZip.installed ? d.sevenZip.path : t('detection.notInstalled', 'Non installé'),
      null
    ));

    // Contenu
    list.appendChild(makeDetectRow(
      '📦',
      t('detection.content', 'Contenu'),
      (d.content ? d.content.cars : 0) + ' voitures, ' + (d.content ? d.content.tracks : 0) + ' circuits',
      null
    ));

    body.appendChild(list);

    setFooter([
      { label: t('common.back', '← Retour'), onClick: () => goTo(0) },
      'spacer',
      { label: t('detection.retry', '↻ Relancer le scan'), onClick: () => { detectionData = null; renderDetection(); } },
      { label: t('common.next', 'Suivant →'), variant: 'primary', disabled: !d.acPath, onClick: () => goTo(2) },
    ]);
  }

  function makeDetectRow(status, label, value, fixAction) {
    const row = el('div', { class: 'setup-wizard-detect-row' });
    row.appendChild(el('div', { class: 'status', text: status }));
    const info = el('div', { class: 'info' });
    info.appendChild(el('div', { class: 'label', text: label }));
    info.appendChild(el('div', { class: 'value', text: value }));
    row.appendChild(info);
    if (fixAction) {
      const btn = el('button', { type: 'button', class: 'fix-btn', text: fixAction.label });
      btn.addEventListener('click', fixAction.onClick);
      row.appendChild(btn);
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // Étape 3 : Identité
  // ---------------------------------------------------------------------------
  async function renderIdentity() {
    const body = getBody();
    body.innerHTML = '';

    // Pré-remplit depuis settings + détection
    let settings = {};
    try { settings = await window.api.getSettings() || {}; } catch (e) {}
    const prevName = settings.playerName || '';
    const prevOnline = settings.onlineName || '';
    const prevSteam = settings.steamId || (detectionData && detectionData.steamId) || '';
    const prevNat = settings.nationality || 'France';

    formData.playerName   = formData.playerName   || prevName || 'Driver';
    formData.onlineName   = formData.onlineName   || prevOnline || '';
    formData.steamId      = formData.steamId      || prevSteam || '';
    formData.nationality  = formData.nationality  || prevNat;

    body.appendChild(el('div', { class: 'setup-wizard-title', text: t('identity.title', 'Identité du pilote') }));
    body.appendChild(el('p', { class: 'setup-wizard-subtitle', text: t('identity.subtitle', 'Ces informations servent en solo et en multijoueur. Tu pourras les modifier plus tard dans Paramètres.') }));

    const group = el('div', { class: 'group', style: 'gap:14px;' });

    // Nom solo
    group.appendChild(makeField(t('identity.playerName', 'Nom du pilote (solo)'),
      makeInput('text', formData.playerName, (v) => { formData.playerName = v; }),
      t('identity.playerNameHint', 'Utilisé en solo et comme nom par défaut.')));

    // Nom en ligne
    group.appendChild(makeField(t('identity.onlineName', 'Nom en ligne (multi)'),
      makeInput('text', formData.onlineName, (v) => { formData.onlineName = v; }, t('identity.onlineNamePlaceholder', '(utilise le nom solo par défaut)')),
      t('identity.onlineNameHint', 'Doit être unique sur le serveur.')));

    // SteamID
    group.appendChild(makeField(t('identity.steamId', 'Steam ID (GUID)'),
      makeInput('text', formData.steamId, (v) => { formData.steamId = v; }, '76561198XXXXXXXXX'),
      t('identity.steamIdHint', 'Détecté automatiquement depuis Steam.')));

    // Nationalité (chargée via IPC)
    const flagSelect = document.createElement('select');
    flagSelect.className = 'ini-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '⏳ ' + t('common.loading', 'Chargement…');
    flagSelect.appendChild(placeholder);

    const wantedNat = (formData.nationality || 'France').toLowerCase();

    (async () => {
      try {
        const assets = await window.api.scanAssets();
        const flags = (assets.flags || [])
          .filter(f => !f.toLowerCase().startsWith('blank'))
          .sort((a, b) => a.localeCompare(b, 'fr'));
        flagSelect.innerHTML = '';
        if (flags.length === 0) {
          const o = document.createElement('option');
          o.value = '';
          o.textContent = '⚠️ ' + t('common.noFlags', 'Aucun drapeau trouvé');
          flagSelect.appendChild(o);
          return;
        }
        for (const f of flags) {
          const name = flagFileToCountryName(f).replace(/_/g, ' ');
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = name;
          if (name.toLowerCase() === wantedNat) opt.selected = true;
          flagSelect.appendChild(opt);
        }
      } catch (e) {
        console.warn('[SetupWizard] load flags KO', e);
      }
    })();

    flagSelect.addEventListener('change', (e) => {
      const f = e.target.value;
      if (!f) return;
      formData.nationality = flagFileToCountryName(f).replace(/_/g, ' ');
      formData.nationCode = formData.nationality.substring(0, 3).toUpperCase();
    });
    group.appendChild(makeField(t('identity.nationality', 'Nationalité du pilote'), flagSelect, ''));

    body.appendChild(group);

    setFooter([
      { label: t('common.back', '← Retour'), onClick: () => goTo(1) },
      'spacer',
      { label: t('common.next', 'Suivant →'), variant: 'primary', onClick: () => goTo(3) },
    ]);
  }

  function makeField(label, control, hint) {
    const wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', { text: label }));
    wrap.appendChild(control);
    if (hint) wrap.appendChild(el('div', {
      style: 'font-size:0.72rem;color:var(--text-tertiary);margin-top:4px;line-height:1.4;',
      text: hint,
    }));
    return wrap;
  }

  function makeInput(type, value, onChange, placeholder) {
    const inp = document.createElement('input');
    inp.type = type;
    inp.value = value || '';
    inp.placeholder = placeholder || '';
    inp.addEventListener('input', (e) => onChange(e.target.value));
    return inp;
  }

  // ---------------------------------------------------------------------------
  // Étape 4 : Récap
  // ---------------------------------------------------------------------------
  function renderRecap() {
    const body = getBody();
    body.innerHTML = '';

    body.appendChild(el('div', { class: 'setup-wizard-title', text: t('recap.title', 'Tout est prêt ! 🎉') }));
    body.appendChild(el('p', { class: 'setup-wizard-subtitle', text: t('recap.subtitle', 'Voici un résumé de ta configuration. Tu pourras modifier tout ça à tout moment dans Paramètres.') }));

    const d = detectionData || {};
    const recap = el('div', { class: 'setup-wizard-recap' });

    recap.appendChild(makeRecapRow(t('recap.acPath', 'Assetto Corsa'), d.acPath || '—'));
    recap.appendChild(makeRecapRow(t('recap.documents', 'Documents'), d.documentsPath || '—'));
    recap.appendChild(makeRecapRow(t('recap.playerName', 'Pilote (solo)'), formData.playerName || '—'));
    recap.appendChild(makeRecapRow(t('recap.onlineName', 'Pilote (online)'), formData.onlineName || formData.playerName || '—'));
    recap.appendChild(makeRecapRow(t('recap.nationality', 'Nationalité'), formData.nationality || '—'));
    recap.appendChild(makeRecapRow(t('recap.steamId', 'Steam ID'), formData.steamId || t('recap.missing', '⚠️ non renseigné')));
    recap.appendChild(makeRecapRow(t('recap.content', 'Contenu'),
      (d.content ? d.content.cars : 0) + ' voitures • ' + (d.content ? d.content.tracks : 0) + ' circuits'));
    recap.appendChild(makeRecapRow('CSP / Pure',
      (d.csp && d.csp.installed ? '✅ CSP' : '⚠️ sans CSP') + ' • ' + (d.pure && d.pure.installed ? '✅ Pure' : '⚠️ sans Pure')));

    body.appendChild(recap);

    setFooter([
      { label: t('common.back', '← Retour'), onClick: () => goTo(2) },
      'spacer',
      { label: t('recap.finish', '✓ Terminer'), variant: 'primary', onClick: () => finish(false) },
    ]);
  }

  function makeRecapRow(k, v) {
    const row = el('div', { class: 'setup-wizard-recap-row' });
    row.appendChild(el('span', { class: 'k', text: k }));
    row.appendChild(el('span', { class: 'v', text: v, title: v }));
    return row;
  }

  // ---------------------------------------------------------------------------
  // Finish
  // ---------------------------------------------------------------------------
  async function finish(skipped) {
    try {
      const settings = await window.api.getSettings() || {};

      if (!skipped && detectionData) {
        if (detectionData.acPath) settings.acPath = detectionData.acPath;
        if (detectionData.documentsPath) settings.documentsPath = detectionData.documentsPath;
        settings.playerName = formData.playerName || 'Driver';
        if (formData.onlineName) settings.onlineName = formData.onlineName;
        if (formData.steamId) settings.steamId = formData.steamId;
        if (formData.nationality) settings.nationality = formData.nationality;
        if (formData.nationCode) settings.nationCode = formData.nationCode;
      }

      settings.setupCompleted = true;
      settings.setupCompletedAt = Date.now();
      await window.api.saveSettings(settings);
    } catch (e) {
      console.warn('[SetupWizard] save KO', e);
    }

    close();
    if (typeof onFinishCallback === 'function') {
      try { onFinishCallback(skipped); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Open / Close
  // ---------------------------------------------------------------------------
  function open(callback) {
    onFinishCallback = callback || null;
    currentStep = 0;
    detectionData = null;
    formData = { playerName: '', onlineName: '', steamId: '', nationality: 'France', nationCode: 'FRA' };

    const modal = getModal();
    if (!modal) return;
    modal.style.display = 'flex';
    goTo(0);
  }

  function close() {
    const modal = getModal();
    if (modal) modal.style.display = 'none';
  }

  function init() {
    const closeBtn = document.getElementById('setup-wizard-close');
    if (closeBtn) closeBtn.addEventListener('click', () => finish(true));

    // Bouton "Relancer l'assistant" dans Paramètres
    const relaunch = document.getElementById('btn-relaunch-setup');
    if (relaunch) relaunch.addEventListener('click', () => open(null));
  }

  global.SetupWizard = { init, open, close };
})(window);