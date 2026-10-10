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

    let count = 0;
    for (const sec of ed.sections) {
      if (global.IniSchema.isBlacklisted(sec.name)) continue;
      const kvEntries = sec.entries.filter(e => e.kind === 'kv');
      if (kvEntries.length === 0) continue;

      const secSchema = global.IniSchema.getSectionSchema(ed.file, sec.name);
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'ini-section';

      const headerEl = document.createElement('div');
      headerEl.className = 'ini-section-header';

      // ⭐ Flèche de pliage
      const arrowEl = document.createElement('span');
      arrowEl.className = 'ini-section-arrow';
      arrowEl.textContent = '▸';
      headerEl.appendChild(arrowEl);

      const labelEl = document.createElement('span');
      labelEl.className = 'ini-section-label';
      labelEl.textContent = (secSchema && secSchema.label) ? secSchema.label : sec.name;
      headerEl.appendChild(labelEl);

      if (secSchema && secSchema.label && secSchema.label !== sec.name) {
        const rawEl = document.createElement('span');
        rawEl.className = 'ini-section-raw';
        rawEl.textContent = ' [' + sec.name + ']';
        headerEl.appendChild(rawEl);
      }

      // ⭐ Restaure l'état plié/déplié depuis localStorage
      const storageKey = 'iniCollapse:' + ed.file + ':' + sec.name;
      const defaultCollapsed = (ed.file === 'controls.ini');  // controls.ini par défaut plié
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

      // ⭐ Liste des CONx pour le widget JOY (extrait de [CONTROLLERS])
      let acControllersForUI = [];
      if (ed.file === 'controls.ini' && ed.sections) {
        const ctrlSec = ed.sections.find(s => s.name === 'CONTROLLERS');
        if (ctrlSec) {
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
          acControllersForUI = Object.values(tmpMap).sort((a, b) => a.index - b.index);
        }
      }

      // Helpers pour que les widgets d'une section puissent lire/écrire
      // les valeurs des clés frères (ex : BUTTON écrit aussi JOY)
      const sectionHelpers = {
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
      // Registre des widgets de la section, pour mise à jour croisée
      const siblingWidgets = {};

      for (const entry of sec.entries) {
        if (entry.kind !== 'kv') continue;
        const schema = global.IniSchema.getKeySchema(ed.file, sec.name, entry.key);
        let ctrl;
        try {
          ctrl = global.IniControls.createIniControl({
            filename:  ed.file,
            section:   sec.name,
            key:       entry.key,
            value:     entry.value,
            schema:    schema,
            ppfilters: ed.ppfilters || [],
            sectionHelpers: sectionHelpers,
            siblingWidgets: siblingWidgets,
            gamepadMapper:  ed.gamepadMapper || null,
            sectionContext: {
              controllers: acControllersForUI,
            },
            onChange: (newVal) => {
              entry.value = newVal;
              markDirty(ed);
            }
          });
        } catch (e) {
          console.error('[settingsIni] widget KO', sec.name, entry.key, e);
          continue;
        }
        if (readOnly) {
          ctrl.element.querySelectorAll('input, select, textarea')
            .forEach(el => { el.disabled = true; });
        }
        siblingWidgets[entry.key] = ctrl;
        sectionDiv.appendChild(ctrl.element);
        count++;
      }
      ed.formEl.appendChild(sectionDiv);
    }

    if (count === 0) {
      ed.formEl.innerHTML =
        '<div style="padding:20px;color:var(--text-tertiary);">Aucune section éditable trouvée.</div>';
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
    setStatus(ed, '● Modifications non enregistrées', '#ffb84d');
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
        const t = new Date().toLocaleTimeString();
        setStatus(ed, '✅ Enregistré à ' + t, '#4caf50');
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
          '<button class="ini-mode-btn active" data-mode="form">📝 Formulaire</button>' +
          '<button class="ini-mode-btn" data-mode="expert">💻 Expert</button>' +
        '</div>' +
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
      statusEl:   container.querySelector('[data-role="status"]'),
      formEl:     container.querySelector('[data-role="form"]'),
      expertEl:   container.querySelector('[data-role="expert"]'),
      toggleBtns: Array.from(container.querySelectorAll('.ini-mode-btn')),
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