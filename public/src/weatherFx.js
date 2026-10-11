// public/src/weatherFx.js
// Gestion du bloc "Rendu" dans Paramètres > Vidéo :
//   - Style Weather FX + Activé (weather_fx.ini)
//   - Filtre PP + Activé (video.ini / [POST_PROCESS])

(function (global) {
  'use strict';

  const LABELS = {
    'default': 'Default (Kunos classique)',
    'gamma':   'Pure Gamma',
    'lcs':     'Pure LCS (linéaire)',
  };

  let initialized = false;

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
  async function load() {
    const selectStyle = document.getElementById('weatherfx-style-select');
    const selectPp    = document.getElementById('render-ppfilter-select');
    const cbWeather   = document.getElementById('weatherfx-enabled');
    const cbPp        = document.getElementById('render-pp-enabled');
    const statusEl    = document.getElementById('weatherfx-status');

    if (statusEl) statusEl.textContent = '';

    // 1) Style + Activé Weather FX
    try {
      const [styleRes, enabledRes] = await Promise.all([
        window.api.getWeatherFxStyle().catch(() => ({ success: false })),
        window.api.getWeatherFxEnabled().catch(() => ({ success: false })),
      ]);

      if (selectStyle) {
        if (!styleRes.success) {
          selectStyle.innerHTML = '<option value="">⚠️ ' + (styleRes.error || 'Erreur') + '</option>';
        } else {
          selectStyle.innerHTML = '';
          for (const key of ['default', 'gamma', 'lcs']) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = LABELS[key];
            if (key === styleRes.style) opt.selected = true;
            selectStyle.appendChild(opt);
          }
        }
      }
      if (cbWeather && enabledRes.success) {
        cbWeather.checked = !!enabledRes.enabled;
      }
    } catch (e) {
      console.error('[weatherFx] load style/enabled KO', e);
    }

    // 2) Filtre PP + Activé (video.ini)
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
        if (currentFilter && !filters.includes(currentFilter)) filters.push(currentFilter);
        for (const f of filters) {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f;
          if (f === currentFilter) opt.selected = true;
          selectPp.appendChild(opt);
        }
      }

      if (cbPp) {
        cbPp.checked = (currentEnabled === '1');
      }
    } catch (e) {
      console.error('[weatherFx] load PP KO', e);
    }

    // Attache les listeners (une seule fois)
    if (!initialized) {
      initialized = true;

      const ss = document.getElementById('weatherfx-style-select');
      const sp = document.getElementById('render-ppfilter-select');
      const cw = document.getElementById('weatherfx-enabled');
      const cp = document.getElementById('render-pp-enabled');

      if (ss) ss.addEventListener('change', onStyleChange);
      if (sp) sp.addEventListener('change', onPpFilterChange);
      if (cw) cw.addEventListener('change', onWeatherEnabledChange);
      if (cp) cp.addEventListener('change', onPpEnabledChange);
    }
  }

  // ---------------------------------------------------------------------------
  async function onStyleChange(e) {
    const el = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    el.disabled = true;
    setStatus(statusEl, '⏳ Application…');
    try {
      const res = await window.api.setWeatherFxStyle(el.value);
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
      el.disabled = false;
    }
  }

  async function onWeatherEnabledChange(e) {
    const cb = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    cb.disabled = true;
    setStatus(statusEl, '⏳ Application…');
    try {
      const res = await window.api.setWeatherFxEnabled(cb.checked);
      if (res && res.success) {
        setStatus(statusEl, '✅ Weather FX ' + (cb.checked ? 'activé' : 'désactivé'), '#4caf50');
        setTimeout(() => setStatus(statusEl, ''), 3000);
      } else {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        cb.checked = !cb.checked;  // revert
        setStatus(statusEl, '❌ Échec', '#ff6b6b');
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
      cb.checked = !cb.checked;
      setStatus(statusEl, '❌ Échec', '#ff6b6b');
    } finally {
      cb.disabled = false;
    }
  }

  async function onPpFilterChange(e) {
    const el = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    el.disabled = true;
    setStatus(statusEl, '⏳ Application…');
    try {
      const videoData = await loadVideoIni();
      setPostProcessValue(videoData.sections, 'FILTER', el.value);
      await writeVideoIni(videoData.sections);
      setStatus(statusEl, '✅ Filtre appliqué à ' + new Date().toLocaleTimeString(), '#4caf50');
      setTimeout(() => setStatus(statusEl, ''), 3000);
    } catch (err) {
      alert('Erreur : ' + err.message);
      setStatus(statusEl, '❌ Échec', '#ff6b6b');
    } finally {
      el.disabled = false;
    }
  }

  async function onPpEnabledChange(e) {
    const cb = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    cb.disabled = true;
    setStatus(statusEl, '⏳ Application…');
    try {
      const videoData = await loadVideoIni();
      setPostProcessValue(videoData.sections, 'ENABLED', cb.checked ? '1' : '0');
      await writeVideoIni(videoData.sections);
      setStatus(statusEl, '✅ Post-process ' + (cb.checked ? 'activé' : 'désactivé'), '#4caf50');
      setTimeout(() => setStatus(statusEl, ''), 3000);
    } catch (err) {
      alert('Erreur : ' + err.message);
      cb.checked = !cb.checked;
      setStatus(statusEl, '❌ Échec', '#ff6b6b');
    } finally {
      cb.disabled = false;
    }
  }

  function setStatus(el, text, color) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color || 'var(--text-tertiary)';
    el.style.fontSize = '0.72rem';
  }

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