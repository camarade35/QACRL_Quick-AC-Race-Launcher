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
    'sol':     'Sol 2.x',
  };

  // ⭐ Filtres PP natifs d'Assetto Corsa (base game)
  const KUNOS_PP_FILTERS = [
    'default',
    'natural',
    'CDimImaged',
  ];

  // Patterns typiques des filtres CSP / Pure / Sol
  const CSP_ONLY_PATTERNS = [
    /^pure/i,
    /^__sol/i,        // ⭐ filtre Sol officiel (__Sol.ini, __Sol_Extra.ini…)
    /^csp/i,
    /purecs/i,
    /pure_lcs/i,
    /_lcs$/i,
  ];

  function isKunosPpFilter(name) {
    if (!name) return false;
    if (KUNOS_PP_FILTERS.includes(name)) return true;
    for (const re of CSP_ONLY_PATTERNS) {
      if (re.test(name)) return false;
    }
    return true;
  }

  // ⭐ Un filtre Sol est-il présent dans la liste ?
  function isSolPpFilter(name) {
    return !!name && /^__sol/i.test(name);
  }

  let initialized = false;
  let _lastCaps = { hasCSP: false, hasPure: false, hasSol: false };

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

    // ⭐ Capacités (CSP / Pure / Sol)
    let caps = { hasCSP: false, hasPure: false, hasSol: false };
    try {
      caps = (await window.api.checkCspPure()) || caps;
    } catch (e) { /* ignore */ }
    _lastCaps = caps;

    const pureAvailable = !!(caps.hasCSP && caps.hasPure);
    const solAvailable  = !!(caps.hasCSP && caps.hasSol);
    const advancedAvailable = pureAvailable || solAvailable;

    // ⭐ 1) Récupère le Style actuel (AVANT de filtrer les PP)
    let currentStyle = 'default';
    let wfxEnabled = false;
    try {
      const [styleRes, enabledRes] = await Promise.all([
        window.api.getWeatherFxStyle().catch(() => ({ success: false })),
        window.api.getWeatherFxEnabled().catch(() => ({ success: false })),
      ]);
      if (styleRes.success && styleRes.style) currentStyle = styleRes.style;
      if (enabledRes.success) wfxEnabled = !!enabledRes.enabled;
    } catch (e) {
      console.error('[weatherFx] load style/enabled KO', e);
    }

    // ⭐ 2) Construit le select "Style Weather FX"
    if (selectStyle) {
      const availableStyles = ['default'];
      if (pureAvailable) availableStyles.push('gamma', 'lcs');
      if (solAvailable)  availableStyles.push('sol');

      selectStyle.innerHTML = '';
      for (const key of availableStyles) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = LABELS[key];
        selectStyle.appendChild(opt);
      }

      if (availableStyles.length === 1) {
        selectStyle.value = 'default';
        selectStyle.disabled = true;
        selectStyle.style.opacity = '0.5';
        selectStyle.style.cursor = 'not-allowed';
      } else {
        selectStyle.value = availableStyles.includes(currentStyle) ? currentStyle : 'default';
        selectStyle.disabled = false;
        selectStyle.style.opacity = '';
        selectStyle.style.cursor = '';
      }
    }

    // ⭐ 3) Toggle "Activer Weather FX"
    if (cbWeather) {
      if (!advancedAvailable) {
        cbWeather.checked = false;
        cbWeather.disabled = true;
        cbWeather.style.opacity = '0.5';
        cbWeather.style.cursor = 'not-allowed';
      } else {
        cbWeather.checked = wfxEnabled;
        cbWeather.disabled = false;
        cbWeather.style.opacity = '';
        cbWeather.style.cursor = '';
      }
    }

    // ⭐ 4) Construit le select "Filtre PP"
    //    - Style = Default → Kunos uniquement
    //    - Style = autre   → tout
    try {
      const [filtersRes, videoData] = await Promise.all([
        window.api.listPpfilters().catch(() => ({ success: false, filters: [] })),
        loadVideoIni(),
      ]);

      const currentFilter = getPostProcessValue(videoData.sections, 'FILTER');
      const currentEnabled = getPostProcessValue(videoData.sections, 'ENABLED');

      let filters = (filtersRes && filtersRes.success && filtersRes.filters) || [];

      // ⭐ Filtrage selon le STYLE
      const styleIsKunos = (currentStyle === 'default');
      if (styleIsKunos) {
        filters = filters.filter(isKunosPpFilter);
      }

      // ⭐ FALLBACK : si le dossier ppfilters est vide ou manquant,
      //    on garde au moins "default" pour éviter un select vide
      if (filters.length === 0) {
        filters = ['default'];
        console.warn('[weatherFx] Aucun filtre PP trouvé → fallback sur "default"');
      }

      // ⭐ Si le filtre actuel n'est pas dans la liste
      let filterToSelect = currentFilter;
      if (currentFilter && !filters.includes(currentFilter)) {
        if (styleIsKunos) {
          // Style Default → on force Kunos
          filterToSelect = filters.includes('default') ? 'default' : (filters[0] || 'default');
          try {
            setPostProcessValue(videoData.sections, 'FILTER', filterToSelect);
            await writeVideoIni(videoData.sections);
            console.log('[weatherFx] Filtre forcé à "' + filterToSelect + '" (style Default)');
          } catch (err) {
            console.warn('[weatherFx] écriture filtre forcé KO', err);
          }
        } else {
          // Style non-Kunos → on ajoute à la liste
          filters.unshift(currentFilter);
          filterToSelect = currentFilter;
        }
      }

      if (selectPp) {
        selectPp.innerHTML = '';

        // ⭐ Dernier garde-fou : jamais de select vide
        if (filters.length === 0) filters = ['default'];

        for (const f of filters) {
          const opt = document.createElement('option');
          opt.value = f;                                          // ⭐ valeur technique
          opt.textContent = formatPpFilterName(f);                // ⭐ nom lisible
          if (f === filterToSelect) opt.selected = true;
          selectPp.appendChild(opt);
        }
      }

      if (cbPp) {
        cbPp.checked = (currentEnabled === '1');
      }

      // ⭐ Affiche / masque le warning CSP
      const warn = document.getElementById('weatherfx-csp-warning');
      if (warn) {
        warn.style.display = advancedAvailable ? 'none' : 'flex';
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
        // ⭐ Recharge la liste PP selon le nouveau style
        await load();
      } else {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        setStatus(statusEl, '❌ Échec', '#ff6b6b');
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
      setStatus(statusEl, '❌ Échec', '#ff6b6b');
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

    // ⭐ Bouton "Voir l'onglet CSP"
    const goCspBtn = document.getElementById('weatherfx-go-csp');
    if (goCspBtn) {
      goCspBtn.addEventListener('click', () => {
        const cspBtn = document.querySelector('.subtab-btn[onclick*="subtab-settings-csp"]');
        if (cspBtn) cspBtn.click();
      });
    }

    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes('subtab-settings-video')) load();
      });
    });
  }

  global.WeatherFx = { init, load };
})(window);