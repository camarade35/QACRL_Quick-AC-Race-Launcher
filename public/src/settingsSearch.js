// public/src/settingsSearch.js
// Recherche globale dans l'onglet Paramètres.
//
// Sources indexées :
//   Étape 2 : fichiers INI (controls, video, audio)
//   Étape 3 : modules CSP (extension/*.ini + templates)

(function (global) {
  'use strict';

  let initialized = false;
  let index = [];
  let indexReady = false;
  let indexPromise = null;

  // Cache des modules CSP chargés en mémoire (pour édition live)
  // { [filename]: { sections, savedContent } }
  const cspCache = {};

  // ---------------------------------------------------------------------------
  // Options "statiques" (hors INI) : identité, dossier AC, langue, rendu…
  // Chaque entrée sait lire/écrire sa valeur via l'API ou le DOM.
  // ---------------------------------------------------------------------------
  const STATIC_OPTIONS = [
    // --- Général : Identité ---
    {
      id: 'player-name',
      subtab: 'general',
      fileLabel: '⚙️ Général',
      sectionLabel: 'Identité du pilote',
      label: 'Nom du pilote (solo)',
      type: 'text',
      getValue: () => (document.getElementById('player-name') || {}).value || '',
      setValue: (v) => { const el = document.getElementById('player-name'); if (el) el.value = v; },
    },
    {
      id: 'online-name',
      subtab: 'general',
      fileLabel: '⚙️ Général',
      sectionLabel: 'Identité du pilote',
      label: 'Nom en ligne (multi)',
      type: 'text',
      getValue: () => (document.getElementById('online-name') || {}).value || '',
      setValue: (v) => { const el = document.getElementById('online-name'); if (el) el.value = v; },
    },
    {
      id: 'steam-id',
      subtab: 'general',
      fileLabel: '⚙️ Général',
      sectionLabel: 'Identité du pilote',
      label: 'Steam ID (GUID)',
      type: 'text',
      getValue: () => (document.getElementById('steam-id') || {}).value || '',
      setValue: (v) => { const el = document.getElementById('steam-id'); if (el) el.value = v; },
    },

    // --- Général : Interface ---
    {
      id: 'language-select',
      subtab: 'general',
      fileLabel: '⚙️ Général',
      sectionLabel: 'Langue / Language',
      label: 'Langue de l\'interface',
      type: 'select',
      options: [
        { value: 'fr', label: '🇫🇷 Français' },
        { value: 'en', label: '🇬🇧 English' },
      ],
      getValue: () => (document.getElementById('language-select') || {}).value || 'fr',
      setValue: (v) => { const el = document.getElementById('language-select'); if (el) el.value = v; },
      apply: async (v) => {
        if (window.I18n && typeof window.I18n.setLanguage === 'function') {
          const ok = await window.I18n.setLanguage(v);
          if (ok) {
            window.I18n.applyToDom();
            if (window.SettingsCsp && window.SettingsCsp.load) window.SettingsCsp.load();
          }
        }
      },
    },

    // --- Vidéo : Rendu ---
    {
      id: 'weatherfx-enabled',
      subtab: 'video',
      fileLabel: '🖥️ Vidéo',
      sectionLabel: 'Rendu — Style & Filtre',
      label: 'Weather FX — Activé',
      type: 'checkbox',
      getValue: async () => {
        const r = await window.api.getWeatherFxEnabled();
        return !!(r && r.success && r.enabled);
      },
      apply: async (v) => { await window.api.setWeatherFxEnabled(v); },
    },
    {
      id: 'weatherfx-style-select',
      subtab: 'video',
      fileLabel: '🖥️ Vidéo',
      sectionLabel: 'Rendu — Style & Filtre',
      label: 'Style Weather FX',
      type: 'select',
      options: [
        { value: 'default', label: 'Default (Kunos classique)' },
        { value: 'gamma',   label: 'Pure Gamma' },
        { value: 'lcs',     label: 'Pure LCS (linéaire)' },
      ],
      getValue: async () => {
        const r = await window.api.getWeatherFxStyle();
        return (r && r.success && r.style) || 'default';
      },
      apply: async (v) => { await window.api.setWeatherFxStyle(v); },
    },
    {
      id: 'render-pp-enabled',
      subtab: 'video',
      fileLabel: '🖥️ Vidéo',
      sectionLabel: 'Rendu — Style & Filtre',
      label: 'Filtre post-process (PP) — Activé',
      type: 'checkbox-static',
      getValue: async () => {
        const ed = window.SettingsIni.getEditor('video.ini');
        if (!ed || !ed.sections) {
          await window.SettingsIni.ensureLoaded('video.ini');
        }
        const ed2 = window.SettingsIni.getEditor('video.ini');
        if (!ed2 || !ed2.sections) return false;
        const sec = ed2.sections.find(s => s.name === 'POST_PROCESS');
        if (!sec) return false;
        const e = sec.entries.find(x => x.kind === 'kv' && x.key === 'ENABLED');
        return e && e.value === '1';
      },
      apply: async (v) => {
        const ed = window.SettingsIni.getEditor('video.ini');
        if (ed && ed.sections) {
          const sec = ed.sections.find(s => s.name === 'POST_PROCESS');
          if (sec) {
            const e = sec.entries.find(x => x.kind === 'kv' && x.key === 'ENABLED');
            if (e) e.value = v ? '1' : '0';
          }
        }
        await window.SettingsIni.saveByName('video.ini');
      },
    },
    {
      id: 'render-ppfilter-select',
      subtab: 'video',
      fileLabel: '🖥️ Vidéo',
      sectionLabel: 'Rendu — Style & Filtre',
      label: 'Filtre post-process (PP)',
      type: 'ppfilter',
      getValue: async () => {
        const ed = window.SettingsIni.getEditor('video.ini');
        if (!ed || !ed.sections) {
          await window.SettingsIni.ensureLoaded('video.ini');
        }
        const ed2 = window.SettingsIni.getEditor('video.ini');
        if (!ed2 || !ed2.sections) return '';
        const sec = ed2.sections.find(s => s.name === 'POST_PROCESS');
        if (!sec) return '';
        const e = sec.entries.find(x => x.kind === 'kv' && x.key === 'FILTER');
        return e ? e.value : '';
      },
      apply: async (v) => {
        const ed = window.SettingsIni.getEditor('video.ini');
        if (ed && ed.sections) {
          const sec = ed.sections.find(s => s.name === 'POST_PROCESS');
          if (sec) {
            const e = sec.entries.find(x => x.kind === 'kv' && x.key === 'FILTER');
            if (e) e.value = v;
          }
        }
        await window.SettingsIni.saveByName('video.ini');
      },
    },

    // --- Vidéo : Caméra libre ---
    {
      id: 'free-camera-enabled',
      subtab: 'video',
      fileLabel: '🖥️ Vidéo',
      sectionLabel: 'Caméra libre & Vue orbite',
      label: 'Autoriser la caméra libre (F5)',
      type: 'checkbox',
      getValue: async () => {
        const r = await window.api.getFreeCameraOptions();
        return !!(r && r.success && r.allowFreeCamera);
      },
      apply: async (v) => { await window.api.setFreeCameraOptions({ allowFreeCamera: v }); },
    },
    {
      id: 'orbit-mode-enabled',
      subtab: 'video',
      fileLabel: '🖥️ Vidéo',
      sectionLabel: 'Caméra libre & Vue orbite',
      label: 'Mode orbite pour la caméra F5',
      type: 'checkbox',
      getValue: async () => {
        const r = await window.api.getFreeCameraOptions();
        return !!(r && r.success && r.orbitMode);
      },
      apply: async (v) => { await window.api.setFreeCameraOptions({ orbitMode: v }); },
    },
  ];

  const pendingSaves = {};

  // ⭐ État du bandeau de sauvegarde
  // autoSaveDelay : 0 = manuel, sinon nombre de secondes
  const saveStatus = {
    pendingCount: 0,
    lastSavedAt: null,
    isSaving: false,
    autoSaveDelay: 0,
  };

  // ⭐ Set des fichiers ayant des modifications en attente
  const dirtyFiles = new Set();

  // ⭐ Paliers disponibles (valeur en secondes)
  const AUTO_SAVE_STEPS = [
    { value: 0,    labelKey: 'manual' },
    { value: 0.5,  label: '0.5s' },
    { value: 1,    label: '1s' },
    { value: 3,    label: '3s' },
    { value: 5,    label: '5s' },
    { value: 10,   label: '10s' },
    { value: 30,   label: '30s' },
    { value: 60,   label: '1min' },
    { value: 300,  label: '5min' },
    { value: 600,  label: '10min' },
    { value: 900,  label: '15min' },
    { value: 1200, label: '20min' },
    { value: 1500, label: '25min' },
    { value: 1800, label: '30min' },
    { value: 2100, label: '35min' },
    { value: 2400, label: '40min' },
    { value: 2700, label: '45min' },
    { value: 3000, label: '50min' },
    { value: 3300, label: '55min' },
    { value: 3600, label: '60min' },
  ];

  let saveBannerEl = null;

  // ---------------------------------------------------------------------------
  // Helpers UI
  // ---------------------------------------------------------------------------
  function getElements() {
    return {
      input:    document.getElementById('settings-global-search'),
      clearBtn: document.getElementById('settings-global-search-clear'),
      results:  document.getElementById('settings-search-results'),
      tab:      document.getElementById('tab-settings'),
    };
  }

  function setSearchingUI(active) {
    const els = getElements();
    if (!els.tab) return;
    els.tab.classList.toggle('searching', !!active);
    if (els.results) els.results.style.display = active ? '' : 'none';
    if (els.clearBtn) els.clearBtn.style.display = active ? '' : 'none';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // Construction de l'index
  // ---------------------------------------------------------------------------
  async function buildIndex() {
    const out = [];

    // --- ÉTAPE 2 : fichiers INI ---
    const INI_FILES = [
      { filename: 'controls.ini', subtab: 'controls', fileLabel: '🎮 Contrôles' },
      { filename: 'video.ini',    subtab: 'video',    fileLabel: '🖥️ Vidéo' },
      { filename: 'audio.ini',    subtab: 'audio',    fileLabel: '🔊 Audio' },
    ];

    for (const f of INI_FILES) {
      try {
        const res = await window.api.readIniFile(f.filename);
        if (!res || !res.success) continue;
        const sections = global.IniParser.parseIni(res.content);

        for (const sec of sections) {
          if (!sec.name) continue;
          if (global.IniSchema.isBlacklisted(sec.name)) continue;
          if (global.IniLayout && global.IniLayout.isSectionExcluded
              && global.IniLayout.isSectionExcluded(f.filename, sec.name)) continue;

          const secSchema = global.IniSchema.getSectionSchema(f.filename, sec.name);
          if (secSchema && secSchema.readOnly) continue;

          const secLabel = (secSchema && secSchema.label) || sec.name;
          const tabId = global.IniLayout ? global.IniLayout.getTabForSection(f.filename, sec.name) : null;

          for (const entry of sec.entries) {
            if (entry.kind !== 'kv') continue;
            if (global.IniLayout && global.IniLayout.isKeyExcluded
                && global.IniLayout.isKeyExcluded(f.filename, sec.name, entry.key)) continue;

            const keySchema = global.IniSchema.getKeySchema(f.filename, sec.name, entry.key);
            out.push({
              source: 'ini',
              filename: f.filename,
              subtab: f.subtab,
              fileLabel: f.fileLabel,
              sectionName: sec.name,
              sectionLabel: secLabel,
              tabId: tabId,
              key: entry.key,
              label: keySchema.label || entry.key,
              hint: '',
              schema: keySchema,
            });
          }
        }
      } catch (e) {
        console.warn('[SettingsSearch] buildIndex INI KO pour ' + f.filename, e);
      }
    }

    // --- ÉTAPE 3 : modules CSP ---
    try {
      const listRes = await window.api.listCspModules();
      if (listRes && listRes.success) {
        const existing = new Set(listRes.modules.map(m => m.filename));
        const allModules = global.CspModules.getModules();

        for (const mod of allModules) {
          const filename = mod.id + '.ini';
          if (!existing.has(filename)) continue;

          try {
            const data = await global.SettingsCsp.loadModuleForSearch(filename);
            if (!data || !data.sections) continue;

            // ⭐ Met en cache pour édition live
            cspCache[filename] = {
              sections: data.sections,
              savedContent: data.savedContent,
              moduleId: mod.id,
              moduleLabel: mod.label,
            };

            const i18n = window.I18n;

            for (const sec of data.sections) {
              if (sec.hidden) continue;
              const visibleEntries = sec.entries.filter(e => !e.hidden);
              if (visibleEntries.length === 0) continue;

              const secLabelRaw = sec.label || sec.name;
              const secLabelTranslated = i18n ? i18n.tSection(secLabelRaw) : secLabelRaw;
              const secHintRaw = sec.hint || '';
              const secHintTranslated = secHintRaw && i18n ? i18n.tHint(secHintRaw) : secHintRaw;

              for (const entry of visibleEntries) {
                const labelRaw = entry.label || entry.key;
                const labelTranslated = i18n ? i18n.tKey(labelRaw) : labelRaw;

                out.push({
                  source: 'csp',
                  filename: filename,
                  subtab: 'csp',
                  fileLabel: '🌩️ CSP › ' + mod.label,
                  moduleId: mod.id,
                  moduleLabel: mod.label,
                  sectionName: sec.name,
                  sectionLabel: secLabelRaw,
                  sectionLabelTranslated: secLabelTranslated,
                  key: entry.key,
                  label: labelRaw,
                  labelTranslated: labelTranslated,
                  hint: secHintRaw,
                  hintTranslated: secHintTranslated,
                  entry: entry,      // référence directe vers l'objet (pour édition)
                });
              }
            }
          } catch (e) {
            console.warn('[SettingsSearch] buildIndex CSP KO pour ' + filename, e);
          }
        }
      }
    } catch (e) {
      console.warn('[SettingsSearch] buildIndex CSP global KO', e);
    }

    // --- ÉTAPE 4 : options statiques (hors INI) ---
    for (const opt of STATIC_OPTIONS) {
      out.push({
        source: 'static',
        filename: null,
        subtab: opt.subtab,
        fileLabel: opt.fileLabel,
        sectionName: opt.sectionLabel,
        sectionLabel: opt.sectionLabel,
        sectionLabelTranslated: opt.sectionLabel,
        key: opt.id,
        label: opt.label,
        hint: '',
        staticDef: opt,
      });
    }

    return out;
  }

  async function ensureIndex() {
    if (indexReady) return index;
    if (!indexPromise) {
      indexPromise = buildIndex()
        .then((arr) => { index = arr; indexReady = true; return arr; })
        .catch((e) => { console.error('[SettingsSearch] buildIndex KO', e); index = []; indexReady = true; return []; })
        .finally(() => { indexPromise = null; });
    }
    return indexPromise;
  }

  // ---------------------------------------------------------------------------
  // Filtrage
  // ---------------------------------------------------------------------------
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function matchEntry(entry, query) {
    const q = normalize(query);
    if (!q) return true;

    const haystack = normalize([
      entry.label || '',
      entry.labelTranslated || '',
      entry.key || '',
      entry.hint || '',
      entry.hintTranslated || '',
      entry.sectionLabel || '',
      entry.sectionLabelTranslated || '',
      entry.fileLabel || '',
      entry.moduleLabel || '',
    ].join(' '));

    const words = q.split(/\s+/).filter(Boolean);
    return words.every(w => haystack.includes(w));
  }

  // ---------------------------------------------------------------------------
  // Rendu des résultats
  // ---------------------------------------------------------------------------
  function renderResults(query) {
    const els = getElements();
    if (!els.results) return;

    if (!query || !query.trim()) {
      els.results.innerHTML = '';
      if (saveBannerEl) saveBannerEl.style.display = 'none';
      setSearchingUI(false);
      return;
    }

    setSearchingUI(true);

    if (!indexReady) {
      els.results.innerHTML = '<div class="settings-search-loading">⏳ Construction de l\'index…</div>';
      return;
    }

    const matches = index.filter(e => matchEntry(e, query));

    if (matches.length === 0) {
      els.results.innerHTML =
        '<div class="settings-search-empty">' +
          '🔍 Aucune option ne correspond à <strong>' + escapeHtml(query) + '</strong>.<br>' +
          '<span style="font-size:0.8rem;">Essaie un autre mot-clé (ex: ombre, résolution, FFB…)</span>' +
        '</div>';
      return;
    }

    // Group by (source + filename + sectionName)
    const grouped = new Map();
    for (const entry of matches) {
      const key = entry.source + '::' + entry.filename + '::' + entry.sectionName;
      if (!grouped.has(key)) {
        grouped.set(key, {
          source: entry.source,
          filename: entry.filename,
          fileLabel: entry.fileLabel,
          subtab: entry.subtab,
          moduleId: entry.moduleId,
          sectionName: entry.sectionName,
          sectionLabel: entry.sectionLabel,
          sectionLabelTranslated: entry.sectionLabelTranslated,
          entries: [],
        });
      }
      grouped.get(key).entries.push(entry);
    }

    els.results.innerHTML = '';

    const countEl = document.createElement('div');
    countEl.className = 'settings-search-count';
    countEl.textContent = matches.length + ' résultat(s) pour "' + query + '"';
    els.results.appendChild(countEl);

    for (const group of grouped.values()) {
      const groupEl = renderGroup(group);
      if (groupEl) els.results.appendChild(groupEl);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendu d'un groupe
  // ---------------------------------------------------------------------------
  function renderGroup(group) {
    const wrap = document.createElement('div');
    wrap.className = 'settings-search-group';

    const header = document.createElement('div');
    header.className = 'settings-search-group-header';

    const fileSpan = document.createElement('span');
    fileSpan.className = 'settings-search-group-file';
    fileSpan.textContent = group.fileLabel;
    header.appendChild(fileSpan);

    const sep = document.createElement('span');
    sep.className = 'settings-search-group-sep';
    sep.textContent = '›';
    header.appendChild(sep);

    const secSpan = document.createElement('span');
    secSpan.className = 'settings-search-group-section';
    const secLabelTxt = group.sectionLabelTranslated
      || ((window.I18n && window.I18n.tFr) ? window.I18n.tFr(group.sectionLabel) : group.sectionLabel);
    secSpan.textContent = secLabelTxt;
    header.appendChild(secSpan);

    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'settings-search-group-jump';
    jump.textContent = '↗ Ouvrir';
    jump.title = 'Aller à cette section dans son onglet';
    jump.addEventListener('click', () => jumpToSection(group));
    header.appendChild(jump);

    wrap.appendChild(header);

    const body = document.createElement('div');
    body.className = 'settings-search-group-body';
    for (const entry of group.entries) {
      const row = buildResultRow(entry);
      if (row) body.appendChild(row);
    }
    wrap.appendChild(body);

    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Bandeau de sauvegarde (flottant en bas des résultats)
  // ---------------------------------------------------------------------------
    function ensureSaveBanner() {
    const els = getElements();
    if (!els.results) return null;
    if (saveBannerEl && document.body.contains(saveBannerEl)) return saveBannerEl;

    const i18n = window.I18n;
    const manualLabel = i18n ? i18n.t('app.settings.search.manual', 'Manuel') : 'Manuel';
    const delayLabelTxt = i18n ? i18n.t('app.settings.search.delayLabel', 'Auto :') : 'Auto :';

    saveBannerEl = document.createElement('div');
    saveBannerEl.className = 'settings-search-save-banner';
    saveBannerEl.style.display = 'none';

    // Status
    const statusSpan = document.createElement('span');
    statusSpan.className = 'settings-search-save-status';
    saveBannerEl.appendChild(statusSpan);

    // Select délai
    const delayWrap = document.createElement('div');
    delayWrap.className = 'settings-search-delay-wrap';

    const delayLabel = document.createElement('label');
    delayLabel.textContent = delayLabelTxt;
    delayWrap.appendChild(delayLabel);

    const sel = document.createElement('select');
    sel.className = 'settings-search-delay-select';
    sel.dataset.role = 'delay';
    for (const step of AUTO_SAVE_STEPS) {
      const opt = document.createElement('option');
      opt.value = String(step.value);
      opt.textContent = step.labelKey === 'manual' ? manualLabel : step.label;
      sel.appendChild(opt);
    }
    sel.value = String(saveStatus.autoSaveDelay);
    delayWrap.appendChild(sel);
    saveBannerEl.appendChild(delayWrap);

    // Bouton "Annuler les modifications"
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'settings-search-cancel-btn';
    cancelBtn.dataset.role = 'cancel';
    cancelBtn.textContent = '↶ ' + ((i18n && i18n.t('app.settings.search.cancel', 'Annuler')) || 'Annuler');
    cancelBtn.addEventListener('click', () => cancelAllChanges());
    saveBannerEl.appendChild(cancelBtn);

    // Bouton "Enregistrer maintenant"
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-search-save-btn';
    btn.dataset.role = 'save-now';
    btn.textContent = '💾 ' + ((i18n && i18n.t('app.settings.search.saveNow', 'Enregistrer maintenant')) || 'Enregistrer maintenant');
    btn.addEventListener('click', () => forceSaveAll());
    saveBannerEl.appendChild(btn);

    // ⭐ Select change → met à jour le délai + persiste
    sel.addEventListener('change', async () => {
      const newDelay = parseFloat(sel.value) || 0;
      saveStatus.autoSaveDelay = newDelay;
      try {
        const settings = await window.api.getSettings();
        settings.autoSaveSearchDelay = newDelay;
        await window.api.saveSettings(settings);
      } catch (e) { console.warn('[SettingsSearch] save delay KO', e); }

      // ⭐ Si on active l'auto et qu'il y a du pending → on déclenche les saves
      if (newDelay > 0) {
        for (const key of Object.keys(pendingSaves)) {
          if (key.startsWith('ini:')) scheduleSaveIni(key.slice(4));
          else if (key.startsWith('csp:')) scheduleSaveCsp(key.slice(4));
        }
      }
    });

    document.body.appendChild(saveBannerEl);
    return saveBannerEl;
  }

  function renderSaveBanner() {
    const banner = ensureSaveBanner();
    if (!banner) return;

    const i18n = window.I18n;
    const statusEl = banner.querySelector('.settings-search-save-status');
    const btnEl = banner.querySelector('[data-role="save-now"]');

    if (saveStatus.pendingCount === 0 && !saveStatus.isSaving) {
      // ⭐ Rien en attente : on montre juste "Enregistré à HH:MM" pendant 3s
      if (saveStatus.lastSavedAt && (Date.now() - saveStatus.lastSavedAt) < 3000) {
        banner.style.display = '';
        banner.classList.remove('is-pending');
        banner.classList.add('is-saved');
        const t = new Date(saveStatus.lastSavedAt).toLocaleTimeString();
        statusEl.textContent = (i18n ? i18n.t('app.settings.search.savedAt', '✅ Enregistré à {time}') : '✅ Enregistré à {time}').replace('{time}', t);
        btnEl.style.display = 'none';
        setTimeout(() => { renderSaveBanner(); }, 3100);
      } else {
        banner.style.display = 'none';
      }
      return;
    }

    // ⭐ En attente ou en cours
    banner.style.display = '';
    banner.classList.remove('is-saved');
    banner.classList.add('is-pending');

    if (saveStatus.isSaving) {
      statusEl.textContent = i18n ? i18n.t('app.settings.search.saving', '⏳ Enregistrement…') : '⏳ Enregistrement…';
      btnEl.disabled = true;
    } else {
      const txt = i18n
        ? i18n.t('app.settings.search.pending', '{count} fichier(s) modifié(s)')
        : '{count} fichier(s) modifié(s)';
      statusEl.textContent = '📝 ' + txt.replace('{count}', saveStatus.pendingCount);
      btnEl.disabled = false;
    }
    btnEl.style.display = '';
  }
  
    async function cancelAllChanges() {
    if (saveStatus.pendingCount === 0) return;

    const i18n = window.I18n;
    const msg = i18n
      ? i18n.t('app.settings.search.confirmCancel',
          'Annuler {count} fichier(s) modifié(s) ? Les modifications non enregistrées seront perdues.')
          .replace('{count}', saveStatus.pendingCount)
      : 'Annuler ' + saveStatus.pendingCount + ' fichier(s) modifié(s) ? Les modifications non enregistrées seront perdues.';

    const ok = window.QacrlDialogs
      ? await window.QacrlDialogs.confirm(msg, { variant: 'warning' })
      : confirm(msg);
    if (!ok) return;

    // Stoppe tous les timers pending
    for (const key of Object.keys(pendingSaves)) {
      if (pendingSaves[key]) clearTimeout(pendingSaves[key]);
      pendingSaves[key] = null;
    }

    // ⭐ Recharge chaque fichier modifié depuis le disque
    const toReload = Array.from(dirtyFiles);
    for (const key of toReload) {
      try {
        if (key.startsWith('ini:')) {
          const filename = key.slice(4);
          await window.SettingsIni.reloadByName(filename);
        } else if (key.startsWith('csp:')) {
          const filename = key.slice(4);
          const fresh = await window.SettingsCsp.loadModuleForSearch(filename);
          if (fresh) {
            cspCache[filename] = {
              sections: fresh.sections,
              savedContent: fresh.savedContent,
            };
          }
        }
      } catch (e) {
        console.warn('[SettingsSearch] cancel KO', key, e);
      }
    }

    // Vider l'état
    dirtyFiles.clear();
    saveStatus.pendingCount = 0;
    saveStatus.lastSavedAt = null;

    // Re-render les résultats pour reconstruire les widgets avec les vraies valeurs
    const els = getElements();
    if (els.input && els.input.value.trim()) {
      renderResults(els.input.value);
    }
    renderSaveBanner();
  }

  async function forceSaveAll() {
    // ⭐ En mode auto-save OFF, pendingSaves[key] est null mais pendingCount > 0
    // On doit donc sauvegarder TOUS les fichiers qui ont été modifiés
    const keys = Object.keys(pendingSaves);
    for (const k of keys) {
      if (pendingSaves[k]) clearTimeout(pendingSaves[k]);
      pendingSaves[k] = null;
    }
    if (saveStatus.pendingCount === 0 && keys.length === 0) return;

    saveStatus.isSaving = true;
    renderSaveBanner();

    for (const key of keys) {
      try {
        if (key.startsWith('ini:')) {
          await window.SettingsIni.saveByName(key.slice(4));
        } else if (key.startsWith('csp:')) {
          const filename = key.slice(4);
          const cached = cspCache[filename];
          if (cached) await window.SettingsCsp.saveCspModuleByName(filename, cached.sections);
        }
      } catch (e) {
        console.warn('[SettingsSearch] forceSaveAll KO', key, e);
      }
    }

    saveStatus.isSaving = false;
    dirtyFiles.clear();
    saveStatus.pendingCount = 0;
    saveStatus.lastSavedAt = Date.now();
    renderSaveBanner();
  }

  // ---------------------------------------------------------------------------
  // Rendu d'une ligne de résultat (INI ou CSP)
  // ---------------------------------------------------------------------------
  function buildResultRow(entry) {
    if (entry.source === 'csp')    return buildCspResultRow(entry);
    if (entry.source === 'static') return buildStaticResultRow(entry);
    return buildIniResultRow(entry);
  }

  // ---------------------------------------------------------------------------
  // Ligne INI (réutilise IniControls)
  // ---------------------------------------------------------------------------
  function buildIniResultRow(entry) {
    const ed = window.SettingsIni && window.SettingsIni.getEditor
      ? window.SettingsIni.getEditor(entry.filename)
      : null;

    if (!ed || !ed.sections) {
      const ph = document.createElement('div');
      ph.className = 'ini-row';
      ph.style.opacity = '0.5';
      ph.style.fontStyle = 'italic';
      ph.textContent = '⏳ Chargement…';
      window.SettingsIni.ensureLoaded(entry.filename).then(() => {
        const els = getElements();
        const cur = els.input ? els.input.value : '';
        if (cur && cur.trim()) renderResults(cur);
      });
      return ph;
    }

    const sec = ed.sections.find(s => s.name === entry.sectionName);
    if (!sec) return null;

    const sectionHelpers = buildSectionHelpers(sec);
    const siblingWidgets = {};
    const acControllers = getAcControllersList(ed);

    let ctrl;
    try {
      ctrl = window.IniControls.createIniControl({
        filename: entry.filename,
        section: entry.sectionName,
        key: entry.key,
        value: getRawValue(sec, entry.key),
        schema: entry.schema,
        ppfilters: ed.ppfilters || [],
        sectionHelpers: sectionHelpers,
        siblingWidgets: siblingWidgets,
        gamepadMapper: ed.gamepadMapper || null,
        sectionContext: { controllers: acControllers },
        onChange: (newVal) => {
          window.SettingsIni.setValueInEditor(entry.filename, entry.sectionName, entry.key, newVal);
          scheduleSaveIni(entry.filename);
        },
      });
    } catch (e) {
      console.error('[SettingsSearch] widget INI KO', entry, e);
      return null;
    }

    const row = ctrl.element;

    if (entry.filename === 'controls.ini' && ed.gamepadMapper && typeof ctrl.startLive === 'function') {
      try { ctrl.startLive(); } catch (e) {}
    }

    return row;
  }

  // ---------------------------------------------------------------------------
  // Ligne CSP (réutilise createCspWidget de settingsCsp.js)
  // ---------------------------------------------------------------------------
  function buildCspResultRow(entry) {
    // Vérifie que le cache est dispo
    const cached = cspCache[entry.filename];
    if (!cached) {
      const ph = document.createElement('div');
      ph.className = 'csp-opt-row';
      ph.style.opacity = '0.5';
      ph.style.fontStyle = 'italic';
      ph.textContent = '⏳ Module non chargé';
      return ph;
    }

    // Retrouve la section + l'entry réels depuis le cache
    const sec = cached.sections.find(s => s.name === entry.sectionName);
    if (!sec) return null;
    const realEntry = sec.entries.find(e => e.key === entry.key);
    if (!realEntry) return null;

    const row = document.createElement('div');
    row.className = 'csp-opt-row';

    const i18n = window.I18n;
    const labelText = i18n ? i18n.tKey(realEntry.label) : realEntry.label;
    const tooltipText = i18n
      ? i18n.tConstraints(realEntry.rawConstraints || '')
      : (realEntry.rawConstraints || '');

    const labelEl = document.createElement('label');
    labelEl.className = 'csp-opt-label';
    labelEl.textContent = labelText;
    labelEl.title = tooltipText;
    row.appendChild(labelEl);

    const widget = window.SettingsCsp.createCspWidget(realEntry, () => {
      scheduleSaveCsp(entry.filename);
    });
    row.appendChild(widget);

    return row;
  }

  // ---------------------------------------------------------------------------
  // Ligne "static" (hors INI : identité, langue, rendu…)
  // ---------------------------------------------------------------------------
  function buildStaticResultRow(entry) {
    const def = entry.staticDef;
    if (!def) return null;

    const row = document.createElement('div');
    row.className = 'ini-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'ini-label';
    labelEl.textContent = def.label;
    row.appendChild(labelEl);

    const i18n = window.I18n;

    // ⭐ Switch selon le type
    if (def.type === 'checkbox' || def.type === 'checkbox-static') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ini-checkbox';
      cb.disabled = true;  // désactivé le temps du fetch
      row.appendChild(cb);

      Promise.resolve(def.getValue()).then((v) => {
        cb.checked = !!v;
        cb.disabled = false;
      }).catch(() => { cb.disabled = false; });

      cb.addEventListener('change', async () => {
        const newVal = cb.checked;
        cb.disabled = true;
        try {
          await def.apply(newVal);
          flashSaved(row);
        } catch (e) {
          console.warn('[SettingsSearch] static save KO', def.id, e);
          cb.checked = !newVal;
        } finally {
          cb.disabled = false;
        }
      });
    } else if (def.type === 'select') {
      const sel = document.createElement('select');
      sel.className = 'ini-select';
      sel.disabled = true;
      for (const o of def.options || []) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      }
      row.appendChild(sel);

      Promise.resolve(def.getValue()).then((v) => {
        sel.value = v;
        sel.disabled = false;
      }).catch(() => { sel.disabled = false; });

      sel.addEventListener('change', async () => {
        const newVal = sel.value;
        sel.disabled = true;
        try {
          await def.apply(newVal);
          flashSaved(row);
        } catch (e) {
          console.warn('[SettingsSearch] static select KO', def.id, e);
        } finally {
          sel.disabled = false;
        }
      });
    } else if (def.type === 'ppfilter') {
      // Select avec filtres PP chargés depuis l'API
      const sel = document.createElement('select');
      sel.className = 'ini-select';
      sel.disabled = true;
      row.appendChild(sel);

      (async () => {
        try {
          const [filtersRes, currentVal] = await Promise.all([
            window.api.listPpfilters().catch(() => ({ success: false, filters: [] })),
            Promise.resolve(def.getValue()),
          ]);
          const filters = (filtersRes && filtersRes.success && filtersRes.filters) || [];
          if (currentVal && !filters.includes(currentVal)) filters.push(currentVal);
          sel.innerHTML = '';
          for (const f of filters) {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            if (f === currentVal) opt.selected = true;
            sel.appendChild(opt);
          }
        } catch (e) {
          console.warn('[SettingsSearch] ppfilter KO', e);
        } finally {
          sel.disabled = false;
        }
      })();

      sel.addEventListener('change', async () => {
        const newVal = sel.value;
        sel.disabled = true;
        try {
          await def.apply(newVal);
          flashSaved(row);
        } catch (e) {
          console.warn('[SettingsSearch] ppfilter save KO', e);
        } finally {
          sel.disabled = false;
        }
      });
    } else {
      // Text (par défaut)
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'ini-text';
      inp.value = def.getValue();
      row.appendChild(inp);

      let debounceTimer = null;
      inp.addEventListener('input', () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          try {
            def.setValue(inp.value);
            await saveCurrentState();
            flashSaved(row);
          } catch (e) {
            console.warn('[SettingsSearch] static text save KO', def.id, e);
          }
        }, 600);
      });
    }

    return row;
  }

  // Petit feedback visuel "saved"
  function flashSaved(rowEl) {
    if (!rowEl) return;
    rowEl.style.transition = 'background 0.4s';
    rowEl.style.background = 'rgba(76, 175, 80, 0.15)';
    setTimeout(() => { rowEl.style.background = ''; }, 600);
  }

  function getRawValue(sec, key) {
    const e = sec.entries.find(x => x.kind === 'kv' && x.key === key);
    return e ? e.value : '';
  }

  function buildSectionHelpers(sec) {
    return {
      getValue: (k) => {
        const e = sec.entries.find(x => x.kind === 'kv' && x.key === k);
        return e ? e.value : null;
      },
      setValue: (k, v) => {
        const e = sec.entries.find(x => x.kind === 'kv' && x.key === k);
        if (e) { e.value = v; return true; }
        return false;
      },
      hasKey: (k) => sec.entries.some(x => x.kind === 'kv' && x.key === k),
    };
  }

  function getAcControllersList(ed) {
    if (ed.file !== 'controls.ini' || !ed.sections) return [];
    const ctrlSec = ed.sections.find(s => s.name === 'CONTROLLERS');
    if (!ctrlSec) return [];
    const tmpMap = {};
    for (const e of ctrlSec.entries) {
      if (e.kind !== 'kv') continue;
      const m = e.key.match(/^CON(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        if (!tmpMap[idx]) tmpMap[idx] = { index: idx };
        tmpMap[idx].name = e.value;
      }
    }
    return Object.values(tmpMap).sort((a, b) => a.index - b.index);
  }

  // ---------------------------------------------------------------------------
  // Saves débounced
  // ---------------------------------------------------------------------------
      function scheduleSaveIni(filename) {
    const key = 'ini:' + filename;

    if (pendingSaves[key]) clearTimeout(pendingSaves[key]);
    dirtyFiles.add(key);
    saveStatus.pendingCount = dirtyFiles.size;

    renderSaveBanner();

    // ⭐ 0 = Manuel → pas de timer
    if (saveStatus.autoSaveDelay <= 0) return;

    pendingSaves[key] = setTimeout(async () => {
      pendingSaves[key] = null;
      saveStatus.isSaving = true;
      renderSaveBanner();
      try {
        await window.SettingsIni.saveByName(filename);
        saveStatus.lastSavedAt = Date.now();
      } catch (e) {
        console.warn('[SettingsSearch] save INI KO', filename, e);
      }
      saveStatus.isSaving = false;
      dirtyFiles.delete(key);
      saveStatus.pendingCount = dirtyFiles.size;
      renderSaveBanner();
    }, Math.round(saveStatus.autoSaveDelay * 1000));
  }

  function scheduleSaveCsp(filename) {
    const key = 'csp:' + filename;

    if (pendingSaves[key]) clearTimeout(pendingSaves[key]);
    dirtyFiles.add(key);
    saveStatus.pendingCount = dirtyFiles.size;

    renderSaveBanner();

    if (saveStatus.autoSaveDelay <= 0) return;

    pendingSaves[key] = setTimeout(async () => {
      pendingSaves[key] = null;
      const cached = cspCache[filename];
      if (!cached) {
        saveStatus.pendingCount = Math.max(0, saveStatus.pendingCount - 1);
        renderSaveBanner();
        return;
      }
      saveStatus.isSaving = true;
      renderSaveBanner();
      try {
        const ok = await window.SettingsCsp.saveCspModuleByName(filename, cached.sections);
        if (ok) saveStatus.lastSavedAt = Date.now();
        else console.warn('[SettingsSearch] save CSP refusé', filename);
      } catch (e) {
        console.warn('[SettingsSearch] save CSP KO', filename, e);
      }
      saveStatus.isSaving = false;
      dirtyFiles.delete(key);
      saveStatus.pendingCount = dirtyFiles.size;
      renderSaveBanner();
    }, Math.round(saveStatus.autoSaveDelay * 1000));
  }

  // ---------------------------------------------------------------------------
  // "Ouvrir" → switch d'onglet
  // ---------------------------------------------------------------------------
  function jumpToSection(group) {
    const map = {
      'controls.ini': 'subtab-settings-controls',
      'video.ini':    'subtab-settings-video',
      'audio.ini':    'subtab-settings-audio',
    };

    let subtabId = map[group.filename];
    if (group.source === 'csp') subtabId = 'subtab-settings-csp';
    if (!subtabId) return;

    const btn = document.querySelector('.subtab-btn[onclick*="' + subtabId + '"]');
    if (btn) btn.click();

    const els = getElements();
    if (els.input) els.input.value = '';
    renderResults('');
  }

  // ---------------------------------------------------------------------------
  // Écouteurs
  // ---------------------------------------------------------------------------
  function onInputChange(e) {
    const q = e.target.value || '';
    if (q.trim() && !indexReady) {
      ensureIndex().then(() => renderResults(q));
    } else {
      renderResults(q);
    }
  }

  function onClear() {
    const els = getElements();
    if (els.input) {
      els.input.value = '';
      els.input.focus();
    }
    renderResults('');
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    if (initialized) return;
    initialized = true;

    const els = getElements();
    if (!els.input) return;

    // ⭐ Charge la préférence auto-save
    (async () => {
      try {
        const settings = await window.api.getSettings();
        const v = settings && settings.autoSaveSearchDelay;
        if (typeof v === 'number' && v >= 0) {
          saveStatus.autoSaveDelay = v;
        }
      } catch (e) { /* ignore */ }
    })();

    els.input.addEventListener('input', onInputChange);
    if (els.clearBtn) els.clearBtn.addEventListener('click', onClear);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const tabSettings = document.getElementById('tab-settings');
        if (tabSettings && tabSettings.classList.contains('active')) {
          e.preventDefault();
          els.input.focus();
          els.input.select();
        }
      }
    });

    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.input.value) {
        e.preventDefault();
        onClear();
      }
    });
  }

  global.SettingsSearch = { init, ensureIndex, renderResults };
})(window);