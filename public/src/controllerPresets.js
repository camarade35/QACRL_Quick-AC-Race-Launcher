// public/src/controllerPresets.js
// v1.5.0 — Panneau "Contrôleur principal" dans Paramètres > Contrôles.
//
// Gère 3 choses :
//   1. Choix du contrôleur principal (WHEEL / GAMEPAD / KEYBOARD)
//      → écrit INPUT_METHOD dans [HEADER] de controls.ini
//   2. Liste des devices AC détectés (lecture seule, depuis cfg/controllers/*.ini)
//   3. Gestion des profils sauvegardés (charger / sauver / supprimer)
//      depuis cfg/controllers/savedsetups/*.ini

(function (global) {
  'use strict';

  let initialized = false;
  let root = null;
  let currentMethod = null;
  let devices = [];
  let setups = [];
  let activePerMode = { WHEEL: null, X360: null, KEYBOARD: null };  // ⭐ v1.6.0
  let preferredDevice = null;      // ⭐ v1.6.0-UX — { name, type, acIndex }
  let deviceCandidates = [];       // ⭐ v1.6.0-UX — liste filtrée

  // -------------------------------------------------------------------------
  // Helpers UI
  // -------------------------------------------------------------------------
  function T(s) {
    return (global.I18n && global.I18n.tFr) ? global.I18n.tFr(s) : s;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // -------------------------------------------------------------------------
  // Section pliable (chevron + persistance localStorage)
  // -------------------------------------------------------------------------
  const COLLAPSE_KEY_PREFIX = 'qacrlCtrlSectionCollapsed:';

  function isCollapsed(sectionId) {
    try {
      return localStorage.getItem(COLLAPSE_KEY_PREFIX + sectionId) === '1';
    } catch (e) { return false; }
  }

  function setCollapsed(sectionId, collapsed) {
    try {
      localStorage.setItem(COLLAPSE_KEY_PREFIX + sectionId, collapsed ? '1' : '0');
    } catch (e) {}
  }

  /**
   * Crée une section pliable avec un titre cliquable.
   * @param {string} sectionId   Identifiant unique (pour localStorage)
   * @param {string} titleText   Texte du titre (déjà traduit)
   * @param {Node|Node[]} bodyChildren  Contenu de la section
   * @param {string=} extraBadge  HTML optionnel affiché à droite du titre
   * @param {object=} options     { alwaysOpen: boolean } → si vrai, pas de repli
   */
  function makeCollapsibleSection(sectionId, titleText, bodyChildren, extraBadge, options) {
    const opts = options || {};
    const alwaysOpen = !!opts.alwaysOpen;
    const defaultCollapsed = !!opts.defaultCollapsed;

    // ⭐ v1.6.0-UX — État initial : si pas de préférence sauvegardée,
    //    on applique `defaultCollapsed` (au lieu du déplié par défaut).
    let initialState;
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY_PREFIX + sectionId);
      initialState = (saved === null) ? defaultCollapsed : (saved === '1');
    } catch (e) {
      initialState = defaultCollapsed;
    }

    const wrap = el('div', {
      class: 'qacrl-ctrl-section' + (!alwaysOpen && initialState ? ' collapsed' : ''),
      'data-section-id': sectionId,
    });

    const header = el('div', { class: 'qacrl-ctrl-section-header' });

    // ⭐ v1.6.0 — Flèche masquée pour les sections toujours ouvertes
    if (!alwaysOpen) {
      const arrow = el('span', { class: 'qacrl-ctrl-section-arrow' });
      arrow.textContent = '▸';
      header.appendChild(arrow);
    }

    const title = el('span', { class: 'qacrl-ctrl-section-title' });
    title.textContent = titleText;
    header.appendChild(title);

    if (extraBadge) {
      const badge = el('span', { class: 'qacrl-ctrl-section-badge' });
      badge.innerHTML = extraBadge;
      header.appendChild(badge);
    }

    // ⭐ v1.6.0 — Pas de listener si alwaysOpen (curseur par défaut, pas de pli)
    if (!alwaysOpen) {
      header.addEventListener('click', () => {
        const nowCollapsed = !wrap.classList.contains('collapsed');
        wrap.classList.toggle('collapsed', nowCollapsed);
        setCollapsed(sectionId, nowCollapsed);
      });
    } else {
      header.style.cursor = 'default';
      header.classList.add('qacrl-ctrl-section-header-static');
    }

    wrap.appendChild(header);

    const body = el('div', { class: 'qacrl-ctrl-section-body' });
    const items = Array.isArray(bodyChildren) ? bodyChildren : [bodyChildren];
    for (const c of items) {
      if (!c) continue;
      if (typeof c === 'string') body.appendChild(document.createTextNode(c));
      else body.appendChild(c);
    }
    wrap.appendChild(body);

    return wrap;
  }

  // -------------------------------------------------------------------------
  // Lecture de l'INPUT_METHOD actuel depuis controls.ini
  // -------------------------------------------------------------------------
  async function readCurrentMethod() {
    // ⭐ v1.6.0 — Lit d'abord settings.inputMethod (source de vérité)
    //    Fallback : contrôle dans controls.ini pour compat
    try {
      const res = await window.api.getInputMethod();
      if (res && res.success && res.method) {
        let m = String(res.method).toUpperCase();
        if (m === 'GAMEPAD') m = 'X360';
        if (['WHEEL', 'X360', 'KEYBOARD'].includes(m)) return m;
      }
    } catch (e) {
      console.warn('[ControllerPresets] getInputMethod KO', e);
    }

    // Fallback : lit controls.ini
    try {
      const res = await window.api.readIniFile('controls.ini');
      if (!res || !res.success) return null;
      const lines = String(res.content || '').split(/\r?\n/);
      let inHeader = false;
      for (const raw of lines) {
        const line = raw.trim();
        const secMatch = line.match(/^\[([^\]]+)\]\s*$/);
        if (secMatch) {
          inHeader = (secMatch[1].trim().toUpperCase() === 'HEADER');
          continue;
        }
        if (!inHeader) continue;
        const kv = line.match(/^INPUT_METHOD\s*=\s*(\w+)/i);
        if (kv) {
          let m = kv[1].toUpperCase();
          if (m === 'GAMEPAD') m = 'X360';
          return m;
        }
      }
    } catch (e) {
      console.warn('[ControllerPresets] readCurrentMethod KO', e);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Rendu principal
  // -------------------------------------------------------------------------
  function renderRoot() {
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(renderMethodSection());
    root.appendChild(renderActiveDeviceSection());   // ⭐ v1.6.0-UX
    root.appendChild(renderDevicesSection());
    root.appendChild(renderSetupsSection());
  }

  // ⭐ v1.6.0-UX — Bandeau "Périphérique actif" (sous le picker)
  function renderActiveDeviceSection() {
    // Keyboard → pas de device
    if (currentMethod === 'KEYBOARD') {
      return el('div'); // vide
    }

    if (!preferredDevice) {
      // Aucun device détecté
      const warn = el('div', { class: 'qacrl-ctrl-device-banner warn' });
      warn.innerHTML = '⚠️ ' + T('Aucun périphérique détecté pour le mode') + ' ' +
        '<strong>' + escapeHtml(currentMethod) + '</strong>. ' +
        T('Branche un device et relance QACRL.');
      return warn;
    }

    const banner = el('div', { class: 'qacrl-ctrl-device-banner ok' });

    const icon = preferredDevice.type === 'wheel' ? '🏎️'
               : preferredDevice.type === 'gamepad' ? '🎮'
               : '🔌';

    const label = el('div', { class: 'qacrl-ctrl-device-banner-label' });
    label.innerHTML = icon + ' <strong>' + escapeHtml(preferredDevice.name) + '</strong>'
                    + ' <span class="qacrl-ctrl-device-banner-sub">'
                    + T('Périphérique actif') + '</span>';

    banner.appendChild(label);

    // Si plusieurs devices compatibles → dropdown pour changer
    if (deviceCandidates.length > 1) {
      const sel = el('select', { class: 'qacrl-ctrl-device-banner-select' });
      for (const d of deviceCandidates) {
        const opt = el('option');
        opt.value = d.name;
        opt.textContent = d.name;
        if (d.name === preferredDevice.name) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', async () => {
        try {
          const res = await window.api.setPreferredDeviceForMode(currentMethod, sel.value);
          if (res && res.success) {
            await loadAll();
            // ⭐ Force le re-render de l'éditeur controls.ini pour propager
            if (global.SettingsIni && typeof global.SettingsIni.reloadByName === 'function') {
              try { await global.SettingsIni.reloadByName('controls.ini'); } catch (e) {}
            }
          }
        } catch (e) {
          console.warn('[ControllerPresets] setPreferredDeviceForMode KO', e);
        }
      });
      banner.appendChild(sel);
    } else {
      const badge = el('span', { class: 'qacrl-ctrl-device-banner-badge' });
      badge.textContent = T('unique');
      banner.appendChild(badge);
    }

    return banner;
  }

  // --- Section 1 : choix du contrôleur principal ---
  function renderMethodSection() {
    const picker = el('div', { class: 'qacrl-ctrl-method-picker' });

    // ⚠️ L'id est la valeur technique écrite dans INPUT_METHOD
    //    (voir main.js : CONTROLLER_INPUT_METHODS = ['WHEEL', 'X360', 'KEYBOARD'])
    const methods = [
      { id: 'WHEEL',    icon: '🏎️', label: T('Volant')   },
      { id: 'X360',     icon: '🎮', label: T('Manette')  },
      { id: 'KEYBOARD', icon: '⌨️', label: T('Clavier') },
    ];

    for (const m of methods) {
      const isActive = (currentMethod === m.id);
      const btn = el('button', {
        type: 'button',
        class: 'qacrl-ctrl-method-btn' + (isActive ? ' active' : ''),
        'data-method': m.id,
      });
      btn.innerHTML = '<span class="qacrl-ctrl-method-icon">' + m.icon + '</span>'
                    + '<span class="qacrl-ctrl-method-label">' + m.label + '</span>';
      btn.addEventListener('click', () => onMethodClick(m.id));
      picker.appendChild(btn);
    }

    // Hint "INPUT_METHOD = X"
    const hint = el('div', { class: 'qacrl-ctrl-method-hint' });
    if (currentMethod) {
      hint.innerHTML = '→ <code>INPUT_METHOD=' + escapeHtml(currentMethod) + '</code> '
                     + '<span class="qacrl-ctrl-hint-dim">'
                     + escapeHtml(T('(écrit dans controls.ini)'))
                     + '</span>';
    } else {
      hint.innerHTML = '<span class="qacrl-ctrl-hint-warn">⚠️ '
                     + escapeHtml(T('Aucun INPUT_METHOD défini dans controls.ini'))
                     + '</span>';
    }

    // ⭐ v1.6.0-UX — Le picker est affiché SANS encart pliable :
    //    juste les 3 boutons + le hint, dans un wrapper minimal.
    const wrap = el('div', { class: 'qacrl-ctrl-section qacrl-ctrl-section-bare' });
    wrap.appendChild(picker);
    wrap.appendChild(hint);
    return wrap;
  }

  let _methodSwitchInProgress = false;

async function onMethodClick(method) {
  if (method === currentMethod) return;
  if (_methodSwitchInProgress) {
    console.log('[ControllerPresets] onMethodClick ignoré (switch déjà en cours)');
    return;
  }
  _methodSwitchInProgress = true;

    // ⭐ v1.6.0 — Si l'éditeur controls.ini a des modifs non sauvegardées,
    //    on demande avant de changer de mode (sinon les modifs sont perdues).
    if (global.SettingsIni && typeof global.SettingsIni.promptSaveIfDirty === 'function') {
      const ed = global.SettingsIni.getEditor && global.SettingsIni.getEditor('controls.ini');
      if (ed && ed.dirty) {
        const ok = await global.SettingsIni.promptSaveIfDirty(ed);
        if (!ok) return; // Annulé
      }
    }

    const btn = root.querySelector('.qacrl-ctrl-method-btn[data-method="' + method + '"]');
    if (btn) btn.disabled = true;

    try {
      // 1. Mémorise le nouveau mode dans settings
      const res = await window.api.setInputMethod(method);
      if (!res || !res.success) {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        return;
      }
      currentMethod = method;

      // ⭐ v1.6.0 — Recharge TOUT (device actif + candidats) après le switch.
      //    Sans ça, le bandeau "Périphérique actif" garde les données de
      //    l'ancien mode (ex : FANATEC Wheel visible en mode Manette).
      await loadAll();

      // 2. Cherche un profil actif pour ce mode
      let activeProfile = null;
      try {
        const profRes = await window.api.getActiveProfile(method);
        if (profRes && profRes.success && profRes.filename) {
          activeProfile = profRes;
        }
      } catch (e) {}

      // 3. Applique
      if (activeProfile && activeProfile.content) {
        // Profil actif trouvé → on le recharge dans l'éditeur
        console.log('[ControllerPresets] Chargement profil actif', activeProfile.filename);
        if (global.SettingsIni && typeof global.SettingsIni.reloadByName === 'function') {
          try { await global.SettingsIni.reloadByName('controls.ini'); } catch (e) {}
        }
      } else {
        // Pas de profil actif → bascule l'éditeur en mode vierge (mêmes sections, mode changé)
        console.log('[ControllerPresets] Pas de profil actif → mode éditeur bascule en', method);
        if (global.SettingsIni && typeof global.SettingsIni.setInputMethodForEditor === 'function') {
          global.SettingsIni.setInputMethodForEditor(method);
        }
        // Synchronise aussi les sections avec INPUT_METHOD (en mémoire)
        try {
          const iniRes = await window.api.readIniFile('controls.ini');
          if (iniRes && iniRes.success && window.IniParser) {
            const sections = window.IniParser.parseIni(iniRes.content);
            let headerSec = sections.find(s => s.name === 'HEADER');
            if (!headerSec) {
              headerSec = { name: 'HEADER', entries: [] };
              sections.unshift(headerSec);
            }
            const entry = headerSec.entries.find(e => e.kind === 'kv' && e.key === 'INPUT_METHOD');
            if (entry) entry.value = method;
            else headerSec.entries.push({ kind: 'kv', key: 'INPUT_METHOD', value: method, comment: '' });
            // Réécrit le contenu pour que l'éditeur le relise
            const newContent = window.IniParser.serializeIni(sections);
            // (l'éditeur relira via ensureLoaded)
            const ed = global.SettingsIni.getEditor && global.SettingsIni.getEditor('controls.ini');
            if (ed) {
              ed.sections = sections;
              ed.rawContent = newContent;
              ed.currentInputMethod = method;
              if (global.SettingsIni.reloadByName) {
                // Re-render propre
                try { await global.SettingsIni.reloadByName('controls.ini'); } catch (e) {}
              }
            }
          }
        } catch (e) {
          console.warn('[ControllerPresets] sync sections KO', e);
        }
      }
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
      // ⭐ v1.6.0 — Libère le guard après un court délai pour laisser
      //    les reloadByName en cascade se terminer proprement
      setTimeout(() => { _methodSwitchInProgress = false; }, 800);
    }
}

  // --- Section 2 : devices AC détectés ---
  function renderDevicesSection() {
    const badge = devices.length > 0
      ? '<span style="background:var(--bg-elevated);color:var(--text-secondary);padding:2px 8px;border-radius:10px;font-weight:700;font-size:0.7rem;">' + devices.length + '</span>'
      : '';

    if (devices.length === 0) {
      const empty = el('div', { class: 'qacrl-ctrl-empty' });
      empty.textContent = T('Aucun device configuré dans AC. Lance AC au moins une fois avec ton volant branché.');
      return makeCollapsibleSection(
        'devices',
        '📡 ' + T('Devices détectés par Assetto Corsa'),
        [empty],
        badge,
        { defaultCollapsed: true }   // ⭐ v1.6.0-UX — replié par défaut
      );
    }

    const list = el('div', { class: 'qacrl-ctrl-devices' });

    for (const d of devices) {
      const row = el('div', { class: 'qacrl-ctrl-device-row' });

      const typeIcon = d.type === 'wheel' ? '🏎️'
                     : d.type === 'gamepad' ? '🎮'
                     : '🔌';
      const iconEl = el('span', { class: 'qacrl-ctrl-device-icon' });
      iconEl.textContent = typeIcon;
      row.appendChild(iconEl);

      const info = el('div', { class: 'qacrl-ctrl-device-info' });
      const nameEl = el('div', { class: 'qacrl-ctrl-device-name' });
      nameEl.textContent = d.name;
      info.appendChild(nameEl);

      const meta = el('div', { class: 'qacrl-ctrl-device-meta' });
      const productShort = (d.product || '').split('-')[0].toUpperCase();
      const mapped = d.mappingCount || 0;
      const status = mapped > 0
        ? '<span class="qacrl-ctrl-device-status-ok">✅ ' + mapped + ' ' + T('section(s) mappée(s)') + '</span>'
        : '<span class="qacrl-ctrl-device-status-warn">⚠️ ' + T('non mappé') + '</span>';
      meta.innerHTML = (productShort ? '<code>' + escapeHtml(productShort) + '</code> · ' : '') + status;
      info.appendChild(meta);
      row.appendChild(info);

      list.appendChild(row);
    }

    return makeCollapsibleSection(
      'devices',
      '📡 ' + T('Devices détectés par Assetto Corsa'),
      [list],
      badge,
      { defaultCollapsed: true }   // ⭐ v1.6.0-UX — replié par défaut
    );
  }

  // --- Section 3 : profils sauvegardés ---
  // ⭐ v1.6.0 — Filtré par mode courant + sélection du profil actif
  function renderSetupsSection() {
    const bodyChildren = [];

    // Filtrer les profils compatibles avec le mode courant
    const compatible = setups.filter(s => s.method === currentMethod);
    const incompatibleCount = setups.length - compatible.length;

    // Identifier le profil actif pour ce mode
    const activeFilename = activePerMode && activePerMode[currentMethod];

    if (compatible.length === 0) {
      const empty = el('div', { class: 'qacrl-ctrl-empty' });
      if (setups.length === 0) {
        empty.textContent = T('Aucun profil sauvegardé dans savedsetups/.');
      } else {
        // ⭐ v1.6.0 — Message synthétique (le détail est en bas)
        empty.textContent = T('Aucun profil compatible avec le mode') + ' ' + currentMethod + '.';
      }
      bodyChildren.push(empty);
    }

    const row = el('div', { class: 'qacrl-ctrl-setups-row' });

    // Dropdown (profils compatibles uniquement)
    const sel = el('select', { class: 'qacrl-ctrl-setup-select' });
    if (compatible.length === 0) {
      const opt = el('option');
      opt.value = '';
      opt.textContent = '— ' + T('Aucun profil') + ' —';
      sel.appendChild(opt);
      sel.disabled = true;
    } else {
      for (const s of compatible) {
        const opt = el('option');
        opt.value = s.filename;
        // Marqueur visuel du profil actif
        const isActive = (s.filename === activeFilename);
        opt.textContent = (isActive ? '✅ ' : '') + s.name;
        if (isActive) opt.selected = true;
        sel.appendChild(opt);
      }
    }
    row.appendChild(sel);

    // Charger
    const loadBtn = el('button', { type: 'button', class: 'qacrl-ctrl-setup-btn qacrl-ctrl-setup-btn-primary' });
    loadBtn.textContent = '📥 ' + T('Charger');
    loadBtn.disabled = (compatible.length === 0);
    loadBtn.addEventListener('click', () => onLoadSetup(sel.value));
    row.appendChild(loadBtn);

    // Sauver comme...
    const saveBtn = el('button', { type: 'button', class: 'qacrl-ctrl-setup-btn' });
    saveBtn.textContent = '💾 ' + T('Sauver comme...');
    saveBtn.addEventListener('click', onSaveAs);
    row.appendChild(saveBtn);

    // Supprimer
    const delBtn = el('button', { type: 'button', class: 'qacrl-ctrl-setup-btn qacrl-ctrl-setup-btn-danger' });
    delBtn.textContent = '🗑️ ' + T('Supprimer');
    delBtn.disabled = (compatible.length === 0);
    delBtn.addEventListener('click', () => onDeleteSetup(sel.value));
    row.appendChild(delBtn);

    bodyChildren.push(row);

    // Ligne info : profils masqués
    if (incompatibleCount > 0) {
      const info = el('div', { class: 'qacrl-ctrl-empty', style: 'font-size:0.72rem;margin-top:4px;' });
      info.textContent = 'ℹ️ ' + incompatibleCount + ' ' +
        T('profil(s) masqué(s) pour d\'autres périphériques');
      bodyChildren.push(info);
    }

    const badge = setups.length > 0
      ? '<span style="background:var(--bg-elevated);color:var(--text-secondary);padding:2px 8px;border-radius:10px;font-weight:700;font-size:0.7rem;">' +
        (compatible.length === setups.length ? setups.length : compatible.length + '/' + setups.length) +
        '</span>'
      : '';

    return makeCollapsibleSection(
      'setups',
      '💾 ' + T('Mes profils sauvegardés'),
      bodyChildren,
      badge,
      // ⭐ v1.6.0-UX — Replié par défaut, mais l'utilisateur peut déplier.
      //    Contrairement aux devices, on le laisse replié sauf s'il a été
      //    explicitement déplié auparavant.
      { defaultCollapsed: false }
    );
  }

  async function onLoadSetup(filename) {
    if (!filename) return;

    // ⭐ v1.6.0 — Si l'éditeur a des modifs non sauvegardées, on demande
    if (global.SettingsIni && typeof global.SettingsIni.promptSaveIfDirty === 'function') {
      const ed = global.SettingsIni.getEditor && global.SettingsIni.getEditor('controls.ini');
      if (ed && ed.dirty) {
        const ok = await global.SettingsIni.promptSaveIfDirty(ed);
        if (!ok) return; // Annulé
      }
    }

    const setup = setups.find(s => s.filename === filename);
    const displayName = setup ? setup.name : filename;

    const msg = T('Charger le profil "{name}" ? Ta configuration actuelle sera remplacée (elle reste sauvegardée dans un backup).')
      .replace('{name}', displayName);

    const ok = (global.QacrlDialogs && typeof global.QacrlDialogs.confirm === 'function')
      ? await global.QacrlDialogs.confirm(msg, { variant: 'warning', okLabel: T('Charger'), cancelLabel: T('Annuler') })
      : confirm(msg);
    if (!ok) return;

    try {
      // ⭐ apply-controller-setup met à jour settings.inputMethod + profile actif
      const res = await window.api.applyControllerSetup(filename);
      if (!res || !res.success) {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        return;
      }

      // ⭐ v1.6.0 — Bascule le picker sur le mode du profil chargé
      if (res.method && res.method !== currentMethod) {
        currentMethod = res.method;
        console.log('[ControllerPresets] Picker basculé sur', currentMethod);
      } else {
        // Refresh au cas où
        currentMethod = await readCurrentMethod();
      }

      // Recharge l'éditeur avec le nouveau profil
      if (global.SettingsIni && typeof global.SettingsIni.reloadByName === 'function') {
        try { await global.SettingsIni.reloadByName('controls.ini'); } catch (e) {}
      }

      renderRoot();

      // Toast de confirmation
      if (global.QacrlDialogs && typeof global.QacrlDialogs.alert === 'function') {
        global.QacrlDialogs.alert('✅ ' + T('Profil "{name}" chargé.').replace('{name}', displayName), { variant: 'success' });
      }
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  async function onSaveAs() {
    const msg = T('Nom du nouveau profil :');
    let name = null;

    if (global.QacrlDialogs && typeof global.QacrlDialogs.prompt === 'function') {
      name = await global.QacrlDialogs.prompt(msg, '', T('Sauvegarder le profil'));
    } else {
      name = prompt(msg);
    }
    if (!name) return;

    try {
      const res = await window.api.saveCurrentAsSetup(name);
      if (!res || !res.success) {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        return;
      }

      // Recharge la liste
      const listRes = await window.api.listSavedControllerSetups();
      if (listRes && listRes.success) setups = listRes.setups || [];
      renderRoot();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  async function onDeleteSetup(filename) {
    if (!filename) return;
    const setup = setups.find(s => s.filename === filename);
    const displayName = setup ? setup.name : filename;

    const msg = T('Supprimer définitivement le profil "{name}" ?').replace('{name}', displayName);
    const ok = (global.QacrlDialogs && typeof global.QacrlDialogs.confirm === 'function')
      ? await global.QacrlDialogs.confirm(msg, { variant: 'warning', okLabel: T('Supprimer'), cancelLabel: T('Annuler') })
      : confirm(msg);
    if (!ok) return;

    try {
      const res = await window.api.deleteControllerSetup(filename);
      if (!res || !res.success) {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        return;
      }

      // ⭐ v1.6.0 — Si le profil supprimé était actif, l'éditeur doit se vider
      const wasActive = activePerMode && Object.values(activePerMode).includes(filename);
      if (wasActive) {
        console.log('[ControllerPresets] Profil actif supprimé → rechargement éditeur');
        // Force le rechargement de l'éditeur (qui va détecter l'absence de profil)
        if (global.SettingsIni && typeof global.SettingsIni.reloadByName === 'function') {
          try { await global.SettingsIni.reloadByName('controls.ini'); } catch (e) {}
        }
      }

      // Refresh la liste + dropdown
      await loadAll();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  // -------------------------------------------------------------------------
  // Chargement des données + rendu initial
  // -------------------------------------------------------------------------
  async function loadAll() {
    try {
      const [m, d, s] = await Promise.all([
        readCurrentMethod(),
        window.api.listAcControllerDevices().catch(() => ({ success: false, devices: [] })),
        window.api.listSavedControllerSetups().catch(() => ({ success: false, setups: [] })),
      ]);
      currentMethod = m;
      devices = (d && d.success) ? (d.devices || []) : [];
      setups  = (s && s.success) ? (s.setups || [])  : [];
      activePerMode = (s && s.success && s.activePerMode)
        ? s.activePerMode
        : { WHEEL: null, X360: null, KEYBOARD: null };

      // ⭐ v1.6.0-UX — Récupère le device actif pour le mode courant
      if (currentMethod && currentMethod !== 'KEYBOARD') {
        try {
          const r = await window.api.getPreferredDeviceForMode(currentMethod);
          if (r && r.success) {
            preferredDevice = r.device || null;
            deviceCandidates = r.candidates || [];
          }
        } catch (e) {
          console.warn('[ControllerPresets] getPreferredDeviceForMode KO', e);
          preferredDevice = null;
          deviceCandidates = [];
        }
      } else {
        preferredDevice = null;
        deviceCandidates = [];
      }
    } catch (e) {
      console.warn('[ControllerPresets] loadAll KO', e);
    }
    renderRoot();
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  function init() {
    if (initialized) return;
    initialized = true;

    // Trouve l'emplacement : juste avant l'éditeur controls.ini
    const editor = document.querySelector('#subtab-settings-controls .ini-editor[data-ini-file="controls.ini"]');
    if (!editor) {
      console.warn('[ControllerPresets] Emplacement introuvable (#subtab-settings-controls .ini-editor[data-ini-file="controls.ini"])');
      return;
    }

    root = el('div', { class: 'qacrl-ctrl-root', id: 'qacrl-ctrl-root' });
    editor.parentNode.insertBefore(root, editor);

    // Charge à l'init
    loadAll();

    // Recharge au changement d'onglet (comme SettingsIni)
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes('subtab-settings-controls')) loadAll();
      });
    });
  }

  global.ControllerPresets = { init, loadAll };
})(window);