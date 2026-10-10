// public/src/settingsIni.js
// Logique des onglets Paramètres > Contrôles / Vidéo / Audio.
// Lit un INI, le parse, génère les widgets, gère Formulaire/Expert + sauvegarde.

(function (global) {
  'use strict';

  const editors = {}; // { 'controls.ini': {...} }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function setStatus(ed, text, color) {
    if (!ed || !ed.statusEl) return;
    ed.statusEl.textContent = text || '';
    ed.statusEl.style.color = color || 'var(--text-tertiary)';
  }

  function checkApi() {
    if (!window.api) return 'window.api indisponible';
    if (typeof window.api.readIniFile  !== 'function') return 'api.readIniFile indisponible (redémarre l\'app)';
    if (typeof window.api.writeIniFile !== 'function') return 'api.writeIniFile indisponible (redémarre l\'app)';
    if (!global.IniParser)   return 'IniParser non chargé';
    if (!global.IniSchema)   return 'IniSchema non chargé';
    if (!global.IniControls) return 'IniControls non chargé';
    return null;
  }

  // -------------------------------------------------------------------------
  // Chargement
  // -------------------------------------------------------------------------
  async function ensureLoaded(filename) {
    const ed = editors[filename];
    if (!ed || ed.loaded || ed.loading) return;

    // ⭐ Prépare un gamepadMapper pour controls.ini (matching Chromium ↔ AC)
    if (filename === 'controls.ini' && global.GamepadMapper) {
      // On le créera après le parsing, mais il faut qu'il soit construit à partir des sections parsées
    }

    const apiErr = checkApi();
    if (apiErr) {
      setStatus(ed, '⚠️ ' + apiErr, '#ff6b6b');
      console.error('[settingsIni]', apiErr);
      return;
    }

    ed.loading = true;
    setStatus(ed, '⏳ Chargement...');

    try {
      const res = await window.api.readIniFile(filename);
      if (!res || !res.success) {
        throw new Error((res && res.error) || 'Réponse invalide du process principal');
      }
      ed.rawContent = res.content;
      ed.sections   = global.IniParser.parseIni(res.content);
      ed.loaded     = true;
      ed.dirty      = false;

      // ⭐ Crée un gamepadMapper pour controls.ini
      if (filename === 'controls.ini' && global.GamepadMapper) {
        ed.gamepadMapper = global.GamepadMapper.create(ed.sections);
      }

      setStatus(ed, '');
      renderCurrentView(ed);
    } catch (e) {
      console.error('[settingsIni] chargement KO', filename, e);
      setStatus(ed, '⚠️ ' + e.message, '#ff6b6b');
    } finally {
      ed.loading = false;
    }
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  function renderCurrentView(ed) {
    try {
      if (ed.mode === 'form') renderForm(ed);
      else renderExpert(ed);
    } catch (e) {
      console.error('[settingsIni] render KO', e);
      setStatus(ed, '⚠️ Erreur d\'affichage : ' + e.message, '#ff6b6b');
    }
  }

    function renderForm(ed) {
    ed.formEl.innerHTML = '';
    if (!ed.sections) {
      ed.formEl.innerHTML = '<div style="padding:20px;color:var(--text-tertiary);">Aucune donnée chargée.</div>';
      return;
    }

    const layout = global.IniLayout ? global.IniLayout.getLayout(ed.file) : null;

    // Pas de layout → affichage linéaire classique
    if (!layout) {
      renderFormLinear(ed, ed.sections);
      if (ed.tabsEl) ed.tabsEl.innerHTML = '';
      return;
    }

    // Rendu des onglets secondaires
    renderTabs(ed, layout);

    // Récupère la config de l'onglet actif
    const activeTab = layout.tabs.find(t => t.id === ed.currentTab) || layout.tabs[0];
    if (!activeTab) return;

    // Construit une map sectionName → section parsée
    const sectionMap = {};
    for (const s of ed.sections) sectionMap[s.name] = s;

    // Set des sections déjà placées (pour identifier les orphelines)
    const usedSections = new Set();

    let count = 0;

    // Si l'onglet a des groupes définis → on les rend
    if (activeTab.groups && activeTab.groups.length > 0) {
      for (const group of activeTab.groups) {
        if (group.type === 'single') {
          const sec = sectionMap[group.section];
          if (!sec) continue;
          usedSections.add(group.section);
          const el = renderSingleSection(ed, sec, group.label);
          if (el) { ed.formEl.appendChild(el); count++; }
        } else if (group.type === 'pair') {
          const el = renderPairGroup(ed, group, sectionMap);
          if (el) {
            group.sections.forEach(s => usedSections.add(s.section));
            ed.formEl.appendChild(el);
            count += group.sections.length;
          }
        }
      }
    } else {
      // Onglet sans groupes définis (ex : video.ini, audio.ini) → tout afficher
      for (const sec of ed.sections) {
        if (global.IniSchema.isBlacklisted(sec.name)) continue;
        if (sec.entries.filter(e => e.kind === 'kv').length === 0) continue;
        usedSections.add(sec.name);
        const el = renderSingleSection(ed, sec, null);
        if (el) { ed.formEl.appendChild(el); count++; }
      }
    }

    // Fallback : sections orphelines dans l'onglet "Avancé"
    if (activeTab.isFallback) {
      const orphans = [];
      for (const sec of ed.sections) {
        if (usedSections.has(sec.name)) continue;
        if (global.IniSchema.isBlacklisted(sec.name)) continue;
        if (sec.entries.filter(e => e.kind === 'kv').length === 0) continue;
        orphans.push(sec);
      }
      if (orphans.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'ini-section-separator';
        sep.textContent = 'Autres sections';
        ed.formEl.appendChild(sep);

        for (const sec of orphans) {
          const el = renderSingleSection(ed, sec, null);
          if (el) { ed.formEl.appendChild(el); count++; }
        }
      }
    }

    if (count === 0) {
      ed.formEl.innerHTML =
        '<div style="padding:20px;color:var(--text-tertiary);">Aucune section dans cet onglet.</div>';
    }
  }

  // -------------------------------------------------------------------------
  // Rendu de la barre d'onglets secondaires
  // -------------------------------------------------------------------------
  function renderTabs(ed, layout) {
    if (!ed.tabsEl) return;
    ed.tabsEl.innerHTML = '';

    if (!layout.tabs || layout.tabs.length <= 1) {
      ed.tabsEl.style.display = 'none';
      return;
    }
    ed.tabsEl.style.display = '';

    for (const tab of layout.tabs) {
      const btn = document.createElement('button');
      btn.className = 'ini-tab-btn';
      btn.textContent = tab.label;
      if (tab.id === ed.currentTab) btn.classList.add('active');
      btn.addEventListener('click', () => {
        ed.currentTab = tab.id;
        try { localStorage.setItem('iniActiveTab:' + ed.file, tab.id); } catch (e) {}
        ed.tabsEl.querySelectorAll('.ini-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderForm(ed);
      });
      ed.tabsEl.appendChild(btn);
    }
  }

  // -------------------------------------------------------------------------
  // Rendu d'une section simple
  // -------------------------------------------------------------------------
  function renderSingleSection(ed, sec, customLabel) {
    const kvEntries = sec.entries.filter(e => e.kind === 'kv');
    if (kvEntries.length === 0) return null;

    const secSchema = global.IniSchema.getSectionSchema(ed.file, sec.name);
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'ini-section';
    sectionDiv.dataset.sectionName = sec.name;

    const headerEl = document.createElement('div');
    headerEl.className = 'ini-section-header';

    const arrowEl = document.createElement('span');
    arrowEl.className = 'ini-section-arrow';
    arrowEl.textContent = '▸';
    headerEl.appendChild(arrowEl);

    const labelEl = document.createElement('span');
    labelEl.className = 'ini-section-label';
    labelEl.textContent = customLabel
      || (secSchema && secSchema.label)
      || sec.name;
    headerEl.appendChild(labelEl);

    if ((secSchema && secSchema.label && secSchema.label !== sec.name) || customLabel) {
      const rawEl = document.createElement('span');
      rawEl.className = 'ini-section-raw';
      rawEl.textContent = ' [' + sec.name + ']';
      headerEl.appendChild(rawEl);
    }

    const storageKey = 'iniCollapse:' + ed.file + ':' + sec.name;
    const defaultCollapsed = (ed.file === 'controls.ini');
    let collapsed;
    try {
      const saved = localStorage.getItem(storageKey);
      collapsed = (saved === null) ? defaultCollapsed : (saved === '1');
    } catch (e) { collapsed = defaultCollapsed; }

    if (collapsed) sectionDiv.classList.add('collapsed');
    headerEl.addEventListener('click', () => {
      collapsed = !collapsed;
      sectionDiv.classList.toggle('collapsed', collapsed);
      try { localStorage.setItem(storageKey, collapsed ? '1' : '0'); } catch (e) {}
    });
    sectionDiv.appendChild(headerEl);

    const readOnly = secSchema && secSchema.readOnly;

    // Helpers pour widgets
    const sectionHelpers = buildSectionHelpers(sec);
    const siblingWidgets = {};
    const acControllersForUI = getAcControllersList(ed);

    for (const entry of sec.entries) {
      if (entry.kind !== 'kv') continue;
      const schema = global.IniSchema.getKeySchema(ed.file, sec.name, entry.key);
      let ctrl;
      try {
        ctrl = global.IniControls.createIniControl({
          filename:  ed.file, section: sec.name, key: entry.key,
          value:     entry.value,
          schema:    schema,
          ppfilters: ed.ppfilters || [],
          sectionHelpers: sectionHelpers,
          siblingWidgets: siblingWidgets,
          gamepadMapper:  ed.gamepadMapper || null,
          sectionContext: { controllers: acControllersForUI },
          onChange: (newVal) => { entry.value = newVal; markDirty(ed); }
        });
      } catch (e) {
        console.error('[settingsIni] widget KO', sec.name, entry.key, e);
        continue;
      }
      if (readOnly) {
        ctrl.element.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
      }
      siblingWidgets[entry.key] = ctrl;
      sectionDiv.appendChild(ctrl.element);
    }

    return sectionDiv;
  }

  // -------------------------------------------------------------------------
  // Rendu d'un groupe PAIR (2 sections côte à côte)
  // -------------------------------------------------------------------------
  function renderPairGroup(ed, group, sectionMap) {
    const secA = sectionMap[group.sections[0].section];
    const secB = sectionMap[group.sections[1].section];
    if (!secA && !secB) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'ini-section ini-section-pair';

    const headerEl = document.createElement('div');
    headerEl.className = 'ini-section-header';
    const arrowEl = document.createElement('span');
    arrowEl.className = 'ini-section-arrow';
    arrowEl.textContent = '▸';
    headerEl.appendChild(arrowEl);
    const labelEl = document.createElement('span');
    labelEl.className = 'ini-section-label';
    labelEl.textContent = group.label;
    headerEl.appendChild(labelEl);

    // Clé de collapse basée sur les 2 sections
    const collapseKey = 'iniCollapsePair:' + ed.file + ':' + secA?.name + '+' + secB?.name;
    let collapsed;
    try {
      const saved = localStorage.getItem(collapseKey);
      collapsed = (saved === null) ? true : (saved === '1');  // paires repliées par défaut
    } catch (e) { collapsed = true; }

    if (collapsed) wrapper.classList.add('collapsed');
    headerEl.addEventListener('click', () => {
      collapsed = !collapsed;
      wrapper.classList.toggle('collapsed', collapsed);
      try { localStorage.setItem(collapseKey, collapsed ? '1' : '0'); } catch (e) {}
    });
    wrapper.appendChild(headerEl);

    const gridEl = document.createElement('div');
    gridEl.className = 'ini-pair-grid';

    const buildCol = (sec, colLabel) => {
      const col = document.createElement('div');
      col.className = 'ini-pair-col';
      const titleEl = document.createElement('div');
      titleEl.className = 'ini-pair-col-label';
      titleEl.textContent = colLabel;
      col.appendChild(titleEl);

      if (!sec) {
        col.appendChild(document.createTextNode('(section absente)'));
        return col;
      }

      const sectionHelpers = buildSectionHelpers(sec);
      const siblingWidgets = {};
      const acControllersForUI = getAcControllersList(ed);
      const readOnly = (global.IniSchema.getSectionSchema(ed.file, sec.name) || {}).readOnly;

      for (const entry of sec.entries) {
        if (entry.kind !== 'kv') continue;
        const schema = global.IniSchema.getKeySchema(ed.file, sec.name, entry.key);
        let ctrl;
        try {
          ctrl = global.IniControls.createIniControl({
            filename:  ed.file, section: sec.name, key: entry.key,
            value:     entry.value,
            schema:    schema,
            ppfilters: ed.ppfilters || [],
            sectionHelpers: sectionHelpers,
            siblingWidgets: siblingWidgets,
            gamepadMapper:  ed.gamepadMapper || null,
            sectionContext: { controllers: acControllersForUI },
            onChange: (newVal) => { entry.value = newVal; markDirty(ed); }
          });
        } catch (e) {
          console.error('[settingsIni] widget KO (pair)', sec.name, entry.key, e);
          continue;
        }
        if (readOnly) {
          ctrl.element.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
        }
        siblingWidgets[entry.key] = ctrl;
        col.appendChild(ctrl.element);
      }

      return col;
    };

    gridEl.appendChild(buildCol(secA, group.sections[0].label || ''));
    gridEl.appendChild(buildCol(secB, group.sections[1].label || ''));
    wrapper.appendChild(gridEl);

    return wrapper;
  }

  // -------------------------------------------------------------------------
  // Helpers pour widgets (extraits pour réutilisation)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Rendu LINÉAIRE (fallback sans layout)
  // -------------------------------------------------------------------------
  function renderFormLinear(ed, sections) {
    let count = 0;
    for (const sec of sections) {
      if (global.IniSchema.isBlacklisted(sec.name)) continue;
      const el = renderSingleSection(ed, sec, null);
      if (el) { ed.formEl.appendChild(el); count++; }
    }
    if (count === 0) {
      ed.formEl.innerHTML = '<div style="padding:20px;color:var(--text-tertiary);">Aucune section éditable.</div>';
    }
  }

  function renderExpert(ed) {
    let text = '';
    if (ed.sections && global.IniParser) {
      text = global.IniParser.serializeIni(ed.sections);
    } else if (ed.rawContent) {
      text = ed.rawContent;
    }
    ed.expertEl.value = text;
  }

  // -------------------------------------------------------------------------
  // État & modes
  // -------------------------------------------------------------------------
  function markDirty(ed) {
    ed.dirty = true;
    setStatus(ed, '', '');
    const btn = ed.container.querySelector('[data-role="save"]');
    if (btn) btn.classList.add('dirty');
  }

  function setMode(ed, mode) {
    if (ed.mode === mode) return;
    try {
      if (ed.mode === 'expert' && ed.expertEl) {
        // On récupère le texte édité à la main
        ed.sections = global.IniParser.parseIni(ed.expertEl.value);
        markDirty(ed);
      }
      ed.mode = mode;
      if (ed.formEl)   ed.formEl.style.display   = (mode === 'form')   ? '' : 'none';
      if (ed.expertEl) ed.expertEl.style.display = (mode === 'expert') ? '' : 'none';
      if (ed.toggleBtns) ed.toggleBtns.forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
      renderCurrentView(ed);
    } catch (e) {
      console.error('[settingsIni] setMode KO', e);
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  async function save(ed) {
    if (!ed.loaded) {
      setStatus(ed, '⚠️ Rien à enregistrer (chargement en cours ou échoué).', '#ff6b6b');
      return;
    }
    let content;
    try {
      if (ed.mode === 'expert') {
        content = ed.expertEl.value;
        ed.sections = global.IniParser.parseIni(content);
      } else {
        content = global.IniParser.serializeIni(ed.sections);
      }
    } catch (e) {
      setStatus(ed, '❌ ' + e.message, '#ff6b6b');
      return;
    }

    setStatus(ed, '⏳ Enregistrement...');
    try {
      const res = await window.api.writeIniFile(ed.file, content);
      if (res && res.success) {
        ed.dirty = false;
        const btn = ed.container.querySelector('[data-role="save"]');
        if (btn) btn.classList.remove('dirty');
        const t = new Date().toLocaleTimeString();
        setStatus(ed, '✅ Enregistré à ' + t, '#4caf50');
        // Efface le message après 3s
        setTimeout(() => { if (!ed.dirty) setStatus(ed, '', ''); }, 3000);
      } else {
        setStatus(ed, '❌ ' + ((res && res.error) || 'Erreur'), '#ff6b6b');
      }
    } catch (e) {
      setStatus(ed, '❌ ' + e.message, '#ff6b6b');
    }
  }

  async function reload(ed) {
    if (ed.dirty && !confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return;
    ed.loaded = false;
    ed.loading = false;
    ed.sections = null;
    ed.rawContent = '';
    ed.dirty = false;
    setStatus(ed, '');
    const btn = ed.container.querySelector('[data-role="save"]');
    if (btn) btn.classList.remove('dirty');
    await ensureLoaded(ed.file);
  }

  // -------------------------------------------------------------------------
  // Init d'un éditeur
  // -------------------------------------------------------------------------
  function initEditor(container) {
    const filename = container.dataset.iniFile;
    if (!filename || editors[filename]) return;

    container.innerHTML =
      '<div class="ini-toolbar">' +
        '<div class="ini-mode-toggle">' +
          '<button class="ini-mode-btn active" data-mode="form">📝</button>' +
          '<button class="ini-mode-btn" data-mode="expert">💻</button>' +
        '</div>' +
        '<div class="ini-tabs" data-role="tabs"></div>' +
        '<div class="ini-toolbar-actions">' +
          '<span class="ini-status" data-role="status"></span>' +
          '<button class="filter-btn" data-role="reset">↶ Recharger</button>' +
          '<button class="filter-btn ini-btn-save" data-role="save">💾 Enregistrer</button>' +
        '</div>' +
      '</div>' +
      '<div class="ini-form" data-role="form"></div>' +
      '<textarea class="ini-expert" data-role="expert" spellcheck="false" style="display:none;"></textarea>';

    const ed = {
      file:       filename,
      container:  container,
      sections:   null,
      rawContent: '',
      mode:       'form',
      loaded:     false,
      loading:    false,
      dirty:      false,
      ppfilters:  [],
      statusEl:     container.querySelector('[data-role="status"]'),
      formEl:       container.querySelector('[data-role="form"]'),
      expertEl:     container.querySelector('[data-role="expert"]'),
      tabsEl:       container.querySelector('[data-role="tabs"]'),
      toggleBtns:   Array.from(container.querySelectorAll('.ini-mode-btn')),
      currentTab:   null,
    };
    editors[filename] = ed;

    // ⚠️ Attache les listeners AVANT tout await (sinon boutons inertes)
    ed.toggleBtns.forEach(b =>
      b.addEventListener('click', () => setMode(ed, b.dataset.mode)));

    const btnSave  = container.querySelector('[data-role="save"]');
    const btnReset = container.querySelector('[data-role="reset"]');
    if (btnSave)  btnSave.addEventListener('click', () => save(ed));
    if (btnReset) btnReset.addEventListener('click', () => reload(ed));

    ed.expertEl.addEventListener('input', () => markDirty(ed));

    // ⭐ Restaure l'onglet actif depuis localStorage
    const layout = global.IniLayout ? global.IniLayout.getLayout(filename) : null;
    if (layout) {
      const storageKey = 'iniActiveTab:' + filename;
      try {
        const saved = localStorage.getItem(storageKey);
        ed.currentTab = (saved && layout.tabs.some(t => t.id === saved))
          ? saved
          : layout.defaultTab;
      } catch (e) { ed.currentTab = layout.defaultTab; }
    }

    // Récupération des ppfilters en tâche de fond (non bloquant)
    if (filename === 'video.ini' && window.api && typeof window.api.listPpfilters === 'function') {
      window.api.listPpfilters()
        .then(r => { if (r && r.success) ed.ppfilters = r.filters || []; })
        .catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // Init global
  // -------------------------------------------------------------------------
  function init() {
    const apiErr = checkApi();
    if (apiErr) console.error('[settingsIni] init KO :', apiErr);

    document.querySelectorAll('.ini-editor[data-ini-file]').forEach(initEditor);

    // Lazy-load : on charge l'INI au premier clic sur le subtab
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const onclick = btn.getAttribute('onclick') || '';
        const m = onclick.match(/switchSubTab\(event,\s*'([^']+)'\)/);
        if (!m) return;
        const subtab = document.getElementById(m[1]);
        if (!subtab) return;
        subtab.querySelectorAll('.ini-editor[data-ini-file]').forEach(c => {
          ensureLoaded(c.dataset.iniFile);
        });
      });
    });

    // Si un subtab est déjà actif au démarrage
    document.querySelectorAll('.subtab-content.active .ini-editor[data-ini-file]').forEach(c => {
      ensureLoaded(c.dataset.iniFile);
    });
  }

  global.SettingsIni = { init, ensureLoaded };
})(window);