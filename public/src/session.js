/* ============================================================
   QACRL — Session (météo, presets, historique, lancement)
   ============================================================ */

/* ============================================================
   HELPER — filtre la liste météo selon les capacités (CSP / Pure)
   ============================================================ */
function filterWeatherByCapabilities(list) {
  const caps = (appData && appData.capabilities) || {};
  // CSP + Pure → tout passe (Kunos + Sol + Pure)
  if (caps.hasCSP && caps.hasPure) return list;
  // CSP + Sol → Kunos + Sol uniquement
  if (caps.hasCSP && caps.hasSol) {
    return list.filter(w => /^\d/.test(w) || /^sol_/i.test(w));
  }
  // Sinon → uniquement les météos Kunos (numérotées)
  return list.filter(w => /^\d/.test(w));
}

/* ============================================================
   HELPER — les modes Plan Pure sont-ils disponibles ?
   ============================================================ */
function isPureAvailable() {
  const caps = (appData && appData.capabilities) || {};
  return !!(caps.hasPure && caps.hasCSP);
}

/* ============================================================
   HELPER — Sol Planner est-il disponible ?
   (Sol + CSP + app Python sol_planner installée)
   ============================================================ */
function isSolAvailable() {
  const caps = (appData && appData.capabilities) || {};
  return !!(caps.hasSol && caps.hasCSP && caps.hasSolPlanner);
}

/* ============================================================
   HELPER — Quel moteur de plans est actif ?
   Priorité PURE > SOL (règle v1.4.0).
   Retourne : 'pure' | 'sol' | null
   ============================================================ */
function getActivePlanner() {
  if (isPureAvailable()) return 'pure';
  if (isSolAvailable()) return 'sol';
  return null;
}

/* ============================================================
   UI SESSION
   ============================================================ */
function updateSessionUI() {
  const isRace = getValue('session-type') === 'RACE';
  ['opponents-count','grid-type','starting-position-mode','custom-start-pos','jump-start-penalty',
   'ai-level','ai-level-var','ai-aggression','ai-aggression-var'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !isRace;
  });
  const durRow = document.getElementById('session-duration-row');
  const raceRow = document.getElementById('race-sessions-row');
  if (durRow) durRow.style.display = isRace ? 'none' : 'flex';
  if (raceRow) raceRow.style.display = isRace ? 'flex' : 'none';
  const cpg = document.getElementById('custom-pos-group');
  if (cpg) cpg.style.display = (isRace && getValue('starting-position-mode') === 'CUSTOM') ? 'flex' : 'none';
}

/* ============================================================
   UI MÉTÉO
   ============================================================ */
function updateWeatherUI() {
  const mode = getValue('weather-mode');
  const sr = document.getElementById('weather-static-row');
  const pr = document.getElementById('weather-plan-row');
  const cg = document.getElementById('weather-custom-group');
  if (sr) sr.style.display = (mode === 'static') ? 'flex' : 'none';
  if (pr) pr.style.display = (mode === 'existing_plan') ? 'flex' : 'none';
  if (cg) cg.style.display = (mode === 'custom_plan') ? 'flex' : 'none';
  if (mode === 'custom_plan') renderWeatherSteps();

  // ⭐ Grise les options "Plan" si aucun planner n'est dispo (Pure OU Sol)
  const planner = getActivePlanner();
  const plansOk = !!planner;
  const modeSelect = document.getElementById('weather-mode');
  if (modeSelect) {
    const optExisting = modeSelect.querySelector('option[value="existing_plan"]');
    const optCustom = modeSelect.querySelector('option[value="custom_plan"]');
    [optExisting, optCustom].forEach(opt => {
      if (!opt) return;
      opt.disabled = !plansOk;
      if (!plansOk) {
        // Nettoie le texte de base (retire anciens préfixes/suffixes, même ceux en double)
        const baseTxt = opt.textContent
          .replace(/^⛔\s*/, '')
          .replace(/(\s*\((?:CSP\+)?(?:Pure|Sol) requis\))+/gi, '')
          .trim();
        opt.textContent = '⛔ ' + baseTxt + ' (CSP+Pure ou Sol requis)';
      } else {
        opt.textContent = opt.textContent
          .replace(/^⛔\s*/, '')
          .replace(/(\s*\((?:CSP\+)?(?:Pure|Sol) requis\))+/gi, '')
          .trim();
      }
    });
    // ⭐ Si on était en mode plan alors qu'aucun planner n'est dispo → bascule en static
    if (!plansOk && (mode === 'existing_plan' || mode === 'custom_plan')) {
      modeSelect.value = 'static';
      updateWeatherUI();
    }
  }
}

/* ============================================================
   WEATHER STEPS
   ============================================================ */
function renderWeatherSteps() {
  const list = document.getElementById('weather-steps-list');
  if (!list) return;
  list.innerHTML = '';
  if (customPlanSteps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'weather-empty';
    empty.innerText = 'Aucune météo ajoutée. Cliquez sur "+ Ajouter une météo".';
    list.appendChild(empty);
  } else {
    customPlanSteps.forEach((step, index) => {
      const row = document.createElement('div');
      row.className = 'weather-step';
      row.style.marginBottom = '8px';
      const idx = document.createElement('div');
      idx.className = 'weather-step-index';
      idx.innerText = String(index + 1);

      const select = document.createElement('select');
      select.dataset.index = index;
      // ⭐ Filtre selon les capacités
      const filtered = filterWeatherByCapabilities(appData.weatherList);
      const kunos = filtered.filter(w => /^\d/.test(w));
      const solPure = filtered.filter(w => /^(sol|pure|sfx)/i.test(w));
      const others = filtered.filter(w => !kunos.includes(w) && !solPure.includes(w));
      const addGroup = (label, items) => {
        if (items.length === 0) return;
        const og = document.createElement('optgroup'); og.label = label;
        items.forEach(w => {
          const o = document.createElement('option');
          o.value = w; o.textContent = translateWeatherName(w);
          if (w === step.weather) o.selected = true;
          og.appendChild(o);
        });
        select.appendChild(og);
      };
      addGroup('Kunos (base)', kunos);
      addGroup('SOL / Pure', solPure);
      addGroup('Autres', others);

      select.addEventListener('change', (e) => {
        customPlanSteps[index].weather = e.target.value;
        updateWeatherTotalDuration(); updateRecapSidebar(); saveCurrentState();
      });

      const duration = document.createElement('input');
      duration.type = 'number'; duration.min = '1'; duration.max = '600';
      duration.value = step.duration || 10;
      duration.title = 'Durée (min)';
      duration.addEventListener('input', (e) => {
        customPlanSteps[index].duration = parseInt(e.target.value, 10) || 0;
        updateWeatherTotalDuration(); updateRecapSidebar(); saveCurrentState();
      });

      const remove = document.createElement('button');
      remove.className = 'step-remove';
      remove.innerHTML = '×';
      remove.addEventListener('click', () => {
        customPlanSteps.splice(index, 1);
        renderWeatherSteps(); updateRecapSidebar(); saveCurrentState();
      });

      row.appendChild(idx); row.appendChild(select); row.appendChild(duration); row.appendChild(remove);
      list.appendChild(row);
    });
  }
  updateWeatherTotalDuration();
}

function updateWeatherTotalDuration() {
  const el = document.getElementById('weather-total-duration');
  if (!el) return;
  const total = customPlanSteps.reduce((a, s) => a + (parseInt(s.duration, 10) || 0), 0);
  el.innerText = customPlanSteps.length === 0 ? '' : `Durée totale : ${total} min • ${customPlanSteps.length} étape(s)`;
}

function addWeatherStep() {
  const def = appData.weatherList[0] || '3_clear';
  customPlanSteps.push({ weather: def, duration: 10 });
  renderWeatherSteps(); updateRecapSidebar(); saveCurrentState();
}

function clearWeatherSteps() {
  if (customPlanSteps.length === 0) return;
  if (!confirm("Vider toute la liste des météos ?")) return;
  customPlanSteps = [];
  renderWeatherSteps(); updateRecapSidebar(); saveCurrentState();
}

/* ============================================================
   SELECTS MÉTÉO
   ============================================================ */
function populateWeatherSelect(weatherList) {
  const select = document.getElementById('weather-select');
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '';

  // ⭐ Filtre selon les capacités (pas de SOL/Pure si pas CSP+Pure)
  const filtered = filterWeatherByCapabilities(weatherList);

  const kunos = filtered.filter(w => /^\d/.test(w));
  const solPure = filtered.filter(w => /^(sol|pure|sfx)/i.test(w));
  const others = filtered.filter(w => !kunos.includes(w) && !solPure.includes(w));

  const addGroup = (label, items) => {
    if (items.length === 0) return;
    const og = document.createElement('optgroup'); og.label = label;
    items.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w; opt.textContent = translateWeatherName(w);
      og.appendChild(opt);
    });
    select.appendChild(og);
  };
  addGroup('Kunos (base)', kunos);
  addGroup('SOL / Pure', solPure);
  addGroup('Autres', others);

  // ⭐ Si l'ancienne valeur n'existe plus (ex : sol_* alors qu'on n'a plus Pure)
  //    → on bascule sur la 1ère option Kunos disponible
  if (prev && filtered.includes(prev)) {
    select.value = prev;
  } else if (kunos.length > 0) {
    select.value = kunos[0];
  }
}

function populatePurePlansSelect(plans) {
  const select = document.getElementById('pure-plan-select');
  if (!select) return;

  // ⭐ Router : si Pure actif → plans Pure, sinon si Sol actif → plans Sol
  const planner = getActivePlanner();
  const activePlans = (planner === 'sol')
    ? (appData.solPlans || [])
    : (plans || []);

  const prev = select.value;
  select.innerHTML = '';
  activePlans.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  if (prev && activePlans.some(p => p.id === prev)) select.value = prev;
}

/* ============================================================
   PLANS EXISTANTS
   ============================================================ */
function renderExistingPlans() {
  const container = document.getElementById('existing-plans-list');
  if (!container) return;
  container.innerHTML = '';

  const planner = getActivePlanner();

  // ⭐ Badge dynamique "Sol" / "Pure" dans le titre du groupe
  try {
    const titleEl = document.querySelector('#weather-existing-plans-group .group-title span');
    if (titleEl) {
      const baseTitle = (window.I18n && window.I18n.tFr)
        ? window.I18n.tFr('Plans existants')
        : 'Plans existants';
      if (planner === 'sol') {
        titleEl.innerHTML = baseTitle + ' <span style="color:var(--accent);font-weight:800;margin-left:6px;font-size:0.72rem;letter-spacing:1px;">SOL</span>';
      } else if (planner === 'pure') {
        titleEl.innerHTML = baseTitle + ' <span style="color:var(--accent);font-weight:800;margin-left:6px;font-size:0.72rem;letter-spacing:1px;">PURE</span>';
      } else {
        titleEl.textContent = baseTitle;
      }
    }
  } catch (e) { /* ignore */ }

  // ⭐ Route selon le planner actif (Pure prioritaire, sinon Sol)
  const plans = (planner === 'sol')
    ? (appData.solPlans || [])
    : (appData.purePlans || []);

  if (plans.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'plans-empty';
    if (planner === 'sol') {
      empty.innerText = 'Aucun plan Sol trouvé dans apps/python/sol_planner/plans/.';
    } else if (planner === 'pure') {
      empty.innerText = 'Aucun plan Pure trouvé dans extension/config-ext/PurePlanner/Plans/.';
    } else {
      empty.innerText = 'Aucun système de plans disponible (CSP + Pure ou Sol requis).';
    }
    container.appendChild(empty);
    return;
  }

  plans.forEach(plan => {
    const row = document.createElement('div');
    row.className = 'plan-row';

    // ⭐ Meta adapté selon la source
    const metaHtml = (planner === 'sol')
      ? (plan.isQacrl
          ? '<span style="color: var(--accent);">Créé par QACRL</span>'
          : 'Fichier Sol : <code>' + (plan.id || '') + '</code>')
      : 'Dossier : <code>' + (plan.folder || '(racine)') + '</code>';

    // ⭐ Édition désactivée pour les plans Sol (pas d'équivalent applyPlanToEditor)
    const editBtnHtml = (planner === 'sol')
      ? ''
      : '<button class="plan-action edit">' + ((window.I18n && window.I18n.tFr) ? window.I18n.tFr('Éditer') : 'Éditer') + '</button>';

    row.innerHTML = `
      <div class="plan-info">
        <div class="plan-name">${plan.name}</div>
        <div class="plan-meta">${metaHtml}</div>
      </div>
      <div class="plan-actions">
        <button class="plan-action load">${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Charger') : 'Charger'}</button>
        ${editBtnHtml}
        <button class="plan-action delete">${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Supprimer') : 'Supprimer'}</button>
      </div>
    `;

    row.querySelector('.load').addEventListener('click', () => {
      setValue('weather-mode', 'existing_plan');
      applyWeatherModeToPureCtrl('existing_plan');
      updateWeatherUI();
      const select = document.getElementById('pure-plan-select');
      if (select && plans.some(p => p.id === plan.id)) {
        select.value = plan.id;
      }
      updateRecapSidebar();
      saveCurrentState();
    });

    // Édition : uniquement pour Pure
    if (planner !== 'sol') {
      row.querySelector('.edit').addEventListener('click', async () => {
        try {
          const res = await window.api.loadPurePlan(plan.id);
          if (!res || !res.success) throw new Error('Chargement impossible.');
          applyPlanToEditor(res);
        } catch (err) {
          alert('Erreur : ' + err.message);
        }
      });
    }

    row.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Supprimer le plan "${plan.name}" ?\n\nCette action est irréversible.`)) return;
      try {
        if (planner === 'sol') {
          await window.api.deleteSolPlan(plan.id);
        } else {
          await window.api.deletePurePlan(plan.id);
        }
        await refreshAllContent();
        alert(`Plan "${plan.name}" supprimé.`);
      } catch (err) {
        alert('Erreur : ' + err.message);
      }
    });

    container.appendChild(row);
  });
}

function guessWeatherIdFromIndex(weatherIndex) {
  if (weatherIndex === undefined || weatherIndex === null) return appData.weatherList[0] || '3_clear';
  const map = {
    0:'light_thunderstorm',1:'thunderstorm',2:'heavy_thunderstorm',3:'light_drizzle',
    4:'drizzle',5:'heavy_drizzle',6:'light_rain',7:'rain',8:'heavy_rain',
    9:'light_snow',10:'snow',11:'heavy_snow',12:'light_sleet',13:'sleet',
    14:'heavy_sleet',15:'clear',16:'few_clouds',17:'scattered_clouds',
    18:'broken_clouds',19:'overcast',20:'fog',21:'mist',22:'smoke',
    23:'haze',24:'sand',25:'dust',26:'squalls',27:'tornado',28:'hurricane',
    29:'cold',30:'hot',31:'windy',32:'hail'
  };
  const targetKey = map[weatherIndex];
  if (!targetKey) return appData.weatherList[0] || '3_clear';
  const found = appData.weatherList.find(w => w.toLowerCase().includes(targetKey.replace(/_/g, '_')));
  return found || appData.weatherList[0] || '3_clear';
}

function applyPlanToEditor(planRes) {
  const data = planRes.data || {};
  const container = Array.isArray(data.container) ? data.container : [];

  const steps = container.map(step => {
    const weatherObj = (step && step.data && step.data.weather) ? step.data.weather : {};
    const durationSec = (step && step.data && step.data.duration) ? step.data.duration : 600;
    return {
      weather: guessWeatherIdFromIndex(weatherObj.index),
      duration: Math.max(1, Math.round(durationSec / 60))
    };
  });

  if (steps.length === 0) {
    alert('Ce plan ne contient aucune étape exploitable.');
    return;
  }

  customPlanSteps = steps;
  setValue('custom-plan-name', planRes.planName || 'Mon plan');
  setChecked('plan-loop', !!(data.control && data.control.loop));
  setValue('weather-mode', 'custom_plan');
  applyWeatherModeToPureCtrl('custom_plan');
  updateWeatherUI();
  renderWeatherSteps();
  updateRecapSidebar();
  saveCurrentState();
}

/* ============================================================
   PURE CTRL
   ============================================================ */
const PURECTRL_IDS = ['purectrl-autostart', 'purectrl-last-used', 'purectrl-live'];

function enforcePureCtrlExclusive(sourceId) {
  if (!sourceId) return;
  if (!getChecked(sourceId)) return;
  for (const id of PURECTRL_IDS) {
    if (id !== sourceId) setChecked(id, false);
  }
}

function applyWeatherModeToPureCtrl(mode) {
  if (mode === 'custom_plan' || mode === 'existing_plan') {
    setChecked('purectrl-autostart', true);
    setChecked('purectrl-last-used', false);
    setChecked('purectrl-live', false);
  } else if (mode === 'static') {
    setChecked('purectrl-autostart', false);
    setChecked('purectrl-last-used', false);
    setChecked('purectrl-live', false);
  }
}

async function loadPureCtrlSettings() {
  try {
    const res = await window.api.readPureCtrlSettings();
    if (!res) return;

    let autostart = !!res.autostart;
    let lastUsed = !!res.lastUsed;
    let live = !!res.live;

    if (autostart) { lastUsed = false; live = false; }
    else if (lastUsed) { live = false; }

    setChecked('purectrl-autostart', autostart);
    setChecked('purectrl-last-used', lastUsed);
    setChecked('purectrl-live', live);

    const sw = parseInt(res.startWetness, 10);
    const sp = parseInt(res.startPuddles, 10);
    setValue('purectrl-start-wetness', (!isNaN(sw) && sw >= 1) ? sw : 1);
    setValue('purectrl-start-puddles', (!isNaN(sp) && sp >= 1) ? sp : 1);
  } catch (err) {
    console.warn('[loadPureCtrlSettings]', err);
  }
}

/* ============================================================
   PRESETS
   ============================================================ */
async function loadPresets() {
  try {
    const list = await window.api.getPresets();
    appData.presets = Array.isArray(list) ? list : [];
    renderPresetsList();
  } catch (err) { console.error(err); }
}

function renderPresetsList() {
  const list = document.getElementById('presets-list');
  if (!list) return;
  list.innerHTML = '';
  if (appData.presets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'presets-empty';
    empty.innerText = (window.I18n && window.I18n.tFr)
      ? window.I18n.tFr('Aucun preset sauvegardé. Configure ta session et clique sur "Sauvegarder".')
      : 'Aucun preset sauvegardé. Configure ta session et clique sur "Sauvegarder".';
    list.appendChild(empty);
    return;
  }
  const sorted = [...appData.presets].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  sorted.forEach(preset => {
    const row = document.createElement('div');
    row.className = 'preset-row';
    const dateStr = preset.updatedAt ? new Date(preset.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const carName = preset.carId ? (appData.cars.find(c => c.id === preset.carId)?.name || preset.carId) : '—';
    const trackName = preset.trackId ? (appData.tracks.find(t => t.id === preset.trackId)?.name || preset.trackId) : '—';
    row.innerHTML = `
      <div class="preset-info">
        <div class="preset-name">${preset.name || 'Sans nom'}</div>
        <div class="preset-meta">${carName} • ${trackName} • ${dateStr}</div>
      </div>
      <div class="preset-actions">
        <button class="preset-action load">${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Charger') : 'Charger'}</button>
        <button class="preset-action delete">${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Supprimer') : 'Supprimer'}</button>
      </div>
    `;
    row.querySelector('.load').addEventListener('click', () => {
      applyStateToUI(preset);
      saveCurrentState();
      alert(`Preset "${preset.name}" chargé.`);
    });
    row.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Supprimer le preset "${preset.name}" ?`)) return;
      await window.api.deletePreset(preset.id);
      await loadPresets();
    });
    list.appendChild(row);
  });
}

async function savePreset() {
  const nameInput = document.getElementById('preset-name-input');
  const name = (nameInput?.value || '').trim();
  if (!name) { alert("Donne un nom au preset."); return; }
  const state = gatherState();
  const preset = { ...state, name, id: 'preset_' + Date.now() };
  const res = await window.api.savePreset(preset);
  if (res && res.success) {
    nameInput.value = '';
    await loadPresets();
    alert(`Preset "${name}" sauvegardé.`);
  } else {
    alert(`Erreur : ${res?.error || 'inconnue'}`);
  }
}

/* ============================================================
   HISTORIQUE MODS
   ============================================================ */
async function loadModsHistory() {
  try {
    const list = await window.api.getModsHistory();
    appData.modsHistory = Array.isArray(list) ? list : [];
    renderModsHistory();
  } catch (err) { console.error('[modsHistory]', err); }
}

function renderModsHistory() {
  const container = document.getElementById('mods-history-list');
  if (!container) return;
  container.innerHTML = '';
  if (!appData.modsHistory || appData.modsHistory.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mods-history-empty';
    empty.innerText = "Aucun mod installé via le launcher pour l'instant.";
    container.appendChild(empty);
    return;
  }
  const sorted = [...appData.modsHistory].sort((a, b) => (b.date || 0) - (a.date || 0));
  sorted.forEach(entry => {
    const group = document.createElement('div');
    group.className = 'mods-history-group';
    const dateStr = entry.date ? new Date(entry.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const header = document.createElement('div');
    header.className = 'mod-history-header';
    header.innerHTML = `
      <span>📅 ${dateStr}</span>
      <span class="mod-history-file">${entry.filename || ''}</span>
    `;
    group.appendChild(header);
    (entry.items || []).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'mod-history-item';
      const previewHtml = item.preview
        ? `<img class="mod-history-preview" src="${item.preview}" alt="" onerror="this.style.visibility='hidden'">`
        : `<div class="mod-history-preview"></div>`;
      const kindLabel = item.kind === 'car' ? 'Voiture' : item.kind === 'track' ? 'Circuit' : item.kind;
      row.innerHTML = `
        ${previewHtml}
        <div class="mod-history-info">
          <div class="mod-history-name">${item.name || item.id}</div>
          <div class="mod-history-meta">${kindLabel} • <code>${item.id}</code></div>
        </div>
        <button class="mod-history-delete" title="Supprimer ce mod">🗑️</button>
      `;
      row.querySelector('.mod-history-delete').addEventListener('click', async () => {
        const ok = confirm(`Supprimer définitivement "${item.name || item.id}" ?\n\nLe dossier sera effacé de votre installation AC :\n${item.dest || item.id}`);
        if (!ok) return;
        try {
          await window.api.deleteModFromHistory(entry.id, item.id);
          await loadModsHistory();
          await refreshAllContent();
        } catch (err) { alert('Erreur : ' + err.message); }
      });
      group.appendChild(row);
    });
    container.appendChild(group);
  });
}

/* ============================================================
   HISTORIQUE SESSIONS
   ============================================================ */
async function loadSessionHistory() {
  try {
    const list = await window.api.getSessionHistory();
    appData.sessionHistory = Array.isArray(list) ? list : [];
    renderSessionHistory();
  } catch (err) { console.error('[sessionHistory]', err); }
}

function renderSessionHistory() {
  const container = document.getElementById('session-history-list');
  if (!container) return;
  container.innerHTML = '';

  if (!appData.sessionHistory || appData.sessionHistory.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'session-history-empty';
    empty.innerText = 'Aucune session lancée pour le moment. Lance une course et elle apparaîtra ici.';
    container.appendChild(empty);
    return;
  }

  appData.sessionHistory.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'session-history-item';

    const dateStr = entry.date
      ? new Date(entry.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
      : '';

    const previewHtml = entry.preview
      ? `<img class="session-history-preview" src="${entry.preview}" alt="" onerror="this.style.visibility='hidden'">`
      : `<div class="session-history-preview placeholder">🚗</div>`;

    const varSuffix = entry.variantName && entry.variantName !== 'Default'
      ? ` (${entry.variantName})`
      : '';
    const title = `${entry.carName || entry.car}<span class="sep">•</span>${entry.trackName || entry.track}${varSuffix}`;

    const sessionTypeLabel = entry.sessionType === 'RACE'
      ? `RACE ${entry.laps || '?'} tours (${entry.opponentsCount || 0} IA)`
      : entry.sessionType === 'HOTLAP' ? 'HOTLAP'
      : 'PRACTICE';

    const timeStr = entry.sessionStartTime ? `@ ${entry.sessionStartTime}` : '';
    const multStr = entry.timeMult > 1 ? `x${entry.timeMult}` : '';

    row.innerHTML = `
      ${previewHtml}
      <div class="session-history-info">
        <div class="session-history-title">${title}</div>
        <div class="session-history-meta">
          <span>📅 ${dateStr}</span>
          <span class="tag">${sessionTypeLabel}</span>
          ${timeStr ? `<span class="tag">${timeStr} ${multStr}</span>` : ''}
          <span class="tag">🌤 ${entry.weatherDisplay || '—'}</span>
        </div>
      </div>
      <div class="session-history-actions">
        <button class="reload" title="${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Recharger la config et lancer la course') : 'Recharger la config et lancer la course'}">▶ ${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Lancer') : 'Lancer'}</button>
        <button class="load" title="${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Charger la config sans lancer') : 'Charger la config sans lancer'}">${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Charger') : 'Charger'}</button>
        <button class="delete" title="${(window.I18n && window.I18n.tFr) ? window.I18n.tFr('Supprimer cette entrée') : 'Supprimer cette entrée'}">🗑️</button>
      </div>
    `;

    row.querySelector('.reload').addEventListener('click', async () => {
      await restoreSessionFromHistory(entry);
      setTimeout(() => launchGame(), 150);
    });

    row.querySelector('.load').addEventListener('click', async () => {
      await restoreSessionFromHistory(entry);
    });

    row.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Supprimer cette entrée de l'historique ?\n\n${entry.carName} • ${entry.trackName}`)) return;
      await window.api.deleteSessionHistoryEntry(entry.id);
      await loadSessionHistory();
    });

    container.appendChild(row);
  });
}

async function restoreSessionFromHistory(entry) {
  if (!entry || !entry.sessionData) {
    alert("Entrée d'historique invalide.");
    return;
  }
  const sd = entry.sessionData;

  const car = appData.cars.find(c => c.id === sd.car);
  if (car) {
    currentSelection.car = car;
    currentSelection.skin = car.skins.find(s => s.id === sd.skin) || car.skins[0] || null;
  }

  const track = appData.tracks.find(t => t.id === sd.track);
  if (track) {
    currentSelection.track = track;
    currentSelection.variant = track.variants.find(v => v.id === sd.layout) || track.variants[0] || null;
  }

  setValue('session-type', sd.sessionType || 'RACE');
  setValue('race-laps', sd.laps || 5);
  setValue('session-minutes', sd.sessionMinutes || 30);
  setValue('practice-minutes', sd.practiceMinutes || 0);
  setValue('qualify-minutes', sd.qualifyMinutes || 0);
  setValue('time-mult', sd.timeMult || 1);
  setValue('opponents-count', sd.opponentsCount || 0);
  setValue('grid-type', sd.gridType || 'RANDOM');
  setValue('starting-position-mode', sd.startingPositionMode || 'LAST');
  setValue('custom-start-pos', sd.customStartPos || 1);
  setValue('jump-start-penalty', sd.jumpStartPenalty || 0);
  setValue('ai-level', sd.aiLevel || 90);
  setValue('ai-level-var', sd.aiLevelVar || 5);
  setValue('ai-aggression', sd.aiAggression || 50);
  setValue('ai-aggression-var', sd.aiAggressionVar || 10);

  setValue('player-name', sd.driverName || 'Driver');
  setValue('online-name', sd.onlineName || '');
  setValue('steam-id', sd.steamId || '');

  setValue('weather-mode', sd.weatherMode || 'static');
  if (sd.weatherMode === 'static') {
    setValue('weather-select', sd.weather || '');
  } else if (sd.weatherMode === 'existing_plan') {
    setValue('pure-plan-select', sd.purePlan || '');
  } else if (sd.weatherMode === 'custom_plan') {
    setValue('custom-plan-name', sd.customPlanName || 'MonPlan');
    customPlanSteps = Array.isArray(sd.customPlanSteps) ? sd.customPlanSteps.slice() : [];
    renderWeatherSteps();
  }
  setChecked('plan-loop', !!sd.planLoop);
  setTimePickerFromString(sd.sessionStartTime || '12:00');

  setChecked('assist-auto-gearbox', !!(sd.assists && sd.assists.autoGearbox));
  setChecked('assist-auto-clutch', !!(sd.assists && sd.assists.autoclutch));
  setChecked('assist-autoblip', !!(sd.assists && sd.assists.autoblip));
  setChecked('assist-ideal-line', !!(sd.assists && sd.assists.idealLine));
  setValue('assist-tc', sd.assists?.tc ?? 1);
  setValue('assist-abs', sd.assists?.abs ?? 1);
  setValue('assist-stability', sd.assists?.stability ?? 0);
  setValue('fuel-rate', sd.assists?.fuelRate ?? 1);
  setValue('mechanical-damage', sd.assists?.mechanicalDamage ?? 100);
  setValue('tyre-wear', sd.assists?.tyreWear ?? 1);
  setValue('slipstream', sd.assists?.slipstream ?? 1);
  setChecked('tyre-blankets', !!(sd.assists && sd.assists.tyreBlankets));

  if (sd.pureCtrl && typeof sd.pureCtrl === 'object') {
    let autostart = !!sd.pureCtrl.autostart;
    let lastUsed = !!sd.pureCtrl.lastUsed;
    let live = !!sd.pureCtrl.live;
    if (autostart) { lastUsed = false; live = false; }
    else if (lastUsed) { live = false; }
    setChecked('purectrl-autostart', autostart);
    setChecked('purectrl-last-used', lastUsed);
    setChecked('purectrl-live', live);
    const sw = parseInt(sd.pureCtrl.startWetness, 10);
    const sp = parseInt(sd.pureCtrl.startPuddles, 10);
    setValue('purectrl-start-wetness', (!isNaN(sw) && sw >= 1) ? sw : 1);
    setValue('purectrl-start-puddles', (!isNaN(sp) && sp >= 1) ? sp : 1);
  }

  updateSessionUI();
  updateWeatherUI();
  updateSlidersDisplay();
  updateRecapSidebar();
  highlightSelectedCards();
  await saveCurrentState();
}

/* ============================================================
   LANCEMENT
   ============================================================ */
async function launchGame() {
  if (!currentSelection.car || !currentSelection.track) {
    alert("Sélectionne une voiture et un circuit.");
    return;
  }
  const weatherMode = getValue('weather-mode');
  if (weatherMode === 'custom_plan' && customPlanSteps.length === 0) {
    alert("Plan personnalisé vide.");
    return;
  }
  const btn = document.getElementById('btn-launch-game');
  btn.disabled = true; btn.innerText = "LANCEMENT...";

  try {
    const flagFile = getValue('player-flag');
    const flagInfo = flagFile
      ? { name: flagFileToCountryName(flagFile), code: flagFileToCountryName(flagFile).substring(0, 3).toUpperCase() }
      : { name: 'France', code: 'FRA' };

    // ⭐ Sélection du plan : route selon le planner actif (Pure prioritaire)
    const planner = getActivePlanner();
    let purePlanId = '';
    let solPlanId = '';

    if (weatherMode === 'existing_plan') {
      if (planner === 'sol') {
        const list = appData.solPlans || [];
        if (getChecked('pure-plan-random') && list.length > 0) {
          solPlanId = list[Math.floor(Math.random() * list.length)].id;
        } else {
          solPlanId = getValue('pure-plan-select');
        }
      } else {
        if (getChecked('pure-plan-random') && appData.purePlans.length > 0) {
          purePlanId = appData.purePlans[Math.floor(Math.random() * appData.purePlans.length)].id;
        } else {
          purePlanId = getValue('pure-plan-select');
        }
      }
    }

    const sessionData = {
      car: currentSelection.car.id,
      skin: currentSelection.skin?.id || '',
      track: currentSelection.track.id,
      layout: currentSelection.variant?.id || '',
      sessionType: getValue('session-type'),
      laps: parseInt(getValue('race-laps')) || 5,
      sessionMinutes: parseInt(getValue('session-minutes')) || 30,
      sessionStartTime: getTimeStringFromPicker(),
      practiceMinutes: parseInt(getValue('practice-minutes')) || 0,
      qualifyMinutes: parseInt(getValue('qualify-minutes')) || 0,
      timeMult: parseInt(getValue('time-mult')) || 1,
      opponentsCount: parseInt(getValue('opponents-count')) || 0,
      gridType: getValue('grid-type') || 'RANDOM',
      startingPositionMode: getValue('starting-position-mode') || 'LAST',
      customStartPos: parseInt(getValue('custom-start-pos')) || 1,
      jumpStartPenalty: parseInt(getValue('jump-start-penalty')) || 0,
      aiLevel: parseInt(getValue('ai-level')) || 90,
      aiLevelVar: parseInt(getValue('ai-level-var')) || 5,
      aiAggression: parseInt(getValue('ai-aggression')) || 50,
      aiAggressionVar: parseInt(getValue('ai-aggression-var')) || 10,
      weather: getValue('weather-select'),
      weatherMode: weatherMode,
      purePlan: purePlanId,
      solPlan: solPlanId,
      customPlanName: getValue('custom-plan-name') || 'MonPlan',
      customPlanSteps: customPlanSteps.slice(),
      planLoop: getChecked('plan-loop'),
      driverName: getValue('player-name') || 'Driver',
      onlineName: getValue('online-name') || '',
      steamId: getValue('steam-id') || '',
      nationality: flagInfo.name,
      nationCode: flagInfo.code,
      randomAiFlags: getChecked('random-ai-flags'),
      aiFlagsPool: (appData.flags || []).filter(f => !f.toLowerCase().startsWith('blank')),
      pureCtrl: {
        autostart: getChecked('purectrl-autostart'),
        lastUsed: getChecked('purectrl-last-used'),
        live: getChecked('purectrl-live'),
        startWetness: parseInt(getValue('purectrl-start-wetness'), 10) || 1,
        startPuddles: parseInt(getValue('purectrl-start-puddles'), 10) || 1
      },
      assists: {
        autoGearbox: getChecked('assist-auto-gearbox'),
        autoclutch: getChecked('assist-auto-clutch'),
        autoblip: getChecked('assist-autoblip'),
        idealLine: getChecked('assist-ideal-line'),
        tc: parseInt(getValue('assist-tc')) || 1,
        abs: parseInt(getValue('assist-abs')) || 1,
        stability: parseInt(getValue('assist-stability')) || 0,
        fuelRate: parseInt(getValue('fuel-rate')) || 1,
        mechanicalDamage: parseInt(getValue('mechanical-damage')) || 100,
        tyreWear: parseInt(getValue('tyre-wear')) || 1,
        slipstream: parseInt(getValue('slipstream')) || 1,
        tyreBlankets: getChecked('tyre-blankets')
      }
    };
    await window.api.launchGame(sessionData);

    bumpUsedCount('cars', currentSelection.car.id);
    bumpUsedCount('tracks', currentSelection.track.id);
    renderCarsGrid();
    renderTracksGrid();
  } catch (err) {
    alert(`Erreur : ${err.message}`);
  } finally {
    btn.disabled = false; btn.innerText = "▶ Démarrer la course";
  }
}