// public/src/settingsIni.js
// Logique des onglets Paramètres > Contrôles / Vidéo / Audio.

(function (global) {
  'use strict';

  const editors = {};

  // ⭐ v1.6.0-UX — Label "Périphérique" pour le badge read-only JOY
  function getJoyLabel() {
    return (global.I18n && global.I18n.tFr) ? global.I18n.tFr('Périphérique') : 'Périphérique';
  }

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
    if (!ed) return;
    if (ed.loaded) return;
    if (ed.loading) return ed._loadPromise;

    const apiErr = checkApi();
    if (apiErr) {
      setStatus(ed, '⚠️ ' + apiErr, '#ff6b6b');
      console.error('[settingsIni]', apiErr);
      return;
    }

    ed.loading = true;
    setStatus(ed, '⏳ Chargement...');

    ed._loadPromise = (async () => {
      try {
        // ⭐ v1.6.0 — Pour controls.ini, on charge le PROFIL ACTIF du mode courant.
        //    Pour les autres fichiers (video/audio), lecture normale directe.
        let rawContent = null;
        let profileFilename = null;

        if (filename === 'controls.ini') {
          const active = await resolveActiveProfile(ed);
          if (active.content) {
            rawContent = active.content;
            profileFilename = active.filename;
            console.log('[SettingsIni] Chargement depuis profil actif :', profileFilename, '(mode', active.method + ')');
          } else {
            console.log('[SettingsIni] Aucun profil actif → lecture de controls.ini');
          }
        }

        // Fallback (ou fichiers non-controls) : lecture directe
        if (rawContent == null) {
          const res = await window.api.readIniFile(filename);
          if (!res || !res.success) {
            throw new Error((res && res.error) || 'Réponse invalide du process principal');
          }
          rawContent = res.content;
        }

        ed.rawContent = rawContent;
        ed.sections   = global.IniParser.parseIni(rawContent);
        ed.loaded     = true;
        ed.dirty      = false;

        // ⭐ v1.6.0 — Mémorise le profil source pour Save et pour l'affichage
        ed.activeProfileFilename = profileFilename;

        // ⭐ v1.6.0 — Mémorise le mode courant (source de vérité du layout)
        //    Priorité : settings.inputMethod (via resolveActiveProfile) > contenu du fichier
        if (filename === 'controls.ini') {
          let savedMethod = null;
          try {
            const mRes = await window.api.getInputMethod();
            if (mRes && mRes.success && mRes.method) savedMethod = String(mRes.method).toUpperCase();
          } catch (e) {}
          ed.currentInputMethod = savedMethod
            || getInputMethodFromSections(ed.sections)
            || 'WHEEL';
          console.log('[SettingsIni] Mode courant mémorisé :', ed.currentInputMethod);
        }
        // ⭐ Stocke les valeurs originales pour l'undo par ligne
        ed.originalValues = {};
        for (const sec of ed.sections) {
          if (!sec.name) continue;
          ed.originalValues[sec.name] = {};
          for (const entry of sec.entries) {
            if (entry.kind === 'kv') {
              ed.originalValues[sec.name][entry.key] = entry.value;
              entry._originalValue = entry.value;
            }
          }
        }
        try {
          ed.serializedAtLoad = global.IniParser.serializeIni(ed.sections);
        } catch (e) {
          ed.serializedAtLoad = rawContent;
        }

        // ⭐ v1.6.0-UX — Charge les types de devices (wheel/gamepad/other)
        //    pour filtrer la liste JOY selon le mode courant.
        if (filename === 'controls.ini') {
          try {
            const devRes = await window.api.listAcControllerDevices();
            ed.deviceTypesByName = {};
            ed.devicesByIguid = {};
            if (devRes && devRes.success && Array.isArray(devRes.devices)) {
              for (const d of devRes.devices) {
                if (d.name) ed.deviceTypesByName[d.name] = d.type || 'other';
                // ⭐ v1.6.0 — Index par iguid (source de vérité)
                if (d.iguid) {
                  ed.devicesByIguid[String(d.iguid).toLowerCase()] = d.type || 'other';
                }
              }
            }
            console.log('[SettingsIni] Types de devices chargés :',
              Object.keys(ed.deviceTypesByName).length, '(par name) /',
              Object.keys(ed.devicesByIguid).length, '(par iguid)');
          } catch (e) {
            console.warn('[SettingsIni] listAcControllerDevices KO', e);
            ed.deviceTypesByName = {};
            ed.devicesByIguid = {};
          }
        }

        // ⭐ v1.6.0 — Affiche le badge "Profil actif" dans la toolbar
        updateProfileBadge(ed);

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
        // ⭐ v1.6.0 — Recalcule TOUJOURS la visibilité du bouton Calibrer,
        //    même en cas d'erreur (fichier absent = on veut le laisser visible
        //    pour permettre la création de controls.ini via le wizard).
        if (filename === 'controls.ini') {
          updateCalibrateButtonVisibility(ed);
        }
      }
    })();

    return ed._loadPromise;
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Affiche/masque le bouton 🎯 Calibrer selon INPUT_METHOD
  //    Le wizard de calibration n'est pertinent QUE pour les volants (WHEEL).
  //    En mode Manette (X360) ou Clavier (KEYBOARD), on le cache.
  //
  //    Règle :
  //      - WHEEL          → visible
  //      - X360/KEYBOARD  → caché
  //      - Inconnu        → visible (permet de créer controls.ini sur install vierge)
  // -------------------------------------------------------------------------
  function updateCalibrateButtonVisibility(ed) {
    if (!ed || !ed.container || ed.file !== 'controls.ini') return;
    const btnCalib = ed.container.querySelector('[data-role="calib"]');
    if (!btnCalib) return;

    // ⭐ v1.6.0 — Priorité au mode mémorisé (source de vérité), fallback contenu
    let inputMethod = ed.currentInputMethod || null;
    if (!inputMethod && ed.sections) {
      const headerSec = ed.sections.find(s => s.name === 'HEADER');
      if (headerSec) {
        const imEntry = headerSec.entries.find(e => e.kind === 'kv' && e.key === 'INPUT_METHOD');
        if (imEntry && imEntry.value) inputMethod = String(imEntry.value).trim().toUpperCase();
      }
    }

    const isWheel = (inputMethod === 'WHEEL');
    const unknown = !inputMethod;
    const show = isWheel || unknown;

    btnCalib.style.display = show ? '' : 'none';
    btnCalib.title = show
      ? 'Calibrer automatiquement mon volant'
      : 'Désactivé en mode ' + inputMethod + ' (réservé aux volants)';

    console.log('[SettingsIni] INPUT_METHOD =', inputMethod || '(non défini)',
                '→ bouton Calibrer', show ? 'visible' : 'masqué');
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Affiche le badge "Profil actif : xxx.ini" dans la toolbar
  // -------------------------------------------------------------------------
  function updateProfileBadge(ed) {
    if (!ed || !ed.container) return;
    const badge = ed.container.querySelector('[data-role="profile-badge"]');
    if (!badge) return;

    if (ed.file !== 'controls.ini') {
      badge.style.display = 'none';
      return;
    }

    badge.style.display = '';

    if (ed.activeProfileFilename) {
      const name = ed.activeProfileFilename.replace(/\.ini$/i, '');
      badge.textContent = '📁 ' + name;
      badge.title = 'Profil actif — les modifications seront sauvegardées dedans';
      badge.style.background = 'rgba(var(--accent-rgb), 0.15)';
      badge.style.color = 'var(--accent)';
      badge.style.borderColor = 'rgba(var(--accent-rgb), 0.35)';
    } else {
      badge.textContent = '⚠️ ' + ((window.I18n && window.I18n.tFr) ? window.I18n.tFr('Aucun profil actif') : 'Aucun profil actif');
      badge.title = 'Aucun profil n\'est actif. Charge-en un ou crée un nouveau profil.';
      badge.style.background = 'rgba(230, 163, 59, 0.12)';
      badge.style.color = '#e6a33b';
      badge.style.borderColor = 'rgba(230, 163, 59, 0.4)';
    }
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Lit INPUT_METHOD depuis [HEADER] de ed.sections
  //    Retourne 'WHEEL' | 'X360' | 'KEYBOARD' | null
  // -------------------------------------------------------------------------
  function getInputMethodFromSections(sections) {
    if (!Array.isArray(sections)) return null;
    const headerSec = sections.find(s => s.name === 'HEADER');
    if (!headerSec) return null;
    const entry = headerSec.entries.find(e => e.kind === 'kv' && e.key === 'INPUT_METHOD');
    if (!entry || !entry.value) return null;
    let m = String(entry.value).trim().toUpperCase();
    if (m === 'GAMEPAD') m = 'X360';   // ⭐ Compat v1.5.0 (ancienne valeur)
    if (!['WHEEL', 'X360', 'KEYBOARD'].includes(m)) return null;
    return m;
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Résout le profil actif pour un éditeur donné.
  //
  //   Retourne :
  //     { filename: 'xxx.ini', content: '...', method: 'WHEEL' }  → profil trouvé
  //     { filename: null,      content: null,  method: 'WHEEL' }  → pas de profil
  //                                                                  (fallback controls.ini)
  //
  //   Le mode courant est déterminé par settings.inputMethod (mémorisé par
  //   set-input-method au lieu d'être lu dans controls.ini).
  // -------------------------------------------------------------------------
  async function resolveActiveProfile(ed) {
    if (ed.file !== 'controls.ini') return { filename: null, content: null, method: null };

    // 1. Lit le mode mémorisé dans settings.json
    let method = null;
    try {
      const res = await window.api.getInputMethod();
      if (res && res.success && res.method) method = String(res.method).toUpperCase();
    } catch (e) { /* fallback */ }

    if (!method) {
      // Fallback : lit INPUT_METHOD depuis controls.ini
      try {
        const iniRes = await window.api.readIniFile('controls.ini');
        if (iniRes && iniRes.success) {
          method = getInputMethodFromSections(global.IniParser.parseIni(iniRes.content)) || 'WHEEL';
        }
      } catch (e) { method = 'WHEEL'; }
    }

    // 2. Récupère le profil actif pour ce mode
    try {
      const res = await window.api.getActiveProfile(method);
      if (res && res.success && res.content && res.filename) {
        return { filename: res.filename, content: res.content, method };
      }
    } catch (e) { /* ignore */ }

    return { filename: null, content: null, method };
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0-4A — Sections AC minimales à garantir selon le mode.
  //
  //    Si l'utilisateur part d'un controls.ini vierge (WHEEL), son profil
  //    X360 n'aura pas les sections [ACTION_CHANGE_CAMERA], [KERS], etc.
  //    On les injecte en mémoire avant rendu, basées sur X360Default.ini.
  //
  //    Les valeurs par défaut sont celles observées dans X360Default.ini
  //    ou Default.ini d'AC.
  // -------------------------------------------------------------------------
  const REQUIRED_SECTIONS = {
    X360: [
      'X360', 'KEYBOARD', 'ADVANCED', 'CONTROLLERS',
      'STEER', 'THROTTLE', 'BRAKES', 'CLUTCH', 'HANDBRAKE',
      'GEARUP', 'GEARDN', 'REV', 'AUTO_SHIFTER', 'SHIFTER',
      'ACTION_CHANGE_CAMERA', 'ACTION_HORN', 'ACTION_HEADLIGHTS',
      'GLANCELEFT', 'GLANCERIGHT', 'GLANCEBACK',
      'BALANCEUP', 'BALANCEDN', 'TCUP', 'TCDN', 'ABS',
      'KERS', 'DRS'
    ],
    KEYBOARD: [
      'X360', 'KEYBOARD', 'ADVANCED', 'CONTROLLERS',
      'STEER', 'THROTTLE', 'BRAKES', 'CLUTCH', 'HANDBRAKE',
      'GEARUP', 'GEARDN', 'REV', 'AUTO_SHIFTER',
      'ACTION_CHANGE_CAMERA', 'ACTION_HORN', 'ACTION_HEADLIGHTS',
      'GLANCELEFT', 'GLANCERIGHT', 'GLANCEBACK',
      'ABS'
    ],
  };

  // Valeurs par défaut AC pour chaque section (basé sur X360Default.ini / Default.ini)
  function getDefaultKeysForSection(sectionName) {
    const map = {
      'X360': ['STEER_THUMB', 'STEER_GAMMA', 'STEER_FILTER', 'SPEED_SENSITIVITY',
               'STEER_DEADZONE', 'STEER_SPEED', 'RUMBLE_INTENSITY'],
      'KEYBOARD': ['MINIMUM_STEERING', 'STEERING_SPEED', 'STEERING_OPPOSITE_DIRECTION_SPEED',
                   'STEER_GAIN', 'STEER_RESET_SPEED', 'LOOKAHEAD_POINTS',
                   'GAS', 'BRAKE', 'RIGHT', 'LEFT'],
      'ADVANCED': ['COMBINE_WITH_KEYBOARD_CONTROL'],
      'STEER': ['JOY', 'AXLE', 'SCALE', 'LOCK', 'FF_GAIN', 'FILTER_FF',
                'STEER_GAMMA', 'STEER_FILTER', 'SPEED_SENSITIVITY'],
      'THROTTLE': ['JOY', 'AXLE', 'MIN', 'MAX'],
      'BRAKES':   ['JOY', 'AXLE', 'MIN', 'MAX', 'GAMMA'],
      'CLUTCH':   ['JOY', 'AXLE', 'MIN', 'MAX'],
      'HANDBRAKE': ['JOY', 'AXLE', 'MIN', 'MAX', 'BUTTON', 'KEY', 'XBOXBUTTON'],
      'SHIFTER': ['ACTIVE', 'JOY', 'GEAR_1', 'GEAR_2', 'GEAR_3', 'GEAR_4',
                  'GEAR_5', 'GEAR_6', 'GEAR_7', 'GEAR_R'],
    };
    if (map[sectionName]) return map[sectionName];
    // Fallback : binding standard pour les sections d'action
    return ['JOY', 'BUTTON', 'KEY', 'XBOXBUTTON'];
  }

  // Valeurs par défaut spécifiques (basées sur X360Default.ini)
  const DEFAULT_VALUES = {
    'X360': {
      'STEER_THUMB': 'LEFT', 'STEER_GAMMA': '2.0', 'STEER_FILTER': '0.7',
      'SPEED_SENSITIVITY': '0.2', 'STEER_DEADZONE': '0.0', 'STEER_SPEED': '0.2',
      'RUMBLE_INTENSITY': '0.8'
    },
    'KEYBOARD': {
      'MINIMUM_STEERING': '0', 'STEERING_SPEED': '1.75',
      'STEERING_OPPOSITE_DIRECTION_SPEED': '2.5', 'STEER_GAIN': '0.18',
      'STEER_RESET_SPEED': '1.8', 'LOOKAHEAD_POINTS': '6',
      'GAS': '0x26', 'BRAKE': '0x28', 'RIGHT': '0x27', 'LEFT': '0x25'
    },
    'ADVANCED': { 'COMBINE_WITH_KEYBOARD_CONTROL': '0' },
    'STEER': { 'JOY': '-1', 'AXLE': '-1', 'SCALE': '1', 'LOCK': '900',
               'FF_GAIN': '1', 'FILTER_FF': '0', 'STEER_GAMMA': '1',
               'STEER_FILTER': '0', 'SPEED_SENSITIVITY': '0' },
    'THROTTLE': { 'JOY': '-1', 'AXLE': '-1', 'MIN': '-1', 'MAX': '1' },
    'BRAKES': { 'JOY': '-1', 'AXLE': '-1', 'MIN': '-1', 'MAX': '1', 'GAMMA': '2.4' },
    'CLUTCH': { 'JOY': '-1', 'AXLE': '-1', 'MIN': '-1', 'MAX': '1' },
    'HANDBRAKE': { 'JOY': '-1', 'AXLE': '-1', 'MIN': '-1', 'MAX': '1',
                   'BUTTON': '-1', 'KEY': '-1', 'XBOXBUTTON': 'B' },
    'GEARUP': { 'JOY': '-1', 'BUTTON': '-1', 'KEY': '-1', 'XBOXBUTTON': 'A' },
    'GEARDN': { 'JOY': '-1', 'BUTTON': '-1', 'KEY': '-1', 'XBOXBUTTON': 'X' },
    'ACTION_HORN':       { 'JOY': '-1', 'BUTTON': '-1', 'XBOXBUTTON': 'Y', 'KEY': '0x48' },
    'ACTION_HEADLIGHTS': { 'JOY': '-1', 'BUTTON': '-1', 'XBOXBUTTON': 'DPAD_UP', 'KEY': '0x4C' },
    'GLANCELEFT':        { 'JOY': '-1', 'BUTTON': '-1', 'XBOXBUTTON': 'DPAD_LEFT', 'KEY': '0x51' },
    'GLANCERIGHT':       { 'JOY': '-1', 'BUTTON': '-1', 'XBOXBUTTON': 'DPAD_RIGHT', 'KEY': '0x57' },
    'GLANCEBACK':        { 'JOY': '-1', 'BUTTON': '-1', 'XBOXBUTTON': 'DPAD_DOWN', 'KEY': '-1' },
    'ACTION_CHANGE_CAMERA': { 'JOY': '-1', 'BUTTON': '-1', 'XBOXBUTTON': 'BACK', 'KEY': '0x43' }
  };

  function ensureRequiredSections(sections, inputMethod) {
    if (!Array.isArray(sections) || !inputMethod) return;
    const required = REQUIRED_SECTIONS[inputMethod];
    if (!required) return;

    let injectedCount = 0;

    for (const secName of required) {
      const exists = sections.some(s => s.name === secName);
      if (exists) continue;

      const keys = getDefaultKeysForSection(secName);
      const defVals = DEFAULT_VALUES[secName] || {};
      const entries = keys.map(k => ({
        kind: 'kv',
        key: k,
        value: (defVals[k] !== undefined ? defVals[k] : '-1'),
        comment: ' ; ajouté par QACRL',
        _injectedByQacrl: true,
      }));
      sections.push({ name: secName, entries });
      injectedCount++;
    }

    if (injectedCount > 0) {
      console.log('[SettingsIni] ' + injectedCount + ' section(s) AC injectée(s) pour le mode', inputMethod);
    }
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Injecte les clés XBOXBUTTON manquantes dans les sections
  //    de direction/pédales QUAND on est en mode X360.
  //
  //    Pourquoi : le code de renderSingleSection itère sur les entrées
  //    PRÉSENTES dans le fichier INI. Or, dans un controls.ini vierge,
  //    [THROTTLE] ne contient que JOY/AXLE/MIN/MAX/GAMMA — pas XBOXBUTTON.
  //    Sans cette injection, l'utilisateur ne verrait pas de widget lui
  //    permettant d'assigner RT à l'accélérateur.
  //
  //    L'injection est EN MÉMOIRE uniquement : rien n'est écrit sur le
  //    disque tant que l'utilisateur ne sauvegarde pas.
  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Obsolète : sur Xbox, les gâchettes LT/RT sont des AXES
  //    analogiques (JOY + AXLE), pas des boutons XInput nommés.
  //    La fonction est conservée (appelée dans renderForm) mais ne fait rien.
  function ensureX360BindingsForSections(sections) {
    return; // no-op
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
    // ⭐ Stop tous les intervals de barres live avant de tout reconstruire
    if (global.IniControls && global.IniControls.stopAllLives) {
      global.IniControls.stopAllLives();
    }

    ed.formEl.innerHTML = '';
    if (!ed.sections) {
      ed.formEl.innerHTML = '<div style="padding:20px;color:var(--text-tertiary);">Aucune donnée chargée.</div>';
      return;
    }

    // ⭐ v1.6.2 — Tâche 6 : Encart contextuel "Mode Actif"
    if (ed.file === 'controls.ini') {
      const m = ed.currentInputMethod || 'WHEEL';
      const tr = (s) => (window.I18n && window.I18n.tFr) ? window.I18n.tFr(s) : s;
      
      const modeMap = {
        'WHEEL': { icon: '🏎️', label: tr('Mode Volant'), color: 'var(--accent)' },
        'X360': { icon: '🎮', label: tr('Mode Manette'), color: '#4caf50' },
        'KEYBOARD': { icon: '⌨️', label: tr('Mode Clavier'), color: '#e6a33b' }
      };
      const modeInfo = modeMap[m] || modeMap['WHEEL'];
      
      const banner = document.createElement('div');
      banner.className = 'qacrl-ctrl-device-banner ok';
      banner.style.marginBottom = '16px';
      banner.style.borderLeft = `4px solid ${modeInfo.color}`;
      
      banner.innerHTML = `${modeInfo.icon} <strong>${tr('Édition du profil')} ${modeInfo.label}</strong> <span class="qacrl-ctrl-device-banner-sub">— ${tr('Les modifications seront sauvegardées dans ce mode.')}</span>`;
      
      ed.formEl.appendChild(banner);
    }

    // ⭐ v1.6.0 — Le mode courant est LA source de vérité (mémorisé par ed.currentInputMethod).
    //    On ignore le contenu du fichier au cas où il diverge (profil rechargé,
    //    changement de mode manuel, etc.).
    const inputMethod = ed.currentInputMethod
      || getInputMethodFromSections(ed.sections)
      || 'WHEEL';

    // ⭐ v1.6.0-4A — Garantit que les sections AC minimales existent dans le profil
    //    (sinon les catégories manette/clavier apparaîtraient vides).
    if (ed.file === 'controls.ini') {
      ensureRequiredSections(ed.sections, inputMethod);
    }

    // ⭐ v1.6.0 — En mode X360, injecte XBOXBUTTON dans les sections pédales
    //    avant le rendu (sinon l'utilisateur ne peut pas assigner RT/LT).
    if (ed.file === 'controls.ini' && inputMethod === 'X360') {
      ensureX360BindingsForSections(ed.sections);
    }

    const layout = global.IniLayout
      ? global.IniLayout.getLayout(ed.file, { inputMethod })
      : null;

    if (!layout) {
      renderFormLinear(ed, ed.sections);
      if (ed.tabsEl) ed.tabsEl.innerHTML = '';
      return;
    }

    renderTabs(ed, layout);

    // ⭐ v1.6.0 — Si l'onglet mémorisé n'existe plus dans le nouveau layout
    //    (ex: on était sur 'axes' en WHEEL, on passe en X360 → plus d'onglet 'axes'),
    //    on retombe proprement sur le defaultTab du nouveau layout.
    let activeTab = layout.tabs.find(t => t.id === ed.currentTab);
    if (!activeTab) {
      activeTab = layout.tabs.find(t => t.id === layout.defaultTab) || layout.tabs[0];
      if (activeTab) {
        ed.currentTab = activeTab.id;
        try { localStorage.setItem('iniActiveTab:' + ed.file, activeTab.id); } catch (e) {}
      }
    }
    if (!activeTab) return;

    const sectionMap = {};
    for (const s of ed.sections) sectionMap[s.name] = s;

        // ⭐ Set LOCAL : sections déjà rendues dans l'onglet en cours
    const usedSections = new Set();

    // ⭐ Set GLOBAL : toutes les sections référencées dans le layout complet
    const globallyUsedSections = global.IniLayout && global.IniLayout.getAllUsedSections
      ? global.IniLayout.getAllUsedSections(ed.file, { inputMethod })
      : new Set();
    let count = 0;

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
        } else if (group.type === 'category') {
          // ⭐ Catégorie pliable
          const catWrapper = document.createElement('div');
          catWrapper.className = 'ini-category';

          const catHeader = document.createElement('div');
          catHeader.className = 'ini-category-header';

          const arrowEl = document.createElement('span');
          arrowEl.className = 'ini-category-arrow';
          arrowEl.textContent = '▸';
          catHeader.appendChild(arrowEl);

          const catLabel = document.createElement('span');
          catLabel.className = 'ini-category-label';
          catLabel.textContent = (global.I18n && global.I18n.tFr)
            ? global.I18n.tFr(group.label)
            : group.label;
          catHeader.appendChild(catLabel);

          // ⭐ Hint optionnel (sous-titre explicatif)
          if (group.hint) {
            const hintEl = document.createElement('span');
            hintEl.className = 'ini-category-hint';
            hintEl.textContent = (global.I18n && global.I18n.tFr)
              ? global.I18n.tFr(group.hint)
              : group.hint;
            catHeader.appendChild(hintEl);
          }

          const collapseKey = 'iniCollapseCategory:' + ed.file + ':' + group.label;
          let collapsed = true; // replié par défaut
          try {
            const saved = localStorage.getItem(collapseKey);
            collapsed = (saved === null) ? true : (saved === '1');
          } catch (e) { collapsed = true; }

          if (collapsed) catWrapper.classList.add('collapsed');
          catHeader.addEventListener('click', () => {
            collapsed = !collapsed;
            catWrapper.classList.toggle('collapsed', collapsed);
            try { localStorage.setItem(collapseKey, collapsed ? '1' : '0'); } catch (e) {}
          });
          catWrapper.appendChild(catHeader);

          const catContent = document.createElement('div');
          catContent.className = 'ini-category-content';

          for (const sub of (group.groups || [])) {
            if (sub.type === 'single') {
              const sec = sectionMap[sub.section];
              if (!sec) continue;
              usedSections.add(sub.section);
              const el = renderSingleSection(ed, sec, sub.label);
              if (el) { catContent.appendChild(el); count++; }
            } else if (sub.type === 'pair') {
              const el = renderPairGroup(ed, sub, sectionMap);
              if (el) {
                sub.sections.forEach(s => usedSections.add(s.section));
                catContent.appendChild(el);
                count += sub.sections.length;
              }
            }
          }

          catWrapper.appendChild(catContent);
          ed.formEl.appendChild(catWrapper);
        }
      }
    } else {
      for (const sec of ed.sections) {
        if (global.IniSchema.isBlacklisted(sec.name)) continue;
        if (sec.entries.filter(e => e.kind === 'kv').length === 0) continue;
        usedSections.add(sec.name);
        const el = renderSingleSection(ed, sec, null);
        if (el) { ed.formEl.appendChild(el); count++; }
      }
    }

    if (activeTab.isFallback) {
      const orphans = [];
      for (const sec of ed.sections) {
        if (globallyUsedSections.has(sec.name)) continue;  // ⭐ global au lieu de local
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
      btn.textContent = (global.I18n && global.I18n.tFr)
        ? global.I18n.tFr(tab.label)
        : tab.label;
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
    // ⭐ Skip les sections blacklistées globalement
    if (global.IniLayout && global.IniLayout.isSectionExcluded
        && global.IniLayout.isSectionExcluded(ed.file, sec.name)) {
      return null;
    }

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

    const rawLabel = customLabel
      || (secSchema && secSchema.label)
      || sec.name;
    const labelEl = document.createElement('span');
    labelEl.className = 'ini-section-label';
    labelEl.textContent = (global.I18n && global.I18n.tFr)
      ? global.I18n.tFr(rawLabel)
      : rawLabel;
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

    const sectionHelpers = buildSectionHelpers(sec);
    const siblingWidgets = {};
    const acControllersForUI = getAcControllersList(ed);

      for (const entry of sec.entries) {
    if (entry.kind !== 'kv') continue;

    // ⭐ v1.6.0 — Skip les clés internes __* (Content Manager, CSP, etc.)
    if (entry.key && entry.key.startsWith('__')) {
      continue;
    }

    // ⭐ Skip les clés gérées ailleurs (ex : FILTER et ENABLED dans le bloc Rendu)
    if (global.IniLayout && global.IniLayout.isKeyExcluded
        && global.IniLayout.isKeyExcluded(ed.file, sec.name, entry.key, ed.currentInputMethod)) {
      continue;
    }

          const schema = global.IniSchema.getKeySchema(ed.file, sec.name, entry.key);
      let ctrl;

      // ⭐ v1.6.0-UX — En mode X360, le widget JOY devient un badge read-only
      //    (il sera auto-assigné au device actif au save). Exception : SHIFTER.
      const isJoyKey = (entry.key === 'JOY');
      const isX360Mode = (ed.currentInputMethod === 'X360');
      const isShifter = (sec.name === 'SHIFTER');

      if (isJoyKey && isX360Mode && !isShifter) {
        // Badge read-only
        const badge = document.createElement('div');
        badge.className = 'ini-readonly-badge';
        badge.title = 'Assigné automatiquement au périphérique actif';
        badge.textContent = '→ ' + ((window.I18n && window.I18n.tFr) ? window.I18n.tFr('Auto (mode Manette)') : 'Auto (mode Manette)');
        const row = document.createElement('div');
        row.className = 'ini-row';
        const lbl = document.createElement('label');
        lbl.className = 'ini-label';
        lbl.textContent = getJoyLabel();
        row.appendChild(lbl);
        row.appendChild(badge);
        sectionDiv.appendChild(row);
        continue;   // ← skip le createIniControl habituel
      }

      // ⭐ Détecte si un AXE n'est pas assigné
      const isAxisKey = (entry.key === 'AXLE');
      const axisAssigned = isAxisKey ? (parseInt(entry.value, 10) >= 0) : true;

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
          currentInputMethod: ed.currentInputMethod || null,   // ⭐ v1.6.0-UX
          onChange: (newVal) => {
            entry.value = newVal;
            markDirty(ed);
            if (typeof updateUndoVisibility === 'function') updateUndoVisibility();
          }
        });
      } catch (e) {
        console.error('[settingsIni] widget KO', sec.name, entry.key, e);
        continue;
      }
      if (readOnly) {
        ctrl.element.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
      }
      siblingWidgets[entry.key] = ctrl;

      // ⭐ Bouton Undo par ligne (créé une seule fois, caché si inutile)
      const row = ctrl.element;
      const originalValue = entry._originalValue;
      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'ini-undo-btn';
      undoBtn.innerHTML = '↶';
      undoBtn.title = (window.I18n && window.I18n.tFr) ? window.I18n.tFr('Annuler cette modification') : 'Annuler cette modification';
      undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        entry.value = originalValue;
        ctrl.setValue(originalValue);
        updateUndoVisibility();
        checkDirty(ed);
      });
      row.appendChild(undoBtn);

      function updateUndoVisibility() {
        const hasChanged = (originalValue !== undefined && entry.value !== originalValue);
        undoBtn.classList.toggle('visible', hasChanged);
      }
      updateUndoVisibility();

      sectionDiv.appendChild(row);

      // (le badge "non assigné" est géré directement par le label du bouton AXE)
    }

    // ⭐ Démarre les barres de prévisualisation live
    if (ed.file === 'controls.ini' && ed.gamepadMapper) {
      for (const key of Object.keys(siblingWidgets)) {
        const w = siblingWidgets[key];
        if (w && typeof w.startLive === 'function') {
          try { w.startLive(); } catch (e) { console.warn('[settingsIni] startLive KO', e); }
        }
      }
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
    labelEl.textContent = (global.I18n && global.I18n.tFr)
      ? global.I18n.tFr(group.label)
      : group.label;
    headerEl.appendChild(labelEl);

    const collapseKey = 'iniCollapsePair:' + ed.file + ':' + secA?.name + '+' + secB?.name;
    let collapsed;
    try {
      const saved = localStorage.getItem(collapseKey);
      collapsed = (saved === null) ? true : (saved === '1');
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
      titleEl.textContent = (global.I18n && global.I18n.tFr)
        ? global.I18n.tFr(colLabel)
        : colLabel;
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

        // ⭐ Skip les clés exclues
            if (global.IniLayout && global.IniLayout.isKeyExcluded
        && global.IniLayout.isKeyExcluded(ed.file, sec.name, entry.key, ed.currentInputMethod)) {
      continue;
    }

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
            currentInputMethod: ed.currentInputMethod || null,   // ⭐ v1.6.0-UX
            onChange: (newVal) => {
              entry.value = newVal;
              markDirty(ed);
              if (typeof updateUndoVisibility === 'function') updateUndoVisibility();
            }
          });
        } catch (e) {
          console.error('[settingsIni] widget KO (pair)', sec.name, entry.key, e);
          continue;
        }
        if (readOnly) {
          ctrl.element.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
        }
        siblingWidgets[entry.key] = ctrl;

        // ⭐ Bouton Undo par ligne (créé une seule fois, caché si inutile)
        const row = ctrl.element;
        const originalValue = entry._originalValue;
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.className = 'ini-undo-btn';
        undoBtn.innerHTML = '↶';
        undoBtn.title = (window.I18n && window.I18n.tFr) ? window.I18n.tFr('Annuler cette modification') : 'Annuler cette modification';
        undoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          entry.value = originalValue;
          ctrl.setValue(originalValue);
          updateUndoVisibility();
          checkDirty(ed);
        });
        row.appendChild(undoBtn);

        function updateUndoVisibility() {
          const hasChanged = (originalValue !== undefined && entry.value !== originalValue);
          undoBtn.classList.toggle('visible', hasChanged);
        }
        updateUndoVisibility();

        col.appendChild(row);
      }

      // ⭐ Démarre les barres live
      if (ed.file === 'controls.ini' && ed.gamepadMapper) {
        for (const key of Object.keys(siblingWidgets)) {
          const w = siblingWidgets[key];
          if (w && typeof w.startLive === 'function') {
            try { w.startLive(); } catch (e) {}
          }
        }
      }

      return col;
    };

    gridEl.appendChild(buildCol(secA, group.sections[0].label || ''));
    gridEl.appendChild(buildCol(secB, group.sections[1].label || ''));
    wrapper.appendChild(gridEl);

    return wrapper;
  }

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
      const mCon = e.key.match(/^CON(\d+)$/);
      const mIg  = e.key.match(/^__IGUID(\d+)$/);
      if (mCon) {
        const idx = parseInt(mCon[1], 10);
        if (!tmpMap[idx]) tmpMap[idx] = { index: idx };
        tmpMap[idx].name = e.value;
      } else if (mIg) {
        const idx = parseInt(mIg[1], 10);
        if (!tmpMap[idx]) tmpMap[idx] = { index: idx };
        tmpMap[idx].iguid = e.value;
      }
    }
    // ⭐ v1.6.0-UX — Enrichit chaque controller avec son type.
    //    Match par iguid (fiable) puis fallback sur name.
    const devicesByIguid = ed.devicesByIguid || {};
    const devicesByName  = ed.deviceTypesByName || {};
    const list = Object.values(tmpMap).sort((a, b) => a.index - b.index);
    for (const c of list) {
      let t = null;
      if (c.iguid) {
        t = devicesByIguid[String(c.iguid).toLowerCase()];
      }
      if (!t) {
        t = devicesByName[c.name];
      }
      c.type = t || 'other';
    }
    return list;
  }

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

  function markDirty(ed) {
    ed.dirty = true;
    setStatus(ed, '', '');
    const btn = ed.container.querySelector('[data-role="save"]');
    if (btn) btn.classList.add('dirty');
  }

  // ⭐ Vérifie si TOUTES les valeurs sont revenues à l'originale.
  //    Si oui → retire l'état dirty (le bouton Enregistrer repasse en vert).
  function checkDirty(ed) {
    if (!ed || !ed.sections) return;
    let hasChanges = false;
    for (const sec of ed.sections) {
      for (const entry of sec.entries) {
        if (entry.kind !== 'kv') continue;
        if (entry._originalValue !== undefined && entry.value !== entry._originalValue) {
          hasChanges = true;
          break;
        }
      }
      if (hasChanges) break;
    }
    ed.dirty = hasChanges;
    const btn = ed.container.querySelector('[data-role="save"]');
    if (btn) btn.classList.toggle('dirty', hasChanges);
    if (!hasChanges) setStatus(ed, '', '');
  }

  function setMode(ed, mode) {
    if (ed.mode === mode) return;
    try {
      // ⭐ Stoppe les intervals live quand on quitte le mode Form
      if (mode === 'expert' && global.IniControls && global.IniControls.stopAllLives) {
        global.IniControls.stopAllLives();
      }

      if (ed.mode === 'expert' && ed.expertEl) {
        // ⭐ Re-parse mais ne marque dirty QUE si le contenu a changé
        try {
          ed.sections = global.IniParser.parseIni(ed.expertEl.value);
          const normalized = global.IniParser.serializeIni(ed.sections);
          if (normalized !== ed.serializedAtLoad) {
            markDirty(ed);
          }
        } catch (e) {
          console.warn('[settingsIni] parse expert KO', e);
        }
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

    async function save(ed) {
    if (!ed.loaded) {
      setStatus(ed, '⚠️ Rien à enregistrer.', '#ff6b6b');
      return;
    }
    let content;
    try {
      if (ed.mode === 'expert') {
        content = ed.expertEl.value;
        ed.sections = global.IniParser.parseIni(content);
      }

      // ⭐ v1.6.1 — Force le JOY UNIQUEMENT si le device actuel est absent
      //    ou non assigné. Respecte les JOY assignés manuellement à des
      //    accessoires (handbrake DIY, shifter DIY, pédalier custom, boutons
      //    sur un device secondaire, etc.).
      //
      //    Avant : tous les JOY=n étaient écrasés au device actif → cassait
      //    les configs multi-device (ODDOR + SparkFun + FANATEC + A7 Gear).
      if (ed.file === 'controls.ini' &&
          (ed.currentInputMethod === 'X360' || ed.currentInputMethod === 'WHEEL')) {
        try {
          // 1. Liste des indexes CON existants dans [CONTROLLERS]
          const ctrlSec = ed.sections.find(s => s.name === 'CONTROLLERS');
          const existingIndexes = new Set();
          if (ctrlSec) {
            for (const e of ctrlSec.entries) {
              if (e.kind !== 'kv') continue;
              const m = e.key.match(/^CON(\d+)$/);
              if (m) existingIndexes.add(parseInt(m[1], 10));
            }
          }

          // 2. Device actif du mode
          const r = await window.api.getPreferredDeviceForMode(ed.currentInputMethod);
          if (r && r.success && r.device && r.device.acIndex !== null) {
            const idx = String(r.device.acIndex);
            let touched = 0;
            let respected = 0;

            for (const sec of ed.sections) {
              if (!sec.name) continue;
              if (sec.name === 'SHIFTER') continue;   // levier séparé

              for (const entry of sec.entries) {
                if (entry.kind !== 'kv' || entry.key !== 'JOY') continue;
                const currentJoy = parseInt(entry.value, 10);

                // ⭐ On respecte si le JOY pointe sur un device existant
                if (!isNaN(currentJoy) && currentJoy >= 0 && existingIndexes.has(currentJoy)) {
                  respected++;
                  continue;
                }

                // Sinon (JOY=-1 ou device absent), on force au device actif
                if (String(entry.value) !== idx) {
                  entry.value = idx;
                  touched++;
                }
              }
            }

            if (touched > 0 || respected > 0) {
              console.log('[SettingsIni] JOY : ' + touched + ' forcé(s) au device actif (' + idx + '), ' + respected + ' respecté(s)');
            }
          }
        } catch (e) {
          console.warn('[SettingsIni] force JOY KO', e);
        }
      }

      // ⭐ v1.6.0 — Pour controls.ini, force INPUT_METHOD dans [HEADER] AVANT
      //    sérialisation. Sinon le profil hérite du INPUT_METHOD du controls.ini
      //    compilé (souvent WHEEL) → incohérence mode.
      if (ed.file === 'controls.ini' && ed.currentInputMethod) {
        let headerSec = ed.sections.find(s => s.name === 'HEADER');
        if (!headerSec) {
          headerSec = { name: 'HEADER', entries: [] };
          ed.sections.unshift(headerSec);
        }
        const imEntry = headerSec.entries.find(e => e.kind === 'kv' && e.key === 'INPUT_METHOD');
        if (imEntry) imEntry.value = ed.currentInputMethod;
        else headerSec.entries.push({
          kind: 'kv',
          key: 'INPUT_METHOD',
          value: ed.currentInputMethod,
          comment: '',
        });
      }

      // ⭐ v1.6.0 — Nettoie les XBOXBUTTON résiduels dans les sections pédales
      //    (injection incorrecte des versions précédentes)
      if (ed.file === 'controls.ini' && ed.currentInputMethod === 'X360') {
        const pedalSections = ['STEER', 'THROTTLE', 'BRAKES', 'CLUTCH', 'HANDBRAKE'];
        for (const sec of ed.sections) {
          if (pedalSections.indexOf(sec.name) === -1) continue;
          sec.entries = sec.entries.filter(e =>
            !(e.kind === 'kv' && e.key === 'XBOXBUTTON')
          );
        }
      }

      if (ed.mode !== 'expert') {
        content = global.IniParser.serializeIni(ed.sections);
      }
    } catch (e) {
      setStatus(ed, '❌ ' + e.message, '#ff6b6b');
      return;
    }

    setStatus(ed, '⏳ Enregistrement...');

    // ⭐ v1.6.0 — Pour controls.ini, on écrit dans le PROFIL ACTIF
    //    (controls.ini sera compilé séparément au lancement de course).
    let res = null;

    if (ed.file === 'controls.ini' && ed.activeProfileFilename) {
      // Cas 1 : profil actif connu → on l'écrase
      // ⭐ v1.6.0 — Priorité à ed.currentInputMethod (source de vérité)
      const inputMethod = ed.currentInputMethod
        || getInputMethodFromSections(ed.sections)
        || 'WHEEL';
      try {
        res = await window.api.saveControllerProfile(ed.activeProfileFilename, content, inputMethod);
        if (res && res.success) {
          console.log('[SettingsIni] Profil sauvegardé :', ed.activeProfileFilename, '(mode', inputMethod + ')');
        }
      } catch (e) {
        res = { success: false, error: e.message };
      }

    } else if (ed.file === 'controls.ini' && !ed.activeProfileFilename) {
      // Cas 2 : aucun profil actif → prompt pour en créer un
      const msgT = (window.I18n && window.I18n.tFr)
        ? window.I18n.tFr('Nom du nouveau profil :')
        : 'Nom du nouveau profil :';
      const titleT = (window.I18n && window.I18n.tFr)
        ? window.I18n.tFr('Créer un profil')
        : 'Créer un profil';

      let name;
      if (window.QacrlDialogs && typeof window.QacrlDialogs.prompt === 'function') {
        name = await window.QacrlDialogs.prompt(msgT, 'Mon profil', titleT);
      } else {
        name = prompt(msgT, 'Mon profil');
      }

      if (!name) { setStatus(ed, ''); return; }

      // ⭐ v1.6.0 — Priorité à ed.currentInputMethod (source de vérité)
      const inputMethod = ed.currentInputMethod
        || getInputMethodFromSections(ed.sections)
        || 'WHEEL';
      try {
        res = await window.api.saveControllerProfile(name, content, inputMethod);
        if (res && res.success) {
          ed.activeProfileFilename = res.filename;
          updateProfileBadge(ed);
          console.log('[SettingsIni] Nouveau profil créé :', res.filename, '(mode', inputMethod + ')');
        }
      } catch (e) {
        res = { success: false, error: e.message };
      }

    } else {
      // Cas 3 : fichiers non-controls (video.ini, audio.ini) → écriture directe
      try {
        res = await window.api.writeIniFile(ed.file, content);
      } catch (e) {
        res = { success: false, error: e.message };
      }
    }

    try {
      if (res && res.success) {
        ed.dirty = false;
        try {
          ed.serializedAtLoad = global.IniParser.serializeIni(ed.sections);
        } catch (e) {
          ed.serializedAtLoad = content;
        }
        const btn = ed.container.querySelector('[data-role="save"]');
        if (btn) btn.classList.remove('dirty');
        const t = new Date().toLocaleTimeString();
        const label = (ed.file === 'controls.ini' && ed.activeProfileFilename)
          ? 'Profil sauvegardé à ' + t
          : 'Enregistré à ' + t;
        setStatus(ed, '✅ ' + label, '#4caf50');
        setTimeout(() => { if (!ed.dirty) setStatus(ed, '', ''); }, 3000);
      } else {
        setStatus(ed, '❌ ' + ((res && res.error) || 'Erreur'), '#ff6b6b');
      }
    } catch (e) {
      setStatus(ed, '❌ ' + e.message, '#ff6b6b');
    }
  }

  async function reload(ed) {
    if (ed.dirty) {
      const ok = window.QacrlDialogs
        ? await window.QacrlDialogs.confirm('Des modifications non enregistrées seront perdues. Continuer ?', { variant: 'warning' })
        : confirm('Des modifications non enregistrées seront perdues. Continuer ?');
      if (!ok) return;
    }
    ed.loaded = false;
    ed.loading = false;
    ed.sections = null;
    ed.rawContent = '';
    ed.dirty = false;
    ed.serializedAtLoad = null;
    setStatus(ed, '');
    const btn = ed.container.querySelector('[data-role="save"]');
    if (btn) btn.classList.remove('dirty');
    await ensureLoaded(ed.file);
  }
  
  // -------------------------------------------------------------------------
  // Helpers publics (utilisés par settingsSearch.js)
  // -------------------------------------------------------------------------
  function getEditor(filename) {
    return editors[filename] || null;
  }

  function setValueInEditor(filename, sectionName, key, newValue) {
    const ed = editors[filename];
    if (!ed || !ed.sections) return false;
    const sec = ed.sections.find(s => s.name === sectionName);
    if (!sec) return false;
    const entry = sec.entries.find(e => e.kind === 'kv' && e.key === key);
    if (!entry) return false;
    entry.value = newValue;
    markDirty(ed);
    return true;
  }

  async function saveByName(filename) {
    const ed = editors[filename];
    if (!ed || !ed.loaded) return false;
    await save(ed);
    return true;
  }

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
          '<span class="ini-profile-badge" data-role="profile-badge" style="display:none;"></span>' +
          '<span class="ini-status" data-role="status"></span>' +
          '<button class="filter-btn ini-btn-calib" data-role="calib" title="Calibrer automatiquement mon volant" style="display:none;">🎯 Calibrer</button>' +
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
      activeProfileFilename: null,   // ⭐ v1.6.0 — profil source pour Save
      currentInputMethod:    null,   // ⭐ v1.6.0 — mode courant (source de vérité layout)
      deviceTypesByName:     {},     // ⭐ v1.6.0-UX — name → 'wheel'|'gamepad'|'other'
      statusEl:     container.querySelector('[data-role="status"]'),
      formEl:       container.querySelector('[data-role="form"]'),
      expertEl:     container.querySelector('[data-role="expert"]'),
      tabsEl:       container.querySelector('[data-role="tabs"]'),
      toggleBtns:   Array.from(container.querySelectorAll('.ini-mode-btn')),
      currentTab:   null,
    };
    editors[filename] = ed;

    ed.toggleBtns.forEach(b =>
      b.addEventListener('click', () => setMode(ed, b.dataset.mode)));

    const btnSave  = container.querySelector('[data-role="save"]');
    const btnReset = container.querySelector('[data-role="reset"]');
    const btnCalib = container.querySelector('[data-role="calib"]');
    if (btnSave)  btnSave.addEventListener('click', () => save(ed));
    if (btnReset) btnReset.addEventListener('click', () => reload(ed));
    if (btnCalib) btnCalib.addEventListener('click', () => {
      if (global.WheelCalibration && global.WheelCalibration.start) {
        global.WheelCalibration.start();
      }
    });

    ed.expertEl.addEventListener('input', () => markDirty(ed));

    // ⭐ v1.6.0 — Le bouton Calibrer est masqué par défaut (style="display:none").
    //    Il sera rendu visible par updateCalibrateButtonVisibility() UNIQUEMENT
    //    si le fichier est controls.ini ET INPUT_METHOD=WHEEL (ou inconnu).
    //    L'ancien masquage "filename !== controls.ini" est donc obsolète.

    // ⭐ v1.6.0 — L'onglet actif est calculé à CHAQUE renderForm, pas
    //    à l'init. On garde juste une amorce "axes" ici ; renderForm
    //    corrigera automatiquement selon l'INPUT_METHOD réel.
    ed.currentTab = 'axes';

    if (filename === 'video.ini' && window.api && typeof window.api.listPpfilters === 'function') {
      window.api.listPpfilters()
        .then(r => { if (r && r.success) ed.ppfilters = r.filters || []; })
        .catch(() => {});
    }
  }

  let _skipDirtyCheck = false;  // ⭐ v1.6.0 — flag anti-boucle pour le re-clic simulé

  function init() {
    const apiErr = checkApi();
    if (apiErr) console.error('[settingsIni] init KO :', apiErr);

    document.querySelectorAll('.ini-editor[data-ini-file]').forEach(initEditor);

    // ⭐ v1.6.0 — Interception en phase de CAPTURE pour bloquer le switchSubTab
    //    si l'éditeur controls.ini est dirty. On affiche la modale, puis on
    //    re-simule le clic si l'utilisateur valide.
    document.addEventListener('click', async (e) => {
      if (_skipDirtyCheck) { _skipDirtyCheck = false; return; }

      const btn = e.target.closest('.subtab-btn');
      if (!btn) return;

      const onclick = btn.getAttribute('onclick') || '';
      const m = onclick.match(/switchSubTab\(event,\s*'([^']+)'\)/);
      if (!m) return;

      const newSubtabId = m[1];
      // Si on va vers controls (peu importe l'origine), pas de check
      if (newSubtabId === 'subtab-settings-controls') return;

      // Cherche un éditeur controls.ini dirty
      const ed = editors['controls.ini'];
      if (!ed || !ed.dirty) return;

      // Éditeur dirty + on quitte → bloque + demande
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const ok = await promptSaveIfDirty(ed);
      if (!ok) return; // Annulé

      // Continue le switch
      _skipDirtyCheck = true;
      btn.click();
    }, true);  // ← phase capture

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

    document.querySelectorAll('.subtab-content.active .ini-editor[data-ini-file]').forEach(c => {
      ensureLoaded(c.dataset.iniFile);
    });
  }

  async function reloadByName(filename) {
    const ed = editors[filename];
    if (!ed) return;
    // Reset forcé sans confirmation
    ed.loaded = false;
    ed.loading = false;
    ed.sections = null;
    ed.rawContent = '';
    ed.dirty = false;
    ed.serializedAtLoad = null;
    // ⭐ v1.6.0 — Reset aussi le mode courant et le profil source
    //    (seront re-détectés dans ensureLoaded)
    ed.currentInputMethod = null;
    ed.activeProfileFilename = null;
    const btn = ed.container.querySelector('[data-role="save"]');
    if (btn) btn.classList.remove('dirty');
    setStatus(ed, '');
    await ensureLoaded(filename);
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Bascule le mode de l'éditeur controls.ini SANS recharger
  //    le fichier. Utilisé par controllerPresets.js quand le picker change.
  //
  //    Effet :
  //      1. ed.currentInputMethod = newMode
  //      2. Force INPUT_METHOD dans les sections (en mémoire)
  //      3. Re-render avec le bon layout
  //      4. Met à jour le bouton Calibrer
  // -------------------------------------------------------------------------
  function setInputMethodForEditor(newMethod) {
    const ed = editors['controls.ini'];
    if (!ed) return;

    const m = String(newMethod || '').toUpperCase();
    if (!['WHEEL', 'X360', 'KEYBOARD'].includes(m)) return;

    ed.currentInputMethod = m;

    // Force INPUT_METHOD dans [HEADER] (mémoire uniquement)
    if (ed.sections) {
      let headerSec = ed.sections.find(s => s.name === 'HEADER');
      if (!headerSec) {
        headerSec = { name: 'HEADER', entries: [] };
        ed.sections.unshift(headerSec);
      }
      const entry = headerSec.entries.find(e => e.kind === 'kv' && e.key === 'INPUT_METHOD');
      if (entry) entry.value = m;
      else headerSec.entries.push({ kind: 'kv', key: 'INPUT_METHOD', value: m, comment: '' });
    }

    console.log('[SettingsIni] setInputMethodForEditor :', m);
    renderForm(ed);
    updateCalibrateButtonVisibility(ed);
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Retourne le mode courant de l'éditeur controls.ini
  // -------------------------------------------------------------------------
  function getCurrentInputMethod() {
    const ed = editors['controls.ini'];
    return ed ? ed.currentInputMethod : null;
  }

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — Modale "Modifications non sauvegardées"
  //
  //   Retourne :
  //     true  → on peut continuer (sauvegardé ou abandonné)
  //     false → l'utilisateur a annulé (rester sur place)
  //
  //   Si l'éditeur n'est pas dirty → retourne true immédiatement (no-op).
  // -------------------------------------------------------------------------
  async function promptSaveIfDirty(ed) {
    if (!ed || !ed.dirty) return true;
    if (!window.QacrlDialogs || typeof window.QacrlDialogs.open !== 'function') {
      // Fallback : confirm natif
      const msg = 'Modifications non sauvegardées. Sauvegarder ?';
      const ok = confirm(msg);
      if (ok) { await save(ed); return true; }
      return false;
    }

    const T = (s) => (window.I18n && window.I18n.tFr) ? window.I18n.tFr(s) : s;
    const profileName = ed.activeProfileFilename
      ? ed.activeProfileFilename.replace(/\.ini$/i, '')
      : 'controls.ini';

    const choice = await window.QacrlDialogs.open({
      type: 'confirm',
      variant: 'warning',
      icon: '💾',
      title: T('Modifications non sauvegardées'),
      message: T('Le profil "{name}" a été modifié.\nVoulez-vous sauvegarder avant de continuer ?')
        .replace('{name}', profileName),
      buttons: [
        { id: 'cancel',  label: T('Annuler'),          variant: 'cancel'  },
        { id: 'discard', label: T('Abandonner'),        variant: 'danger'  },
        { id: 'save',    label: '💾 ' + T('Sauvegarder'), variant: 'primary' },
      ],
    });

    if (choice === 'cancel') return false;

    if (choice === 'discard') {
      // Reload depuis le profil source (perte des modifs)
      await reload(ed);
      return true;
    }

    if (choice === 'save') {
      await save(ed);
      return !ed.dirty;  // true si save OK
    }

    return false;
  }

  global.SettingsIni = {
    init,
    ensureLoaded,
    getEditor,
    setValueInEditor,
    saveByName,
    reloadByName,
    updateCalibrateButtonVisibility,   // ⭐ v1.6.0
    setInputMethodForEditor,           // ⭐ v1.6.0
    getCurrentInputMethod,             // ⭐ v1.6.0
    promptSaveIfDirty,                 // ⭐ v1.6.0
  };
})(window);