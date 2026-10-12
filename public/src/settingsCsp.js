// public/src/settingsCsp.js
// Onglet CSP : modules activables + modale d'édition des options.

(function (global) {
  'use strict';

  let initialized = false;
  let modulesData = {};

  // ---------------------------------------------------------------------------
  // Helpers UI
  // ---------------------------------------------------------------------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function setStatus(text, color) {
    const e = document.getElementById('csp-status');
    if (!e) return;
    e.textContent = text || '';
    e.style.color = color || 'var(--text-tertiary)';
    if (text && !color) setTimeout(() => { if (e.textContent === text) e.textContent = ''; }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Chargement initial
  // ---------------------------------------------------------------------------
  async function load() {
    const container = document.getElementById('csp-container');
    if (!container) return;
    container.innerHTML = '<div class="servers-loading">⏳ Chargement des modules…</div>';

    // ⭐ Vérifie en direct si CSP est installé (via IPC, plus fiable)
    try {
      const caps = await window.api.checkCspPure();
      if (!caps || !caps.hasCSP) {
        const i18n = window.I18n;
        const title = i18n
          ? i18n.t('app.settings.cspNotInstalled.title', 'Custom Shaders Patch n\'est pas installé')
          : 'Custom Shaders Patch n\'est pas installé';
        const hint = i18n
          ? i18n.t('app.settings.cspNotInstalled.hint',
              'QACRL a détecté que CSP n\'est pas présent dans ton installation d\'Assetto Corsa.<br>L\'onglet CSP et les fonctionnalités avancées (météo Pure, plans, filtres PP...) seront indisponibles.<br><br>QACRL fonctionne quand même en <strong>mode Kunos classique</strong>.')
          : 'QACRL a détecté que CSP n\'est pas présent dans ton installation d\'Assetto Corsa.';

        container.innerHTML =
          '<div class="csp-not-installed">' +
            '<div class="csp-not-installed-icon">⚠️</div>' +
            '<div class="csp-not-installed-title">' + title + '</div>' +
            '<div class="csp-not-installed-hint">' + hint + '</div>' +
          '</div>';
        return;
      }
    } catch (e) {
      console.warn('[settingsCsp] checkCspPure KO', e);
    }

    try {
      const listRes = await window.api.listCspModules();
      if (!listRes || !listRes.success) {
        container.innerHTML = '<div class="servers-empty">⚠️ ' + ((listRes && listRes.error) || 'Erreur') + '</div>';
        return;
      }
      modulesData = {};
      const existing = new Set(listRes.modules.map(m => m.filename));
      const allModules = global.CspModules.getModules();

      await Promise.all(
        allModules
          .filter(m => existing.has(m.id + '.ini'))
          .map(async (m) => {
            try {
              const r = await window.api.readCspModule(m.id + '.ini');
              modulesData[m.id] = {
                enabled: !!(r && r.success && r.enabled),
                exists: true,
              };
            } catch (e) {
              modulesData[m.id] = { enabled: false, disableable: false, exists: true };
            }
          })
      );
      render();
    } catch (e) {
      container.innerHTML = '<div class="servers-empty">⚠️ ' + e.message + '</div>';
    }
  }

  // ---------------------------------------------------------------------------
  // Rendu de la grille
  // ---------------------------------------------------------------------------
  function render() {
    const container = document.getElementById('csp-container');
    if (!container) return;
    container.innerHTML = '';

    const categories = global.CspModules.getCategories();
    let totalShown = 0;

    for (const cat of categories) {
      const modules = global.CspModules.getModulesByCategory(cat.id)
        .filter(m => modulesData[m.id] && modulesData[m.id].exists);
      if (modules.length === 0) continue;

      const catEl = el('div', { class: 'csp-category' });
      const header = el('div', { class: 'csp-category-header' });
      header.appendChild(el('span', { class: 'csp-category-arrow', text: '▸' }));
      const catLabelTxt = (global.I18n && global.I18n.tFr) ? global.I18n.tFr(cat.label) : cat.label;
      header.appendChild(el('span', { class: 'csp-category-label', text: catLabelTxt }));
      catEl.appendChild(header);

      const content = el('div', { class: 'csp-category-content' });

      for (const m of modules) {
        const data = modulesData[m.id];
        const row = el('div', { class: 'csp-module-row' });

        const labelWrap = el('label', { class: 'csp-module-label' });

        const isDisableable = (m.disableable !== false);

        if (isDisableable) {
          const cb = el('input', { type: 'checkbox', class: 'csp-module-checkbox' });
          cb.checked = !!data.enabled;

          cb.addEventListener('change', async () => {
            const newVal = cb.checked;
            cb.disabled = true;
            setStatus('⏳ Application…');
            try {
              const r = await window.api.setCspModuleEnabled(m.id + '.ini', newVal);
              if (r && r.success) {
                modulesData[m.id].enabled = newVal;
                setStatus('✅ ' + m.label + ' ' + (newVal ? 'activé' : 'désactivé'), '#4caf50');
              } else {
                alert('Erreur : ' + ((r && r.error) || 'inconnue'));
                cb.checked = !newVal;
                setStatus('❌ Échec', '#ff6b6b');
              }
            } catch (e) {
              alert('Erreur : ' + e.message);
              cb.checked = !newVal;
              setStatus('❌ ' + e.message, '#ff6b6b');
            } finally {
              cb.disabled = false;
            }
          });

          labelWrap.appendChild(cb);
        } else {
          const dot = el('span', { class: 'csp-module-nodisable', title: 'Module non désactivable (options uniquement)' });
          dot.textContent = '•';
          labelWrap.appendChild(dot);
        }

        labelWrap.appendChild(el('span', { class: 'csp-module-name', text: m.label }));
        if (m.description) {
          labelWrap.appendChild(el('span', { class: 'csp-module-desc', text: m.description }));
        }

        row.appendChild(labelWrap);

        const openBtn = el('button', {
          type: 'button',
          class: 'csp-module-open',
          title: 'Ouvrir les options du module',
          text: '⚙️',
        });
        openBtn.addEventListener('click', () => openModuleModal(m));

        row.appendChild(openBtn);
        content.appendChild(row);
        totalShown++;
      }

      const storageKey = 'cspCollapseCategory:' + cat.id;
      let collapsed = false;
      try { collapsed = (localStorage.getItem(storageKey) === '1'); } catch (e) {}
      if (collapsed) catEl.classList.add('collapsed');

      header.addEventListener('click', () => {
        collapsed = !collapsed;
        catEl.classList.toggle('collapsed', collapsed);
        try { localStorage.setItem(storageKey, collapsed ? '1' : '0'); } catch (e) {}
      });

      catEl.appendChild(content);
      container.appendChild(catEl);
    }

    if (totalShown === 0) {
      container.innerHTML = '<div class="servers-empty">Aucun module CSP trouvé.</div>';
    }
  }

  // ---------------------------------------------------------------------------
  // Modale module
  // ---------------------------------------------------------------------------
  let modalState = null;

  function openModuleModal(module) {
    const modal = document.getElementById('csp-module-modal');
    const title = document.getElementById('csp-module-modal-title');
    const body  = document.getElementById('csp-module-modal-body');
    const statusEl = document.getElementById('csp-module-modal-status');
    if (!modal || !title || !body) return;

    title.textContent = module.label + ' — ' + module.id + '.ini';
    body.innerHTML = '<div class="servers-loading">⏳ Chargement du module…</div>';
    if (statusEl) statusEl.textContent = '';

    modalState = {
      moduleId: module.id,
      moduleLabel: module.label,
      filename: module.id + '.ini',
      sections: null,
      savedContent: '',
      dirty: false,
      searchQuery: '',
    };

    // ⭐ Reset la barre de recherche
    const searchInput = document.getElementById('csp-module-modal-search');
    if (searchInput) searchInput.value = '';

    modal.classList.add('visible');
    loadModuleIntoModal();

    // ⭐ Focus auto sur la recherche à l'ouverture
    setTimeout(() => { if (searchInput) searchInput.focus(); }, 100);
  }

  async function loadModuleIntoModal() {
    if (!modalState) return;
    const body = document.getElementById('csp-module-modal-body');
    body.innerHTML = '<div class="servers-loading">⏳ Chargement…</div>';

    try {
      // ⭐ Charge en parallèle le user INI (valeurs) et le template (structure)
      const [userRes, tplRes] = await Promise.all([
        window.api.readCspModule(modalState.filename),
        window.api.readCspTemplate(modalState.filename).catch(() => ({ success: false }))
      ]);

      if (!userRes || !userRes.success) {
        body.innerHTML = '<div class="servers-empty">⚠️ ' + ((userRes && userRes.error) || 'Erreur') + '</div>';
        return;
      }

      // Map { SECTION: { KEY: value } } depuis le user INI
      const userSectionsRaw = global.IniParser.parseIni(userRes.content);
      const userMap = {};
      for (const s of userSectionsRaw) {
        if (!s.name) continue;
        const obj = {};
        for (const e of s.entries) {
          if (e.kind === 'kv') obj[e.key] = e.value;
        }
        userMap[s.name] = obj;
      }

      // Parse le template si dispo
      let templateSections = null;
      if (tplRes && tplRes.success && global.CspTemplate) {
        try {
          templateSections = global.CspTemplate.parseTemplate(tplRes.content).sections;
        } catch (e) {
          console.warn('[settingsCsp] parse template KO :', e.message);
        }
      }

      let finalSections;
      if (templateSections && templateSections.length > 0) {
        // ⭐ Template-first : structure + ordre + labels du template
        finalSections = buildSectionsFromTemplate(templateSections, userMap);
      } else {
        console.warn('[settingsCsp] template introuvable pour ' + modalState.filename + ' → fallback');
        finalSections = global.CspParser.parseCspContent(userRes.content, global.IniParser);
      }

      modalState.sections = finalSections;
      modalState.savedContent = userRes.content;
      modalState.dirty = false;
      renderModuleModal();
    } catch (e) {
      body.innerHTML = '<div class="servers-empty">⚠️ ' + e.message + '</div>';
    }
  }

  // ---------------------------------------------------------------------------
  // ⭐ Construit les sections finales en partant du template.
  // Chaque clé du template prend sa valeur depuis le user INI si elle existe,
  // sinon sa valeur par défaut. Les clés/sections orphelines (présentes
  // uniquement côté user) sont conservées à la fin pour ne rien perdre.
  // ---------------------------------------------------------------------------
  function buildSectionsFromTemplate(templateSections, userMap) {
    const out = [];

    for (const tplSec of templateSections) {
      const userVals = userMap[tplSec.name] || {};
      const entries = [];
      const usedKeys = new Set();

      // 1) Toutes les clés du template, dans l'ordre du template
      for (const tplEntry of tplSec.entries) {
        const hasUserVal = Object.prototype.hasOwnProperty.call(userVals, tplEntry.key);
        const value = hasUserVal ? userVals[tplEntry.key] : tplEntry.defaultValue;

        entries.push({
          key: tplEntry.key,
          value,
          label: tplEntry.label || tplEntry.key,
          hidden: !!tplEntry.hidden,
          type: tplEntry.type,
          options: tplEntry.options,
          min: tplEntry.min,
          max: tplEntry.max,
          step: tplEntry.step,
          rawConstraints: tplEntry.rawConstraints || '',
          conditions: tplEntry.conditions || { visible: [], hidden: [], conflicts: [] },
          fromTemplate: !hasUserVal
        });
        usedKeys.add(tplEntry.key);
      }

      // 2) Clés user orphelines
      for (const k of Object.keys(userVals)) {
        if (usedKeys.has(k)) continue;
        entries.push({
          key: k,
          value: userVals[k],
          label: k,
          hidden: false,
          type: 'string',
          options: null,
          min: null,
          max: null,
          step: null,
          rawConstraints: '',
          fromTemplate: false,
          orphan: true
        });
      }

      out.push({
        name: tplSec.name,
        label: tplSec.label,
        hint: tplSec.hint,
        hidden: !!tplSec.hidden,
        entries
      });
    }

    // 3) Sections user orphelines
    const tplSectionNames = new Set(templateSections.map(s => s.name));
    for (const secName of Object.keys(userMap)) {
      if (tplSectionNames.has(secName)) continue;
      const vals = userMap[secName];
      if (!vals || Object.keys(vals).length === 0) continue;

      const entries = Object.keys(vals).map(k => ({
        key: k,
        value: vals[k],
        label: k,
        hidden: false,
        type: 'string',
        options: null,
        min: null,
        max: null,
        step: null,
        rawConstraints: '',
        fromTemplate: false,
        orphan: true
      }));
      out.push({ name: secName, label: null, hint: null, hidden: false, entries });
    }

    return out;
  }
  
  // ---------------------------------------------------------------------------
  // Évalue les conditions d'une clé contre les valeurs actuelles.
  // Retourne : { show: bool, disabled: bool }
  // ---------------------------------------------------------------------------
  function evaluateConditions(conditions, currentSectionName, valuesMap) {
    if (!conditions) return { show: true, disabled: false };

    // 1) Visible : TOUTES les conditions doivent être remplies
    for (const cond of conditions.visible || []) {
      const section = cond.section || currentSectionName;
      const val = (valuesMap[section] || {})[cond.key];
      let ok = false;
      if (cond.op === '==') {
        ok = (String(val) === String(cond.value));
      } else { // truthy
        ok = (val === '1' || val === 'true' || (val !== undefined && val !== '0' && val !== 'false' && val !== ''));
      }
      if (!ok) return { show: false, disabled: false };
    }

    // 2) Hidden : si UNE condition est remplie, masquer
    for (const cond of conditions.hidden || []) {
      const section = cond.section || currentSectionName;
      const val = (valuesMap[section] || {})[cond.key];
      const isTruthy = (val === '1' || val === 'true');
      if (isTruthy) return { show: false, disabled: false };
    }

    // 3) Conflits : si UNE condition est remplie, désactiver (mais rester visible)
    let disabled = false;
    for (const conf of conditions.conflicts || []) {
      const section = conf.section || currentSectionName;
      const val = (valuesMap[section] || {})[conf.key];
      const isTruthy = (val === '1' || val === 'true');
      if (isTruthy) { disabled = true; break; }
    }

    return { show: true, disabled };
  }

  // ---------------------------------------------------------------------------
  // Construit la map { SECTION: { KEY: value } } depuis les sections actuelles.
  // ---------------------------------------------------------------------------
  function buildValuesMap(sections) {
    const map = {};
    for (const sec of sections || []) {
      map[sec.name] = {};
      for (const e of sec.entries || []) {
        map[sec.name][e.key] = e.value;
      }
    }
    return map;
  }

    function renderModuleModal() {
    const body = document.getElementById('csp-module-modal-body');
    if (!body || !modalState) return;
    body.innerHTML = '';

    if (!modalState.sections || modalState.sections.length === 0) {
      body.innerHTML = '<div class="servers-empty">Aucune option détectée.</div>';
      return;
    }

    let shown = 0;

    // ⭐ Refs pour mise à jour live
    const domRefs = { sections: [], rows: [] };

    const valuesMap = buildValuesMap(modalState.sections);

    for (const sec of modalState.sections) {
      if (sec.hidden) continue;
      const visibleEntries = sec.entries.filter(e => !e.hidden);
      if (visibleEntries.length === 0) continue;

      const i18n = window.I18n;
      const secLabelText = i18n ? i18n.tSection(sec.label || sec.name) : (sec.label || sec.name);
      const secHintText  = sec.hint
        ? (i18n ? i18n.tHint(sec.hint) : sec.hint)
        : null;

      const secEl = el('div', { class: 'csp-opt-section' });
      secEl.appendChild(el('div', {
        class: 'csp-opt-section-title',
        text: secLabelText
      }));

      if (secHintText) {
        secEl.appendChild(el('div', { class: 'csp-opt-section-hint', text: secHintText }));
      }

      const rowEls = [];

      for (const entry of visibleEntries) {
        const row = el('div', { class: 'csp-opt-row' });
        const labelText = i18n ? i18n.tKey(entry.label) : entry.label;
        const tooltipText = i18n
          ? i18n.tConstraints(entry.rawConstraints || '')
          : (entry.rawConstraints || '');

        row.appendChild(el('label', {
          class: 'csp-opt-label',
          text: labelText,
          title: tooltipText,
        }));

        // ⭐ Change callback : marque dirty ET rafraîchit la visibilité conditionnelle
        const ctrl = createCspWidget(entry, () => {
          modalState.dirty = true;
          refreshConditionalVisibility();
        });
        row.appendChild(ctrl);

        secEl.appendChild(row);
        rowEls.push(row);

        domRefs.rows.push({
          sectionName: sec.name,
          entry,
          el: row
        });
      }

      body.appendChild(secEl);
      domRefs.sections.push({
        name: sec.name,
        sectionEl: secEl,
        rowEls
      });
      shown++;
    }

    if (shown === 0) {
      body.innerHTML = '<div class="servers-empty">Aucune option affichable pour ce module.</div>';
      return;
    }

    modalState.domRefs = domRefs;
    refreshConditionalVisibility();
  }

  // ---------------------------------------------------------------------------
  // Rafraîchit la visibilité des lignes selon les conditions actuelles.
  // Stocke l'état conditionnel sur chaque ref (ref._condVisible) puis
  // délègue le display final à applySearchFilter().
  // ---------------------------------------------------------------------------
  function refreshConditionalVisibility() {
    if (!modalState || !modalState.sections || !modalState.domRefs) return;

    const valuesMap = buildValuesMap(modalState.sections);

    for (const ref of modalState.domRefs.rows) {
      const cond = ref.entry.conditions;
      const hasConds = cond && (
        (cond.visible && cond.visible.length > 0)
        || (cond.hidden && cond.hidden.length > 0)
        || (cond.conflicts && cond.conflicts.length > 0)
      );

      let condVisible = true;
      let disabled = false;

      if (hasConds) {
        const result = evaluateConditions(cond, ref.sectionName, valuesMap);
        condVisible = result.show;
        disabled = result.disabled;
      }

      // ⭐ Mémorise l'état conditionnel (utilisé par applySearchFilter)
      ref._condVisible = condVisible;

      // Désactive les inputs si conflit détecté
      const controls = ref.el.querySelectorAll('input, select, textarea, button');
      controls.forEach(c => {
        if (disabled) {
          c.disabled = true;
          c.style.opacity = '0.5';
        } else {
          c.disabled = false;
          c.style.opacity = '';
        }
      });
    }

    // ⭐ applySearchFilter gère le display, les sections vides et le message
    applySearchFilter();
  }

  // ---------------------------------------------------------------------------
  // Applique le filtre de recherche aux lignes affichées.
  // Combine condition (ref._condVisible) + recherche (label/key).
  // ---------------------------------------------------------------------------
  function applySearchFilter() {
    if (!modalState || !modalState.domRefs) return;

    const q = (modalState.searchQuery || '').toLowerCase().trim();
    const body = document.getElementById('csp-module-modal-body');
    const i18n = window.I18n;

    // 1) Filtre : visible seulement si condition OK + recherche OK
    for (const ref of modalState.domRefs.rows) {
      const condOk = ref._condVisible !== false;
      const labelText = i18n ? i18n.tKey(ref.entry.label) : ref.entry.label;
      const haystack = (labelText + ' ' + ref.entry.key).toLowerCase();
      const searchOk = !q || haystack.includes(q);

      ref.el.style.display = (condOk && searchOk) ? '' : 'none';
    }

    // 2) Cache les sections sans aucune ligne visible
    let totalVisible = 0;
    for (const sref of modalState.domRefs.sections) {
      const anyVisible = sref.rowEls.some(el => el.style.display !== 'none');
      sref.sectionEl.style.display = anyVisible ? '' : 'none';
      if (anyVisible) totalVisible++;
    }

    // 3) Message "aucun résultat"
    const existingEmpty = body.querySelector('.csp-module-search-empty');
    if (existingEmpty) existingEmpty.remove();

    if (q && totalVisible === 0) {
      const empty = document.createElement('div');
      empty.className = 'csp-module-search-empty';
      const msgTpl = i18n
        ? i18n.t('app.cspModule.noResults', 'Aucune option ne correspond à "{query}"')
        : 'Aucune option ne correspond à "{query}"';
      empty.textContent = msgTpl.replace('{query}', modalState.searchQuery);
      body.appendChild(empty);
    }
  }


  function createCspWidget(entry, onChange) {
    const wrap = el('div', { class: 'csp-opt-widget' });

    if (entry.type === 'bool') {
      const cb = el('input', { type: 'checkbox', class: 'ini-checkbox' });
      cb.checked = (entry.value === '1' || entry.value === 'true');
      cb.dataset.key = entry.key;
      cb.addEventListener('change', () => {
        entry.value = cb.checked ? '1' : '0';
        onChange();
      });
      wrap.appendChild(cb);
    } else if (entry.type === 'int' || entry.type === 'float') {
      const step = entry.step != null ? entry.step : (entry.type === 'int' ? 1 : 0.01);
      const min = entry.min != null ? entry.min : 0;
      const max = entry.max != null ? entry.max : (entry.type === 'int' ? 100 : 1);
      const range = el('input', {
        type: 'range', class: 'ini-range',
        min, max, step, value: entry.value,
      });
      const num = el('input', {
        type: 'number', class: 'ini-number',
        min, max, step, value: entry.value,
      });
      range.addEventListener('input', () => {
        num.value = range.value;
        entry.value = range.value;
        onChange();
      });
      num.addEventListener('input', () => {
        range.value = num.value;
        entry.value = num.value;
        onChange();
      });
      wrap.appendChild(range);
      wrap.appendChild(num);
    } else if (entry.type === 'enum' && Array.isArray(entry.options) && entry.options.length > 0) {
      const sel = el('select', { class: 'ini-select' });
      let matched = false;
      const i18n = window.I18n;
      for (const o of entry.options) {
        const optLabel = i18n ? i18n.tEnum(o.label) : o.label;
        const opt = el('option', { value: o.value, text: optLabel });
        if (String(o.value) === String(entry.value)) { opt.selected = true; matched = true; }
        sel.appendChild(opt);
      }
      if (!matched) {
        const opt = el('option', { value: entry.value, text: entry.value + ' (actuel)' });
        opt.selected = true;
        sel.insertBefore(opt, sel.firstChild);
      }
      sel.addEventListener('change', () => {
        entry.value = sel.value;
        onChange();
      });
      wrap.appendChild(sel);
    } else {
      const inp = el('input', { type: 'text', class: 'ini-text', value: entry.value });
      inp.addEventListener('input', () => {
        entry.value = inp.value;
        onChange();
      });
      wrap.appendChild(inp);
    }

    return wrap;
  }

  async function saveModal() {
    if (!modalState || !modalState.sections) return;
    const statusEl = document.getElementById('csp-module-modal-status');
    if (statusEl) { statusEl.textContent = '⏳ Enregistrement…'; statusEl.style.color = 'var(--text-tertiary)'; }

    try {
      const newContent = rebuildContent(modalState.sections);
      const res = await window.api.writeCspModule(modalState.filename, newContent);
      if (res && res.success) {
        modalState.dirty = false;
        modalState.savedContent = newContent;
        if (statusEl) {
          statusEl.textContent = '✅ Enregistré à ' + new Date().toLocaleTimeString();
          statusEl.style.color = '#4caf50';
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        }
      } else {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        if (statusEl) { statusEl.textContent = '❌ Échec'; statusEl.style.color = '#ff6b6b'; }
      }
    } catch (e) {
      alert('Erreur : ' + e.message);
      if (statusEl) { statusEl.textContent = '❌ ' + e.message; statusEl.style.color = '#ff6b6b'; }
    }
  }
  // ---------------------------------------------------------------------------
  // Charge un module complet (user INI + template) et retourne les sections finales.
  // Utilisé par la recherche globale pour indexer sans ouvrir la modale.
  // ---------------------------------------------------------------------------
  async function loadModuleForSearch(filename) {
    const [userRes, tplRes] = await Promise.all([
      window.api.readCspModule(filename),
      window.api.readCspTemplate(filename).catch(() => ({ success: false }))
    ]);

    if (!userRes || !userRes.success) return null;

    // Map { SECTION: { KEY: value } }
    const userSectionsRaw = global.IniParser.parseIni(userRes.content);
    const userMap = {};
    for (const s of userSectionsRaw) {
      if (!s.name) continue;
      const obj = {};
      for (const e of s.entries) {
        if (e.kind === 'kv') obj[e.key] = e.value;
      }
      userMap[s.name] = obj;
    }

    let templateSections = null;
    if (tplRes && tplRes.success && global.CspTemplate) {
      try {
        templateSections = global.CspTemplate.parseTemplate(tplRes.content).sections;
      } catch (e) {}
    }

    let finalSections;
    if (templateSections && templateSections.length > 0) {
      finalSections = buildSectionsFromTemplate(templateSections, userMap);
    } else {
      finalSections = global.CspParser.parseCspContent(userRes.content, global.IniParser);
    }

    return {
      filename,
      sections: finalSections,
      savedContent: userRes.content,
    };
  }

  // ---------------------------------------------------------------------------
  // Sauvegarde un module CSP par son nom de fichier (utilisé par la recherche).
  // ---------------------------------------------------------------------------
  async function saveCspModuleByName(filename, sections) {
    const newContent = rebuildContent(sections);
    const res = await window.api.writeCspModule(filename, newContent);
    return !!(res && res.success);
  }


  function rebuildContent(sections) {
    const lines = [];
    for (const sec of sections) {
      lines.push('[' + sec.name + ']');
      for (const entry of sec.entries) {
        lines.push(entry.key + '=' + entry.value);
      }
      // ⚠️ On n'écrit PAS __HINT_BOTTOM : c'est une métadonnée du template,
      //    pas du user INI. Le hint est préservé uniquement pour l'affichage.
      lines.push('');
    }
    return lines.join('\n');
  }

  function closeModal() {
    const modal = document.getElementById('csp-module-modal');
    if (modal) modal.classList.remove('visible');
    modalState = null;
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    if (!initialized) {
      initialized = true;

      const refreshBtn = document.getElementById('csp-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', () => load());

      const closeBtn = document.getElementById('csp-module-modal-close');
      const resetBtn = document.getElementById('csp-module-modal-reset');
      const saveBtn  = document.getElementById('csp-module-modal-save');
      const modal    = document.getElementById('csp-module-modal');
      const searchIn = document.getElementById('csp-module-modal-search');

      // ⭐ Recherche live dans la modale CSP
      if (searchIn) {
        searchIn.addEventListener('input', () => {
          if (!modalState) return;
          modalState.searchQuery = searchIn.value || '';
          if (modalState.domRefs) applySearchFilter();
        });
      }

      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (resetBtn) resetBtn.addEventListener('click', loadModuleIntoModal);
      if (saveBtn)  saveBtn.addEventListener('click', saveModal);
      if (modal)    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('visible')) closeModal();
      });
    }

    load();

    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes('subtab-settings-csp')) load();
      });
    });
  }

  global.SettingsCsp = {
    init,
    load,
    // ⭐ Exposé pour la recherche globale
    loadModuleForSearch,
    saveCspModuleByName,
    createCspWidget,
  };
})(window);