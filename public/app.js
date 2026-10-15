/* ============================================================
   OVERLAY DE CHARGEMENT
   ============================================================ */
function showLoadingOverlay(title, subtitle) {
  const ov = document.getElementById('qacrl-loading-overlay');
  if (!ov) return;
  if (title) {
    const t = document.getElementById('qacrl-loading-title');
    if (t) t.textContent = title;
  }
  if (subtitle) {
    const s = document.getElementById('qacrl-loading-subtitle');
    if (s) s.textContent = subtitle;
  }
  ov.classList.add('visible');
}

function hideLoadingOverlay() {
  const ov = document.getElementById('qacrl-loading-overlay');
  if (!ov) return;
  ov.classList.remove('visible');
}

/* ============================================================
   MODALE MISE À JOUR
   ============================================================ */
function renderReleaseNotesMarkdown(md) {
  if (!md || typeof md !== 'string') return '';
  const esc = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const inlineFmt = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = esc.split(/\r?\n/);
  const out = [];
  let inList = false;

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = raw.trim();

    if (/^[-*•]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inlineFmt(line.replace(/^[-*•]\s+/, '')) + '</li>');
      continue;
    }

    closeList();

    if (!line) continue;

    if (/^###\s+/.test(line))      out.push('<h3>' + inlineFmt(line.replace(/^###\s+/, '')) + '</h3>');
    else if (/^##\s+/.test(line))  out.push('<h2>' + inlineFmt(line.replace(/^##\s+/, '')) + '</h2>');
    else if (/^#\s+/.test(line))   out.push('<h1>' + inlineFmt(line.replace(/^#\s+/, '')) + '</h1>');
    else if (/^---+$/.test(line))  out.push('<hr>');
    else                           out.push('<p>' + inlineFmt(line) + '</p>');
  }

  closeList();
  return out.join('\n');
}

function openUpdateModal(updateInfo) {
  const modal = document.getElementById('update-modal');
  if (!modal || !updateInfo) return;

  const elNew = document.getElementById('update-new-version');
  const elCur = document.getElementById('update-current-version');
  const elDate = document.getElementById('update-published-at');
  const elDateRow = document.getElementById('update-date-row');
  const elNotes = document.getElementById('update-notes-body');
  const notesWrap = document.querySelector('.update-notes-wrap');

  if (elNew) elNew.textContent = 'v' + updateInfo.remoteVersion;
  if (elCur) elCur.textContent = 'v' + updateInfo.localVersion;

  if (updateInfo.publishedAt && elDate && elDateRow) {
    try {
      const d = new Date(updateInfo.publishedAt);
      elDate.textContent = d.toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      elDateRow.style.display = '';
    } catch (e) { elDateRow.style.display = 'none'; }
  }

  if (elNotes) {
    elNotes.innerHTML = renderReleaseNotesMarkdown(updateInfo.releaseNotes)
      || '<p><em>' + ((window.I18n && window.I18n.tFr && window.I18n.tFr('Aucune note de version')) || 'Aucune note de version') + '</em></p>';
  }

  // État initial : déplié
  if (notesWrap) notesWrap.classList.remove('collapsed');

  // Stocke l'URL pour le bouton GitHub
  modal.dataset.releaseUrl = updateInfo.releaseUrl || '';

  modal.style.display = 'flex';
}

function closeUpdateModal() {
  const modal = document.getElementById('update-modal');
  if (modal) modal.style.display = 'none';
}

function setupUpdateModalHandlers() {
  const modal = document.getElementById('update-modal');
  if (!modal) return;

  document.getElementById('update-modal-close')?.addEventListener('click', closeUpdateModal);
  document.getElementById('update-modal-later')?.addEventListener('click', closeUpdateModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeUpdateModal();
  });

  document.getElementById('update-modal-github')?.addEventListener('click', async () => {
    const url = modal.dataset.releaseUrl;
    if (!url) return;
    try { await window.api.openExternal(url); } catch (e) {}
    closeUpdateModal();
  });

  // Toggle "Nouveautés"
  const toggle = document.getElementById('update-notes-toggle');
  const wrap = document.querySelector('.update-notes-wrap');
  if (toggle && wrap) {
    toggle.addEventListener('click', () => {
      wrap.classList.toggle('collapsed');
    });
  }
}

async function checkForUpdatesOnStartup() {
  try {
    const settings = await window.api.getSettings();
    if (settings && settings.checkUpdatesOnStartup === false) return;
  } catch (e) { /* on continue */ }

  try {
    const res = await window.api.checkForUpdates();
    if (res && res.success && res.hasUpdate) {
      openUpdateModal(res);
    } else if (res && res.success) {
      console.log('[update] à jour (v' + res.localVersion + ')');
    } else {
      console.warn('[update] check KO :', res && res.error);
    }
  } catch (e) {
    console.warn('[update] exception :', e.message);
  }
}

/* ============================================================
   ÉTAT GLOBAL
   ============================================================ */
let appData = {
  cars: [], tracks: [], weatherList: [], purePlans: [],
  // ⭐ Capacités détectées au démarrage (CSP / Pure)
  capabilities: { hasCSP: false, hasPure: false, hasPurePlanner: false, hasWeatherFx: false },
  acPath: '', manufacturers: [], flags: [], presets: [], modsHistory: [],
  sessionHistory: [],
  favorites: { cars: [], tracks: [] },
  used: { cars: {}, tracks: {} },
  customServers: [],
  favoriteServers: [],
  serverProfiles: {},
  serverPasswords: {},
  recentServers: [],
  serverPings: {},
  onlineServers: [],
  onlineServersPage: 0,
  onlineServersHasNext: true
};

let currentSelection = { car: null, skin: null, track: null, variant: null };
let carFilter = { type: 'all', search: '', manufacturer: '', tags: [] };
let trackFilter = { type: 'all', search: '', tags: [] };
let onlineFilter = {
  search: '',
  country: '',
  track: '',
  minPlayers: 0,
  favoritesOnly: false
};
let onlineSort = { by: 'players', dir: 'desc' };
let manualFilter = { favoritesOnly: false };
let recentFilter = { favoritesOnly: false };
let isInstallingMod = false;
let isLoadingServers = false;
let customPlanSteps = [];
let currentTagPopup = { kind: null, search: '' };

let serverJoinState = {
  server: null,
  info: null,
  occupancy: null,
  details: null,
  availableCars: [],
  selectedCar: null,
  availableSkins: [],
  selectedSkin: null,
  trackMissing: false,
  resolvedOnlineName: null,
  source: null,
  isRefreshing: false
};

/* ============================================================
   FAVORIS / DÉJÀ JOUÉS
   ============================================================ */
function isFavorite(kind, id) {
  const list = appData.favorites?.[kind] || [];
  return list.includes(id);
}

function toggleFavorite(kind, id) {
  if (!appData.favorites) appData.favorites = { cars: [], tracks: [] };
  if (!appData.favorites[kind]) appData.favorites[kind] = [];
  const list = appData.favorites[kind];
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(id);
  saveCurrentState();
}

function getUsedCount(kind, id) {
  const obj = appData.used?.[kind] || {};
  return obj[id] || 0;
}

function bumpUsedCount(kind, id) {
  if (!appData.used) appData.used = { cars: {}, tracks: {} };
  if (!appData.used[kind]) appData.used[kind] = {};
  appData.used[kind][id] = (appData.used[kind][id] || 0) + 1;
  saveCurrentState();
}

/* ============================================================
   FAVORIS SERVEURS
   ============================================================ */
function isFavoriteServer(server) {
  if (!server) return false;
  const key = `${server.ip}:${server.port}`;
  return (appData.favoriteServers || []).includes(key);
}

function toggleFavoriteServer(server) {
  if (!server) return;
  if (!Array.isArray(appData.favoriteServers)) appData.favoriteServers = [];
  const key = `${server.ip}:${server.port}`;
  const idx = appData.favoriteServers.indexOf(key);
  if (idx >= 0) appData.favoriteServers.splice(idx, 1);
  else appData.favoriteServers.push(key);
  saveCurrentState();

  // ⭐ Rafraîchit TOUTES les listes qui affichent une étoile
  renderOnlineServers();
  renderManualServers();
  renderRecentServers();
}

/* ============================================================
   NAV
   ============================================================ */
function switchTab(event, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
  else { const b = document.querySelector(`button[onclick*="${tabId}"]`); if (b) b.classList.add('active'); }
  const t = document.getElementById(tabId); if (t) t.classList.add('active');
}

function switchSubTab(event, subtabId) {
  const parent = event.currentTarget.closest('.tab-content');
  if (parent) {
    parent.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
  }
  event.currentTarget.classList.add('active');
  const t = document.getElementById(subtabId); if (t) t.classList.add('active');
}

  // Charge les traductions (fr par défaut) — non bloquant
  if (window.I18n && typeof window.I18n.load === 'function') {
    window.I18n.load('fr').catch((e) => console.warn('[i18n] KO', e));
  }

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoadingOverlay();

  populateTimePickers();
  setTimePickerFromString('12:00');
  setupThemePicker();
  setupEventListeners();
  setupDragAndDrop();

  // ⭐ Remplace les alert() natifs par des modales stylées
  if (window.QacrlDialogs && typeof window.QacrlDialogs.installGlobalOverrides === 'function') {
    window.QacrlDialogs.installGlobalOverrides();
  }

  // ⭐ Charge les traductions (fr par défaut) — non bloquant
  if (window.I18n && typeof window.I18n.load === 'function') {
    (async () => {
      try {
        const settings = await window.api.getSettings();
        const lang = (settings && settings.language) || 'fr';
        await window.I18n.load(lang);
        window.I18n.applyToDom();
        const sel = document.getElementById('language-select');
        if (sel) sel.value = lang;
      } catch (e) {
        console.warn('[i18n] KO au démarrage :', e.message);
      }
    })();
  }

  window.api.onInstallProgress(updateInstallProgress);
  if (window.api.onModsHistoryUpdated) {
    window.api.onModsHistoryUpdated(() => loadModsHistory());
  }
  if (window.api.onSessionHistoryUpdated) {
    window.api.onSessionHistoryUpdated(() => loadSessionHistory());
  }

  try {
    const settings = await window.api.getSettings();
    if (settings && settings.accentColor) applyAccentColor(settings.accentColor);
    if (settings && settings.themeMode) applyThemeMode(settings.themeMode);
    else applyThemeMode('dark');

    // ⭐ Toggle "Vérifier les MAJ au démarrage"
    const updCb = document.getElementById('check-updates-startup');
    if (updCb && settings && settings.checkUpdatesOnStartup === false) {
      updCb.checked = false;
    }
  } catch (e) {
    applyThemeMode('dark');
  }

  await scanAssets();

  // ⭐ Détecte CSP / Pure au démarrage
  try {
    appData.capabilities = await window.api.checkCspPure();
    console.log('[Capabilities]', appData.capabilities);
    // ⭐ Auto-configure style Weather FX + filtre PP selon ce qui est installé
    try { await window.api.autoConfigureWeather(); } catch (e) { console.warn('[AutoConfig] KO', e); }
  } catch (e) {
    console.warn('[Capabilities] KO', e);
  }

  await refreshAllContent();
  await refreshDocumentsPath();
  await loadPresets();
  await loadModsHistory();
  await loadSessionHistory();
  await loadSavedState();

  // ⭐ Le contenu principal est chargé → on peut cacher l'overlay
  hideLoadingOverlay();

  // ⭐ Vérification des mises à jour (non bloquant)
  setupUpdateModalHandlers();
  checkForUpdatesOnStartup();

  // ⭐ Guide d'installation CSP/Sol/Pure
  if (window.CspInstallGuide && typeof window.CspInstallGuide.init === 'function') {
    window.CspInstallGuide.init();
  }

  // Auto-détection du SteamID au premier lancement
  if (!getValue('steam-id')) {
    try {
      const res = await window.api.detectSteamId();
      if (res && res.success) {
        setValue('steam-id', res.steamId);
        await saveCurrentState();
        console.log('[Auto-detect] SteamID récupéré :', res.steamId, '(' + (res.source || 'inconnu') + ')');
      }
    } catch (e) {
      console.warn('[Auto-detect] Échec :', e.message);
    }
  }

  await loadPureCtrlSettings();

  // ⭐ Assistant d'installation (1er lancement uniquement)
  if (window.SetupWizard && typeof window.SetupWizard.init === 'function') {
    window.SetupWizard.init();
  }
  try {
    const s = await window.api.getSettings();
    if (!s || !s.setupCompleted) {
      window.SetupWizard.open(async () => {
        // Après l'assistant → recharger contenu + state
        await scanAssets();
        await refreshAllContent();
        await refreshDocumentsPath();
        await loadSavedState();
      });
    }
  } catch (e) { console.warn('[SetupWizard] init KO', e); }

  updateSessionUI();
  updateWeatherUI();
  renderWeatherSteps();
  renderExistingPlans();
  renderManualServers();
  renderRecentServers();
  renderOnlineServers();
  updateSortButtonsUI();

  // ⭐ Init des éditeurs INI (Paramètres > Contrôles/Vidéo/Audio)
  if (window.SettingsIni && typeof window.SettingsIni.init === 'function') {
    window.SettingsIni.init();
  }

  // ⭐ Init du sélecteur Weather FX
  if (window.WeatherFx && typeof window.WeatherFx.init === 'function') {
    window.WeatherFx.init();
  }

  // ⭐ Init des options caméra libre / orbite F5
  if (window.FreeCamera && typeof window.FreeCamera.init === 'function') {
    window.FreeCamera.init();
  }
  
  // ⭐ Init de l'onglet CSP
  if (window.SettingsCsp && typeof window.SettingsCsp.init === 'function') {
    window.SettingsCsp.init();
  }

  // ⭐ Init de la recherche globale dans Paramètres
  if (window.SettingsSearch && typeof window.SettingsSearch.init === 'function') {
    window.SettingsSearch.init();
  }

  // ⭐ Charge les profils volant appris (mapping Chromium → AC)
  if (window.GamepadMapper && typeof window.GamepadMapper.loadLearnedProfiles === 'function') {
    window.GamepadMapper.loadLearnedProfiles().then(() => {
      console.log('[app] Profils volant chargés');
    });
  }

  // ⭐ Init du wizard de calibration
  if (window.WheelCalibration && typeof window.WheelCalibration.init === 'function') {
    window.WheelCalibration.init();
  }

  // ⭐ v1.4.2 — Détection live des gamepads (Chromium/Electron)
  //    Sans ça, un device branché APRÈS le lancement n'est jamais vu
  //    (Chromium n'émet pas 'gamepadconnected' sans interaction).
    // ⭐ v1.4.2 — Détection changement gamepads (approche par set unique)
  //    Problèmes résolus :
  //    1) Chromium "réveille" un pad seulement quand on le bouge → un appui
  //       sur une pédale après la grâce était vu comme un nouveau device.
  //       → on compare un SET de "vendor:product" UNIQUES, pas les index.
  //    2) La modale ne réapparaissait pas au rallumage car le flag restait true.
  //       → on autorise une nouvelle alerte 30s après la dernière.
  //    3) Grâce de 30s au démarrage (au lieu de 8s) pour laisser Chromium
  //       "réveiller" tous les périphériques par un mouvement utilisateur.
  const _appStartTime = Date.now();
  const _appGracePeriodMs = 30000;   // 30s
  const _debounceMs = 3000;          // 3s : évite les rafales Windows
  let _gamepadDebounceTimer = null;
  let _gamepadLastKeys = null;       // Set<string> de vendor:product
  let _gamepadBaselineSet = false;   // true dès qu'on a figé le seed initial
  let _gamepadModalOpen = false;     // true tant que la modale est affichée

  function _getGamepadKeys() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const keys = new Set();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p) continue;
      const vp = (window.GamepadMapper && window.GamepadMapper.parseChromiumGamepadId)
        ? window.GamepadMapper.parseChromiumGamepadId(p.id)
        : null;
      keys.add(vp ? (vp.vendor + ':' + vp.product) : String(p.id));
    }
    return keys;
  }

  function _setsEqual(a, b) {
    if (!a || !b) return false;
    if (a.size !== b.size) return false;
    for (const k of a) if (!b.has(k)) return false;
    return true;
  }

  function _showGamepadWarning(reason) {
    // Si une modale est déjà en cours, on n'en ouvre pas une 2ème
    if (_gamepadModalOpen) {
      console.log('[Gamepad] changement détecté (' + reason + ') → modale déjà ouverte, skip');
      return;
    }
    console.log('[Gamepad] modale relance (' + reason + ')');

    const msg =
      "Un ou plusieurs périphériques ont été branchés/débranchés.\n\n" +
      "⚠️ Pour éviter tout problème de configuration (axes ou boutons qui ne répondent plus), " +
      "il est recommandé de relancer QACRL.\n\n" +
      "Tant que QACRL n'est pas relancé, l'UI Contrôles peut être désynchronisée.";

    const doRelaunch = () => {
      _gamepadModalOpen = true;
      const closeModal = () => { _gamepadModalOpen = false; };

      if (window.QacrlDialogs && typeof window.QacrlDialogs.confirm === 'function') {
        window.QacrlDialogs.confirm(msg, 'Périphériques modifiés', {
          variant: 'warning',
          okLabel: '🔄 Relancer QACRL',
          cancelLabel: 'Plus tard'
        }).then(async (ok) => {
          closeModal();
          if (ok) { try { await window.api.relaunchApp(); } catch (e) {} }
        }).catch(closeModal);
      } else {
        const ok = confirm(msg + '\n\nRelancer QACRL maintenant ?');
        closeModal();
        if (ok) { try { window.api.relaunchApp(); } catch (e) {} }
      }
    };

    // Debounce : laisse le temps à Windows d'envoyer tous ses events en rafale
    if (_gamepadDebounceTimer) clearTimeout(_gamepadDebounceTimer);
    _gamepadDebounceTimer = setTimeout(doRelaunch, _debounceMs);
  }

  // Poll principal : compare le SET de vendor:product uniques
  setInterval(() => {
    if (!navigator.getGamepads) return;
    const current = _getGamepadKeys();

    // Pas encore figé le seed : on attend la fin de la grâce
    if (!_gamepadBaselineSet) {
      if (Date.now() - _appStartTime < _appGracePeriodMs) return;
      _gamepadLastKeys = current;
      _gamepadBaselineSet = true;
      console.log('[Gamepad] set initial figé :', Array.from(current).join(', ') || '(aucun)');
      return;
    }

    if (!_setsEqual(_gamepadLastKeys, current)) {
      const added   = Array.from(current).filter(k => !_gamepadLastKeys.has(k));
      const removed = Array.from(_gamepadLastKeys).filter(k => !current.has(k));
      console.log('[Gamepad] set changé — ajout:', added.join(',') || '—',
                  '| retrait:', removed.join(',') || '—');
      _gamepadLastKeys = current;
      _showGamepadWarning('set change');
    }
  }, 1500);
});

/* ============================================================
   CONTENU
   ============================================================ */
async function refreshAllContent() {
  try {
    appData = { ...appData, ...await window.api.loadContent() };
    const pathDisplay = document.getElementById('ac-path-display');
    if (pathDisplay) pathDisplay.innerText = appData.acPath || 'Non défini';
    populateWeatherSelect(appData.weatherList);
    populatePurePlansSelect(appData.purePlans);
    populateManufacturerSelect();
    updateTagsUI('cars');
    updateTagsUI('tracks');
    renderCarsGrid();
    renderTracksGrid();
    renderExistingPlans();
  } catch (err) { console.error("Erreur contenu :", err); }
}

async function refreshDocumentsPath() {
  try {
    const p = await window.api.getDocumentsPath();
    const el = document.getElementById('documents-path-display');
    if (el) el.innerText = p || 'Non détecté';
  } catch (err) {}
}

/* ============================================================
   STATE
   ============================================================ */
async function loadSavedState() {
  try {
    const state = await window.api.getAppState();
    if (!state) return;
    if (state.favorites) {
      appData.favorites = {
        cars: Array.isArray(state.favorites.cars) ? state.favorites.cars : [],
        tracks: Array.isArray(state.favorites.tracks) ? state.favorites.tracks : []
      };
    }
    if (state.used) {
      appData.used = {
        cars: (state.used.cars && typeof state.used.cars === 'object') ? state.used.cars : {},
        tracks: (state.used.tracks && typeof state.used.tracks === 'object') ? state.used.tracks : {}
      };
    }
    if (Array.isArray(state.customServers)) {
      appData.customServers = state.customServers;
    }
    if (Array.isArray(state.favoriteServers)) {
      appData.favoriteServers = state.favoriteServers;
    }
    if (state.serverProfiles && typeof state.serverProfiles === 'object') {
      appData.serverProfiles = state.serverProfiles;
    }
    if (state.serverPasswords && typeof state.serverPasswords === 'object') {
      appData.serverPasswords = state.serverPasswords;
    }
    if (Array.isArray(state.recentServers)) {
      appData.recentServers = state.recentServers;
    }
    if (state.onlineSort && typeof state.onlineSort === 'object') {
      if (state.onlineSort.by) onlineSort.by = state.onlineSort.by;
      if (state.onlineSort.dir) onlineSort.dir = state.onlineSort.dir;
    }
    applyStateToUI(state);
    renderCarsGrid();
    renderTracksGrid();
    renderManualServers();
    updateSortButtonsUI();
  } catch (err) { console.error(err); }
}

function gatherState() {
  return {
    carId: currentSelection.car?.id || null,
    skinId: currentSelection.skin?.id || null,
    trackId: currentSelection.track?.id || null,
    variantId: currentSelection.variant?.id || null,
    favorites: appData.favorites,
    used: appData.used,
    customServers: appData.customServers || [],
    favoriteServers: appData.favoriteServers || [],
    serverProfiles: appData.serverProfiles || {},
    serverPasswords: appData.serverPasswords || {},
    recentServers: appData.recentServers || [],
    onlineSort: onlineSort,
    playerName: getValue('player-name'),
    onlineName: getValue('online-name'),
    steamId: getValue('steam-id'),
    playerFlag: getValue('player-flag'),
    randomAiFlags: getChecked('random-ai-flags'),
    sessionType: getValue('session-type'),
    laps: getValue('race-laps'),
    sessionMinutes: getValue('session-minutes'),
    sessionStartTime: getTimeStringFromPicker(),
    practiceMinutes: getValue('practice-minutes'),
    qualifyMinutes: getValue('qualify-minutes'),
    timeMult: getValue('time-mult'),
    opponentsCount: getValue('opponents-count'),
    gridType: getValue('grid-type'),
    startingPositionMode: getValue('starting-position-mode'),
    customStartPos: getValue('custom-start-pos'),
    jumpStartPenalty: getValue('jump-start-penalty'),
    aiLevel: getValue('ai-level'),
    aiLevelVar: getValue('ai-level-var'),
    aiAggression: getValue('ai-aggression'),
    aiAggressionVar: getValue('ai-aggression-var'),
    weather: getValue('weather-select'),
    weatherMode: getValue('weather-mode'),
    purePlan: getValue('pure-plan-select'),
    purePlanRandom: getChecked('pure-plan-random'),
    customPlanName: getValue('custom-plan-name'),
    customPlanSteps: customPlanSteps,
    planLoop: getChecked('plan-loop'),
    autoGearbox: getChecked('assist-auto-gearbox'),
    autoClutch: getChecked('assist-auto-clutch'),
    autoblip: getChecked('assist-autoblip'),
    idealLine: getChecked('assist-ideal-line'),
    tc: getValue('assist-tc'),
    abs: getValue('assist-abs'),
    stability: getValue('assist-stability'),
    fuelRate: getValue('fuel-rate'),
    mechanicalDamage: getValue('mechanical-damage'),
    tyreWear: getValue('tyre-wear'),
    slipstream: getValue('slipstream'),
    tyreBlankets: getChecked('tyre-blankets'),
    pureCtrl: {
      autostart: getChecked('purectrl-autostart'),
      lastUsed: getChecked('purectrl-last-used'),
      live: getChecked('purectrl-live'),
      startWetness: parseInt(getValue('purectrl-start-wetness'), 10) || 1,
      startPuddles: parseInt(getValue('purectrl-start-puddles'), 10) || 1
    }
  };
}

async function saveCurrentState() {
  await window.api.saveAppState(gatherState());
}

function applyStateToUI(state) {
  if (!state) return;
  if (state.carId) {
    const car = appData.cars.find(c => c.id === state.carId);
    if (car) {
      currentSelection.car = car;
      currentSelection.skin = car.skins.find(s => s.id === state.skinId) || car.skins[0] || null;
    }
  }
  if (state.trackId) {
    const track = appData.tracks.find(t => t.id === state.trackId);
    if (track) {
      currentSelection.track = track;
      currentSelection.variant = track.variants.find(v => v.id === state.variantId) || track.variants[0] || null;
    }
  }
  const map = {
    'player-name':'playerName','online-name':'onlineName','steam-id':'steamId','player-flag':'playerFlag',
    'session-type':'sessionType','race-laps':'laps','session-minutes':'sessionMinutes',
    'practice-minutes':'practiceMinutes','qualify-minutes':'qualifyMinutes',
    'time-mult':'timeMult','opponents-count':'opponentsCount','grid-type':'gridType',
    'starting-position-mode':'startingPositionMode','custom-start-pos':'customStartPos',
    'jump-start-penalty':'jumpStartPenalty','ai-level':'aiLevel','ai-level-var':'aiLevelVar',
    'ai-aggression':'aiAggression','ai-aggression-var':'aiAggressionVar',
    'weather-select':'weather','weather-mode':'weatherMode','pure-plan-select':'purePlan',
    'custom-plan-name':'customPlanName','assist-tc':'tc','assist-abs':'abs',
    'assist-stability':'stability','fuel-rate':'fuelRate','mechanical-damage':'mechanicalDamage',
    'tyre-wear':'tyreWear','slipstream':'slipstream'
  };
  Object.entries(map).forEach(([id, key]) => { if (state[key] !== undefined) setValue(id, state[key]); });
  const checks = {
    'random-ai-flags':'randomAiFlags','pure-plan-random':'purePlanRandom','plan-loop':'planLoop',
    'assist-auto-gearbox':'autoGearbox','assist-auto-clutch':'autoClutch','assist-autoblip':'autoblip',
    'assist-ideal-line':'idealLine','tyre-blankets':'tyreBlankets'
  };
  Object.entries(checks).forEach(([id, key]) => { if (state[key] !== undefined) setChecked(id, state[key]); });
  if (state.sessionStartTime) setTimePickerFromString(state.sessionStartTime);
  if (Array.isArray(state.customPlanSteps)) { customPlanSteps = state.customPlanSteps; renderWeatherSteps(); }

  if (state.pureCtrl && typeof state.pureCtrl === 'object') {
    let autostart = !!state.pureCtrl.autostart;
    let lastUsed = !!state.pureCtrl.lastUsed;
    let live = !!state.pureCtrl.live;
    if (autostart) { lastUsed = false; live = false; }
    else if (lastUsed) { live = false; }
    setChecked('purectrl-autostart', autostart);
    setChecked('purectrl-last-used', lastUsed);
    setChecked('purectrl-live', live);
    const sw = parseInt(state.pureCtrl.startWetness, 10);
    const sp = parseInt(state.pureCtrl.startPuddles, 10);
    setValue('purectrl-start-wetness', (!isNaN(sw) && sw >= 1) ? sw : 1);
    setValue('purectrl-start-puddles', (!isNaN(sp) && sp >= 1) ? sp : 1);
  }

  updateSessionUI(); updateSlidersDisplay(); updateRecapSidebar(); updateWeatherUI(); highlightSelectedCards();
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function setupEventListeners() {
  // ⭐ Contrôles de fenêtre (custom titlebar)
  document.getElementById('tb-minimize')?.addEventListener('click', () => window.api.windowMinimize());
  document.getElementById('tb-maximize')?.addEventListener('click', () => window.api.windowMaximize());
  document.getElementById('tb-close')?.addEventListener('click', () => window.api.windowClose());

  // Change l'icône du bouton maximize quand la fenêtre change d'état
  if (window.api.onWindowMaximizedChange) {
    window.api.onWindowMaximizedChange((isMaximized) => {
      const btn = document.getElementById('tb-maximize');
      if (!btn) return;
      btn.innerHTML = isMaximized
        ? '<svg viewBox="0 0 12 12" width="12" height="12"><rect x="2.5" y="2.5" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M4.5 4.5 L4.5 2.5 L9.5 2.5 L9.5 7.5 L7.5 7.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
        : '<svg viewBox="0 0 12 12" width="12" height="12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
      btn.title = isMaximized ? 'Restaurer' : 'Agrandir';
    });
  }


  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('selection-modal')) closeModal();
  });
    // ⭐ Sélecteur de langue FR/EN
  document.getElementById('language-select')?.addEventListener('change', async (e) => {
    const newLang = e.target.value;
    if (!window.I18n || typeof window.I18n.setLanguage !== 'function') return;

    const ok = await window.I18n.setLanguage(newLang);
    if (!ok) {
      alert('Erreur : impossible de charger la langue.');
      return;
    }

    // ⭐ Applique à tout le DOM
    window.I18n.applyToDom();

    // Ferme la modale CSP si elle est ouverte
    const modal = document.getElementById('csp-module-modal');
    if (modal && modal.classList.contains('visible')) {
      modal.classList.remove('visible');
    }

    // Re-render l'onglet CSP si dispo
    if (window.SettingsCsp && typeof window.SettingsCsp.load === 'function') {
      window.SettingsCsp.load();
    }

    // ⭐ Re-render les listes dynamiques (voitures, circuits, serveurs)
    if (typeof renderCarsGrid === 'function') renderCarsGrid();
    if (typeof renderTracksGrid === 'function') renderTracksGrid();
    if (typeof renderManualServers === 'function') renderManualServers();
    if (typeof renderRecentServers === 'function') renderRecentServers();
    if (typeof renderOnlineServers === 'function') renderOnlineServers();

    // ⭐ Re-render les listes côté Session / Météo / Mods / Historique
    if (typeof renderPresetsList === 'function') renderPresetsList();
    if (typeof renderSessionHistory === 'function') renderSessionHistory();
    if (typeof renderModsHistory === 'function') renderModsHistory();
    if (typeof renderExistingPlans === 'function') renderExistingPlans();
    if (typeof renderWeatherSteps === 'function') renderWeatherSteps();
    if (typeof updateWeatherUI === 'function') updateWeatherUI();
    if (typeof updateSessionUI === 'function') updateSessionUI();
    if (typeof updateSlidersDisplay === 'function') updateSlidersDisplay();
    if (typeof updateRecapSidebar === 'function') updateRecapSidebar();

    console.log('[i18n] Langue changée →', newLang);
  });

  document.getElementById('btn-select-ac')?.addEventListener('click', async () => {
    const sel = await window.api.selectAcFolder();
    if (sel) {
      // ⭐ Re-détecte les capacités (CSP / Pure) car le dossier a changé
      try {
        appData.capabilities = await window.api.checkCspPure();
        console.log('[Capabilities] (après changement AC)', appData.capabilities);
      } catch (e) { console.warn('[Capabilities] KO', e); }
      await refreshAllContent();
      populateManufacturerSelect();
      if (typeof updateWeatherUI === 'function') updateWeatherUI();
      if (window.SettingsCsp && typeof window.SettingsCsp.load === 'function') {
        window.SettingsCsp.load();
      }
    }
  });
  document.getElementById('btn-select-documents')?.addEventListener('click', async () => {
    const sel = await window.api.selectDocumentsFolder();
    if (sel) await refreshDocumentsPath();
  });

  setupFilterButtons('btn-car-filter-', (t) => { carFilter.type = t; renderCarsGrid(); });
  setupFilterButtons('btn-track-filter-', (t) => { trackFilter.type = t; renderTracksGrid(); });

  document.getElementById('car-search')?.addEventListener('input', (e) => {
    carFilter.search = e.target.value;
    renderCarsGrid();
  });
  document.getElementById('track-search')?.addEventListener('input', (e) => {
    trackFilter.search = e.target.value;
    renderTracksGrid();
  });
  document.getElementById('car-manufacturer-select')?.addEventListener('change', (e) => {
    carFilter.manufacturer = e.target.value;
    renderCarsGrid();
  });
  const h = document.getElementById('session-start-hour');
  const m = document.getElementById('session-start-minute');
  [h, m].forEach(el => el && el.addEventListener('change', () => {
    updateRecapSidebar(); saveCurrentState();
  }));
  const inputs = [
    'player-name','online-name','steam-id','player-flag','random-ai-flags',
    'session-type','race-laps','session-minutes','practice-minutes','qualify-minutes',
    'time-mult','opponents-count','grid-type','starting-position-mode','custom-start-pos',
    'jump-start-penalty','ai-level','ai-level-var','ai-aggression','ai-aggression-var',
    'weather-select','weather-mode','pure-plan-select','custom-plan-name','plan-loop',
    'assist-auto-gearbox','assist-auto-clutch','assist-autoblip','assist-ideal-line',
    'assist-tc','assist-abs','assist-stability','fuel-rate','mechanical-damage',
    'tyre-wear','slipstream','tyre-blankets',
    'purectrl-start-wetness','purectrl-start-puddles'
  ];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => {
      if (id === 'session-type' || id === 'starting-position-mode') updateSessionUI();
      if (id === 'weather-mode') {
        updateWeatherUI();
        applyWeatherModeToPureCtrl(getValue('weather-mode'));
      }
      updateSlidersDisplay(); updateRecapSidebar(); saveCurrentState();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });

  // ⭐ Toggle "Vérifier les mises à jour au démarrage"
  document.getElementById('check-updates-startup')?.addEventListener('change', async (e) => {
    try {
      const settings = await window.api.getSettings();
      settings.checkUpdatesOnStartup = !!e.target.checked;
      await window.api.saveSettings(settings);
    } catch (err) { console.warn('[update] save toggle KO', err); }
  });

  for (const id of PURECTRL_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('change', () => {
      enforcePureCtrlExclusive(id);
      saveCurrentState();
    });
  }

  document.getElementById('btn-add-weather-step')?.addEventListener('click', addWeatherStep);
  document.getElementById('btn-clear-weather-steps')?.addEventListener('click', clearWeatherSteps);
  document.getElementById('btn-save-plan')?.addEventListener('click', async () => {
    if (customPlanSteps.length === 0) { alert("Aucune météo dans le plan."); return; }
    const name = (getValue('custom-plan-name') || '').trim();
    if (!name) { alert("Donne un nom au plan."); return; }
    const btn = document.getElementById('btn-save-plan');
    const orig = btn.innerText; btn.disabled = true; btn.innerText = "💾...";
    try {
      const res = await window.api.saveCustomPlan(name, customPlanSteps.slice(),
        getTimeStringFromPicker(), parseInt(getValue('time-mult')) || 1, getChecked('plan-loop'));
      if (res && res.success) {
        await refreshAllContent();
        setValue('pure-plan-select', res.fileName);
        setValue('weather-mode', 'existing_plan');
        applyWeatherModeToPureCtrl('existing_plan');
        updateWeatherUI();
        alert(`Plan "${res.planName}" sauvegardé.`);
      }
    } catch (err) { alert(`Erreur : ${err.message}`); }
    finally { btn.disabled = false; btn.innerText = orig; }
  });
  document.getElementById('btn-refresh-plans')?.addEventListener('click', async () => {
    await refreshAllContent();
  });
  document.getElementById('btn-random-all')?.addEventListener('click', randomizeAll);
  document.getElementById('btn-save-preset')?.addEventListener('click', savePreset);
  document.getElementById('btn-launch-game')?.addEventListener('click', launchGame);
  document.getElementById('recap-car-section')?.addEventListener('click', () => switchTab(null, 'tab-cars'));
  document.getElementById('recap-track-section')?.addEventListener('click', () => switchTab(null, 'tab-tracks'));
  document.getElementById('recap-session-section')?.addEventListener('click', () => {
    switchTab(null, 'tab-session');
    document.querySelector('.subtab-btn[onclick*="subtab-session"]')?.click();
  });

  document.getElementById('btn-car-tags-open')?.addEventListener('click', () => openTagsPopup('cars'));
  document.getElementById('btn-track-tags-open')?.addEventListener('click', () => openTagsPopup('tracks'));
  document.getElementById('tags-popup-close')?.addEventListener('click', closeTagsPopup);
  document.getElementById('tags-popup-backdrop')?.addEventListener('click', closeTagsPopup);

  document.getElementById('tags-popup-search-input')?.addEventListener('input', (e) => {
    currentTagPopup.search = e.target.value;
    renderTagsPopupBody();
  });

  document.getElementById('tags-popup-clear')?.addEventListener('click', () => {
    const kind = currentTagPopup.kind;
    if (!kind) return;
    const filter = kind === 'cars' ? carFilter : trackFilter;
    filter.tags = [];
    renderTagsPopupBody();
    updateTagsUI(kind);
    if (kind === 'cars') renderCarsGrid(); else renderTracksGrid();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTagsPopup();
      closeServerJoinModal();
    }
  });

  document.getElementById('btn-clear-session-history')?.addEventListener('click', async () => {
    if (!confirm("Vider tout l'historique des sessions ?\n\nCette action est irréversible.")) return;
    await window.api.clearSessionHistory();
    await loadSessionHistory();
  });

  // SERVEURS EN LIGNE
  document.getElementById('btn-online-refresh')?.addEventListener('click', async () => {
    await fetchOnlineServers(false);
  });

  document.getElementById('btn-online-load-more')?.addEventListener('click', async () => {
    if (!appData.onlineServersHasNext) {
      alert("Aucune page supplémentaire à charger.");
      return;
    }
    await fetchOnlineServers(true);
  });

  document.getElementById('btn-online-clear-recent')?.addEventListener('click', () => {
    if (!appData.recentServers || appData.recentServers.length === 0) return;
    if (!confirm("Vider tout l'historique des serveurs récents ?")) return;
    appData.recentServers = [];
    saveCurrentState();
    renderRecentServers();
  });

    // 📋 Coller un lien de serveur
  document.getElementById('btn-online-parse-link')?.addEventListener('click', () => {
    const input = document.getElementById('online-paste-link');
    const raw = (input?.value || '').trim();
    if (!raw) { alert("Colle un lien de serveur."); return; }

    const parsed = parseServerLink(raw);
    if (!parsed) {
      alert("Impossible de lire ce lien.\n\nFormats acceptés :\n• https://acstuff.club/s/...?ip=X&httpPort=Y\n• acmanager://race/online/join?ip=X&httpPort=Y\n• IP:PORT");
      return;
    }

    // ⭐ Pré-remplit le mot de passe si présent dans le lien
    if (parsed.password) {
      if (!appData.serverPasswords) appData.serverPasswords = {};
      appData.serverPasswords[`${parsed.ip}:${parsed.port}`] = parsed.password;
    }

    const srvObj = {
      id: `link_${parsed.ip}_${parsed.port}`,
      ip: parsed.ip,
      port: parsed.port,
      httpPort: parsed.httpPort,
      name: `${parsed.ip}:${parsed.port}`,
      playersCurrent: 0,
      playersMax: 0,
      source: 'link'
    };

    openServerJoinModal(srvObj);
    if (input) input.value = '';
  });

  // 📋 Entrée clavier = clic sur Rejoindre
  document.getElementById('online-paste-link')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-online-parse-link')?.click();
    }
  });

  document.getElementById('btn-online-add-manual')?.addEventListener('click', () => {
    const ipInput = document.getElementById('online-manual-ip');
    const nameInput = document.getElementById('online-manual-name');
    const raw = (ipInput?.value || '').trim();
    if (!raw) { alert("Saisis une adresse IP:Port."); return; }

    const m = raw.match(/^([\d\.a-zA-Z\-]+):(\d+)$/);
    if (!m) { alert("Format invalide. Attendu : IP:PORT (ex: 94.130.91.49:8081)"); return; }
    const ip = m[1];
    const port = parseInt(m[2], 10);
    if (!port || port < 1 || port > 65535) { alert("Port invalide."); return; }

    const name = (nameInput?.value || '').trim();

    if (!appData.customServers) appData.customServers = [];
    appData.customServers.push({
      id: 'srv_' + Date.now(),
      ip,
      port,
      httpPort: port + 1,
      name: name || `${ip}:${port}`
    });
    saveCurrentState();
    renderManualServers();

    if (ipInput) ipInput.value = '';
    if (nameInput) nameInput.value = '';
  });

  document.getElementById('online-search')?.addEventListener('input', (e) => {
    onlineFilter.search = e.target.value;
    renderOnlineServers();
  });

  document.getElementById('online-filter-country')?.addEventListener('change', (e) => {
    onlineFilter.country = e.target.value;
    renderOnlineServers();
  });

  document.getElementById('online-filter-track')?.addEventListener('change', (e) => {
    onlineFilter.track = e.target.value;
    renderOnlineServers();
  });

  document.getElementById('online-filter-min-players')?.addEventListener('input', (e) => {
    onlineFilter.minPlayers = parseInt(e.target.value, 10) || 0;
    renderOnlineServers();
  });

  document.getElementById('btn-sort-name')?.addEventListener('click', () => {
    if (onlineSort.by === 'name') onlineSort.dir = onlineSort.dir === 'asc' ? 'desc' : 'asc';
    else { onlineSort.by = 'name'; onlineSort.dir = 'asc'; }
    updateSortButtonsUI(); renderOnlineServers(); saveCurrentState();
  });
  document.getElementById('btn-sort-players')?.addEventListener('click', () => {
    if (onlineSort.by === 'players') onlineSort.dir = onlineSort.dir === 'asc' ? 'desc' : 'asc';
    else { onlineSort.by = 'players'; onlineSort.dir = 'desc'; }
    updateSortButtonsUI(); renderOnlineServers(); saveCurrentState();
  });
  document.getElementById('btn-sort-country')?.addEventListener('click', () => {
    if (onlineSort.by === 'country') onlineSort.dir = onlineSort.dir === 'asc' ? 'desc' : 'asc';
    else { onlineSort.by = 'country'; onlineSort.dir = 'asc'; }
    updateSortButtonsUI(); renderOnlineServers(); saveCurrentState();
  });
  document.getElementById('btn-sort-rating')?.addEventListener('click', () => {
    if (onlineSort.by === 'rating') onlineSort.dir = onlineSort.dir === 'asc' ? 'desc' : 'asc';
    else { onlineSort.by = 'rating'; onlineSort.dir = 'desc'; }
    updateSortButtonsUI(); renderOnlineServers(); saveCurrentState();
  });

  document.getElementById('btn-detect-steam-id')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-detect-steam-id');
    const orig = btn.innerText;
    btn.disabled = true; btn.innerText = "🔍 ...";
    try {
      const res = await window.api.detectSteamId();
      if (res && res.success) {
        setValue('steam-id', res.steamId);
        await saveCurrentState();

        let msg = `✅ SteamID détecté !\n\nSteamID64 : ${res.steamId}`;
        if (res.personaName) msg += `\nNom Steam : ${res.personaName}`;
        if (res.accountName) msg += `\nCompte : ${res.accountName}`;
        if (res.source) msg += `\n\nSource : ${res.source}`;
        if (res.warning) msg += `\n⚠️ ${res.warning}`;
        alert(msg);
      } else {
        alert(`❌ Impossible de détecter le SteamID.\n\n${res?.error || 'Erreur inconnue'}\n\nVérifie que Steam est bien installé et que tu es connecté.`);
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
    } finally {
      btn.disabled = false; btn.innerText = orig;
    }
  });

  // Modale "Rejoindre un serveur"
  document.getElementById('server-join-close')?.addEventListener('click', closeServerJoinModal);
  document.getElementById('server-join-cancel')?.addEventListener('click', closeServerJoinModal);
  document.getElementById('server-join-confirm')?.addEventListener('click', confirmServerJoin);
  document.getElementById('server-join-refresh')?.addEventListener('click', refreshServerJoinModal);
  document.getElementById('server-join-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('server-join-modal')) closeServerJoinModal();
  });

  // ⭐ Coller un lien serveur (acstuff / acmanager / IP:PORT)
  document.getElementById('btn-server-link-join')?.addEventListener('click', handleServerLinkJoin);
  document.getElementById('server-link-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleServerLinkJoin();
    }
  });

  // ⭐ Filtre favoris sur les serveurs manuels
  document.getElementById('btn-manual-filter-favorites')?.addEventListener('click', (e) => {
    manualFilter.favoritesOnly = !manualFilter.favoritesOnly;
    e.currentTarget.classList.toggle('active', manualFilter.favoritesOnly);
    renderManualServers();
  });

  // ⭐ Filtre favoris sur les serveurs récents
  document.getElementById('btn-recent-filter-favorites')?.addEventListener('click', (e) => {
    recentFilter.favoritesOnly = !recentFilter.favoritesOnly;
    e.currentTarget.classList.toggle('active', recentFilter.favoritesOnly);
    renderRecentServers();
  });

  // ⭐ Init de la modale d'édition
  if (typeof setupServerEditModalHandlers === 'function') setupServerEditModalHandlers();
}