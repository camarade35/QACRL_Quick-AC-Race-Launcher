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
   */
  function makeCollapsibleSection(sectionId, titleText, bodyChildren, extraBadge) {
    const wrap = el('div', {
      class: 'qacrl-ctrl-section' + (isCollapsed(sectionId) ? ' collapsed' : ''),
      'data-section-id': sectionId,
    });

    const header = el('div', { class: 'qacrl-ctrl-section-header' });

    const arrow = el('span', { class: 'qacrl-ctrl-section-arrow' });
    arrow.textContent = '▸';
    header.appendChild(arrow);

    const title = el('span', { class: 'qacrl-ctrl-section-title' });
    title.textContent = titleText;
    header.appendChild(title);

    if (extraBadge) {
      const badge = el('span', { class: 'qacrl-ctrl-section-badge' });
      badge.innerHTML = extraBadge;
      header.appendChild(badge);
    }

    header.addEventListener('click', () => {
      const nowCollapsed = !wrap.classList.contains('collapsed');
      wrap.classList.toggle('collapsed', nowCollapsed);
      setCollapsed(sectionId, nowCollapsed);
    });

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
        if (kv) return kv[1].toUpperCase();
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
    root.appendChild(renderDevicesSection());
    root.appendChild(renderSetupsSection());
  }

  // --- Section 1 : choix du contrôleur principal ---
  function renderMethodSection() {
    const picker = el('div', { class: 'qacrl-ctrl-method-picker' });

    const methods = [
      { id: 'WHEEL',    icon: '🏎️', label: T('Volant')   },
      { id: 'GAMEPAD',  icon: '🎮', label: T('Manette')  },
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

    // Badge à droite du titre : affiche le mode actif
    const badge = currentMethod
      ? '<code style="background:rgba(var(--accent-rgb),0.15);color:var(--accent);padding:2px 8px;border-radius:4px;font-weight:700;font-size:0.72rem;">' + escapeHtml(currentMethod) + '</code>'
      : '';

    return makeCollapsibleSection(
      'method',
      '🎮 ' + T('Contrôleur principal'),
      [picker, hint],
      badge
    );
  }

  async function onMethodClick(method) {
    if (method === currentMethod) return;

    const btn = root.querySelector('.qacrl-ctrl-method-btn[data-method="' + method + '"]');
    if (btn) btn.disabled = true;

    try {
      const res = await window.api.setInputMethod(method);
      if (!res || !res.success) {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        return;
      }
      currentMethod = method;
      renderRoot();

      if (global.SettingsIni && typeof global.SettingsIni.reloadByName === 'function') {
        try { await global.SettingsIni.reloadByName('controls.ini'); } catch (e) {}
      }
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
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
        badge
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
      badge
    );
  }

  // --- Section 3 : profils sauvegardés ---
  function renderSetupsSection() {
    const bodyChildren = [];

    if (setups.length === 0) {
      const empty = el('div', { class: 'qacrl-ctrl-empty' });
      empty.textContent = T('Aucun profil sauvegardé dans savedsetups/.');
      bodyChildren.push(empty);
    }

    const row = el('div', { class: 'qacrl-ctrl-setups-row' });

    // Dropdown des profils
    const sel = el('select', { class: 'qacrl-ctrl-setup-select' });
    if (setups.length === 0) {
      const opt = el('option');
      opt.value = '';
      opt.textContent = '— ' + T('Aucun profil') + ' —';
      sel.appendChild(opt);
      sel.disabled = true;
    } else {
      for (const s of setups) {
        const opt = el('option');
        opt.value = s.filename;
        opt.textContent = s.name;
        sel.appendChild(opt);
      }
    }
    row.appendChild(sel);

    // Charger
    const loadBtn = el('button', { type: 'button', class: 'qacrl-ctrl-setup-btn qacrl-ctrl-setup-btn-primary' });
    loadBtn.textContent = '📥 ' + T('Charger');
    loadBtn.disabled = (setups.length === 0);
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
    delBtn.disabled = (setups.length === 0);
    delBtn.addEventListener('click', () => onDeleteSetup(sel.value));
    row.appendChild(delBtn);

    bodyChildren.push(row);

    const badge = setups.length > 0
      ? '<span style="background:var(--bg-elevated);color:var(--text-secondary);padding:2px 8px;border-radius:10px;font-weight:700;font-size:0.7rem;">' + setups.length + '</span>'
      : '';

    return makeCollapsibleSection(
      'setups',
      '💾 ' + T('Mes profils sauvegardés'),
      bodyChildren,
      badge
    );
  }

  async function onLoadSetup(filename) {
    if (!filename) return;
    const setup = setups.find(s => s.filename === filename);
    const displayName = setup ? setup.name : filename;

    const msg = T('Charger le profil "{name}" ? Un backup de ta configuration actuelle sera créé automatiquement.')
      .replace('{name}', displayName);

    const ok = (global.QacrlDialogs && typeof global.QacrlDialogs.confirm === 'function')
      ? await global.QacrlDialogs.confirm(msg, { variant: 'warning', okLabel: T('Charger'), cancelLabel: T('Annuler') })
      : confirm(msg);
    if (!ok) return;

    try {
      const res = await window.api.applyControllerSetup(filename);
      if (!res || !res.success) {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        return;
      }

      // Recharge l'éditeur controls.ini pour afficher les nouvelles valeurs
      if (global.SettingsIni && typeof global.SettingsIni.reloadByName === 'function') {
        try { await global.SettingsIni.reloadByName('controls.ini'); } catch (e) {}
      }
      // Recharge l'INPUT_METHOD (il peut avoir changé)
      currentMethod = await readCurrentMethod();
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
      const listRes = await window.api.listSavedControllerSetups();
      if (listRes && listRes.success) setups = listRes.setups || [];
      renderRoot();
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