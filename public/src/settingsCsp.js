// public/src/settingsCsp.js
// Orchestration de l'onglet CSP : affichage des modules par catégorie + cases ENABLED.

(function (global) {
  'use strict';

  let initialized = false;
  let modulesData = {};   // { grass_fx: { enabled: true, exists: true, empty: false } }

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
    const el = document.getElementById('csp-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color || 'var(--text-tertiary)';
    if (text && !color) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3000);
  }

  // ---------------------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------------------
  async function load() {
    const container = document.getElementById('csp-container');
    if (!container) return;

    container.innerHTML = '<div class="servers-loading">⏳ Chargement des modules…</div>';

    try {
      const listRes = await window.api.listCspModules();
      if (!listRes || !listRes.success) {
        container.innerHTML = '<div class="servers-empty">⚠️ ' + ((listRes && listRes.error) || 'Erreur') + '</div>';
        return;
      }

      // Charge le statut ENABLED de chaque module
      modulesData = {};
      const existing = new Set(listRes.modules.map(m => m.filename));
      const allModules = global.CspModules.getModules();

      const promises = allModules
        .filter(m => existing.has(m.id + '.ini'))
        .map(async (m) => {
          try {
            const r = await window.api.readCspModule(m.id + '.ini');
            modulesData[m.id] = {
              enabled: (r && r.success && r.enabled === '1'),
              exists: true,
              empty: false,
            };
          } catch (e) {
            modulesData[m.id] = { enabled: false, exists: true, empty: true };
          }
        });
      await Promise.all(promises);

      render();
    } catch (e) {
      container.innerHTML = '<div class="servers-empty">⚠️ ' + e.message + '</div>';
    }
  }

  // ---------------------------------------------------------------------------
  // Rendu
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
      const arrow = el('span', { class: 'csp-category-arrow', text: '▸' });
      header.appendChild(arrow);
      const label = el('span', { class: 'csp-category-label', text: cat.label });
      header.appendChild(label);
      catEl.appendChild(header);

      const content = el('div', { class: 'csp-category-content' });

      for (const m of modules) {
        const data = modulesData[m.id];
        const row = el('div', { class: 'csp-module-row' });

        const cb = el('input', { type: 'checkbox', class: 'csp-module-checkbox' });
        cb.checked = !!data.enabled;

        const labelWrap = el('label', { class: 'csp-module-label' });
        labelWrap.appendChild(cb);
        const labelText = el('span', { class: 'csp-module-name', text: m.label });
        labelWrap.appendChild(labelText);
        if (m.description) {
          const desc = el('span', { class: 'csp-module-desc', text: m.description });
          labelWrap.appendChild(desc);
        }

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

        row.appendChild(labelWrap);

        // Clic sur le nom → ouvre le fichier .ini dans l'éditeur Expert (à venir)
        const openBtn = el('button', {
          type: 'button',
          class: 'csp-module-open',
          title: 'Ouvrir les options avancées (à venir)',
          text: '⚙️',
        });
        openBtn.disabled = true;   // Session 2
        row.appendChild(openBtn);

        content.appendChild(row);
        totalShown++;
      }

      // Pliable
      const storageKey = 'cspCollapseCategory:' + cat.id;
      let collapsed = false;
      try {
        const saved = localStorage.getItem(storageKey);
        collapsed = (saved === '1');
      } catch (e) {}
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
  function init() {
    if (!initialized) {
      initialized = true;
      const refreshBtn = document.getElementById('csp-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', () => load());
    }
    load();

    // Lazy-load au clic sur le subtab
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes('subtab-settings-csp')) load();
      });
    });
  }

  global.SettingsCsp = { init, load };
})(window);