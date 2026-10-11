// public/src/weatherFx.js
// Gestion du bloc "Rendu" dans Paramètres > Vidéo :
//   - Style Weather FX (weather_fx.ini)
//   - Filtre PP + ENABLED (video.ini / [POST_PROCESS])

(function (global) {
  'use strict';

  const LABELS = {
    'default': 'Default (Kunos classique)',
    'gamma':   'Pure Gamma',
    'lcs':     'Pure LCS (linéaire)',
  };

  let initialized = false;

  // ---------------------------------------------------------------------------
  // Helpers video.ini
  // ---------------------------------------------------------------------------
  async function loadVideoIni() {
    const res = await window.api.readIniFile('video.ini');
    if (!res || !res.success) throw new Error((res && res.error) || 'video.ini introuvable');
    return { raw: res.content, sections: global.IniParser.parseIni(res.content) };
  }

  function getPostProcessValue(sections, key) {
    const sec = sections.find(s => s.name === 'POST_PROCESS');
    if (!sec) return null;
    const entry = sec.entries.find(e => e.kind === 'kv' && e.key === key);
    return entry ? entry.value : null;
  }

  function setPostProcessValue(sections, key, value) {
    const sec = sections.find(s => s.name === 'POST_PROCESS');
    if (!sec) return false;
    const entry = sec.entries.find(e => e.kind === 'kv' && e.key === key);
    if (!entry) return false;
    entry.value = value;
    return true;
  }

  async function writeVideoIni(sections) {
    const content = global.IniParser.serializeIni(sections);
    const res = await window.api.writeIniFile('video.ini', content);
    if (!res || !res.success) throw new Error((res && res.error) || 'Écriture KO');
    return true;
  }

  // ---------------------------------------------------------------------------
  // Chargement initial
  // ---------------------------------------------------------------------------
  async function load() {
    const selectStyle = document.getElementById('weatherfx-style-select');
    const selectPp    = document.getElementById('render-ppfilter-select');
    const cbEnabled   = document.getElementById('render-pp-enabled');
    const statusEl    = document.getElementById('weatherfx-status');

    if (statusEl) statusEl.textContent = '';

    // 1) Style Weather FX
    try {
      const r = await window.api.getWeatherFxStyle();
      if (!r.success) {
        if (selectStyle) selectStyle.innerHTML = '<option value="">⚠️ ' + (r.error || 'Erreur') + '</option>';
      } else if (selectStyle) {
        selectStyle.innerHTML = '';
        for (const key of ['default', 'gamma', 'lcs']) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = LABELS[key];
          if (key === r.style) opt.selected = true;
          selectStyle.appendChild(opt);
        }
      }
    } catch (e) {
      console.error('[weatherFx] load style KO', e);
    }

    // 2) Filtre PP + ENABLED (video.ini)
    try {
      const [filtersRes, videoData] = await Promise.all([
        window.api.listPpfilters().catch(() => ({ success: false, filters: [] })),
        loadVideoIni(),
      ]);

      const currentFilter = getPostProcessValue(videoData.sections, 'FILTER');
      const currentEnabled = getPostProcessValue(videoData.sections, 'ENABLED');

      if (selectPp) {
        selectPp.innerHTML = '';
        const filters = (filtersRes && filtersRes.success && filtersRes.filters) || [];

        // Si le filtre actuel n'est pas dans la liste, on l'ajoute
        if (currentFilter && !filters.includes(currentFilter)) {
          filters.push(currentFilter);
        }
        for (const f of filters) {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f;
          if (f === currentFilter) opt.selected = true;
          selectPp.appendChild(opt);
        }
      }

      if (cbEnabled) {
        cbEnabled.checked = (currentEnabled === '1');
      }
    } catch (e) {
      console.error('[weatherFx] load PP KO', e);
    }

    // Attache les listeners (une seule fois)
    if (!initialized) {
      initialized = true;

      const selectStyle = document.getElementById('weatherfx-style-select');
      const selectPp    = document.getElementById('render-ppfilter-select');
      const cbEnabled   = document.getElementById('render-pp-enabled');

      if (selectStyle) selectStyle.addEventListener('change', onStyleChange);
      if (selectPp)    selectPp.addEventListener('change', onPpFilterChange);
      if (cbEnabled)   cbEnabled.addEventListener('change', onPpEnabledChange);
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  async function onStyleChange(e) {
    const selectEl = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    const newStyle = selectEl.value;
    selectEl.disabled = true;
    setStatus(statusEl, '⏳ Application…');
    try {
      const res = await window.api.setWeatherFxStyle(newStyle);
      if (res && res.success) {
        setStatus(statusEl, '✅ Appliqué à ' + new Date().toLocaleTimeString(), '#4caf50');
        setTimeout(() => setStatus(statusEl, ''), 3000);
      } else {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        setStatus(statusEl, '❌ Échec', '#ff6b6b');
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
      setStatus(statusEl, '❌ Échec', '#ff6b6b');
    } finally {
      selectEl.disabled = false;
    }
  }

  async function onPpFilterChange(e) {
    const selectEl = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    const newFilter = selectEl.value;
    selectEl.disabled = true;
    setStatus(statusEl, '⏳ Application…');
    try {
      const videoData = await loadVideoIni();
      setPostProcessValue(videoData.sections, 'FILTER', newFilter);
      await writeVideoIni(videoData.sections);
      setStatus(statusEl, '✅ Filtre appliqué à ' + new Date().toLocaleTimeString(), '#4caf50');
      setTimeout(() => setStatus(statusEl, ''), 3000);
    } catch (err) {
      alert('Erreur : ' + err.message);
      setStatus(statusEl, '❌ Échec', '#ff6b6b');
    } finally {
      selectEl.disabled = false;
    }
  }

  async function onPpEnabledChange(e) {
    const cb = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    const newVal = cb.checked ? '1' : '0';
    cb.disabled = true;
    setStatus(statusEl, '⏳ Application…');
    try {
      const videoData = await loadVideoIni();
      setPostProcessValue(videoData.sections, 'ENABLED', newVal);
      await writeVideoIni(videoData.sections);
      setStatus(statusEl, '✅ ' + (cb.checked ? 'Post-process activé' : 'Post-process désactivé'), '#4caf50');
      setTimeout(() => setStatus(statusEl, ''), 3000);
    } catch (err) {
      alert('Erreur : ' + err.message);
      setStatus(statusEl, '❌ Échec', '#ff6b6b');
    } finally {
      cb.disabled = false;
    }
  }

  function setStatus(el, text, color) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color || 'var(--text-tertiary)';
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    load();
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes('subtab-settings-video')) load();
      });
    });
  }

  global.WeatherFx = { init, load };
})(window);