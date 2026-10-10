// public/src/weatherFx.js
// Sélecteur de style Weather FX (Default / Pure Gamma / Pure LCS)
// Lit/écrit weather_fx.ini dans Documents\Assetto Corsa\cfg\extension\

(function (global) {
  'use strict';

  const LABELS = {
    'default': 'Default (Kunos classique)',
    'gamma':   'Pure Gamma',
    'lcs':     'Pure LCS (linéaire)',
  };

  let initialized = false;

  async function load() {
    const selectEl = document.getElementById('weatherfx-style-select');
    const statusEl = document.getElementById('weatherfx-status');
    if (!selectEl) return;

    if (statusEl) {
      statusEl.textContent = '';
    }

    try {
      const r = await window.api.getWeatherFxStyle();
      if (!r.success) {
        selectEl.innerHTML = '<option value="">⚠️ ' + (r.error || 'Erreur') + '</option>';
        console.error('[weatherFx]', r.error);
        return;
      }

      // Peuple le select
      selectEl.innerHTML = '';
      for (const key of ['default', 'gamma', 'lcs']) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = LABELS[key];
        if (key === r.style) opt.selected = true;
        selectEl.appendChild(opt);
      }

      // Attache l'event listener (une seule fois)
      if (!initialized) {
        initialized = true;
        selectEl.addEventListener('change', onSelectChange);
      }
    } catch (e) {
      console.error('[weatherFx] load KO', e);
      selectEl.innerHTML = '<option value="">⚠️ Exception</option>';
    }
  }

    async function onSelectChange(e) {
    const selectEl = e.target;
    const statusEl = document.getElementById('weatherfx-status');
    const newStyle = selectEl.value;
    const previousStyle = selectEl.dataset.previous || null;

    selectEl.disabled = true;
    if (statusEl) {
      statusEl.textContent = '⏳ Application…';
      statusEl.style.color = 'var(--text-tertiary)';
    }

    try {
      const res = await window.api.setWeatherFxStyle(newStyle);
      if (res && res.success) {
        selectEl.dataset.previous = newStyle;
        if (statusEl) {
          statusEl.textContent = '✅ Appliqué à ' + new Date().toLocaleTimeString();
          statusEl.style.color = '#4caf50';
        }
      } else {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        if (previousStyle) selectEl.value = previousStyle;
        if (statusEl) {
          statusEl.textContent = '❌ Échec';
          statusEl.style.color = '#ff6b6b';
        }
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
      if (previousStyle) selectEl.value = previousStyle;
    } finally {
      selectEl.disabled = false;
    }
  }

  function init() {
    load();
    // Lazy-load quand on clique sur le subtab Vidéo
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes('subtab-settings-video')) load();
      });
    });
  }

  global.WeatherFx = { init, load };
})(window);