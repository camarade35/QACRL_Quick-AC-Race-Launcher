// public/src/freeCamera.js
// Gestion des options caméra libre (assetto_corsa.ini) + orbite F5 (camera_onboard_free.ini)

(function (global) {
  'use strict';

  let initialized = false;

  async function load() {
    const cbFree  = document.getElementById('free-camera-enabled');
    const cbOrbit = document.getElementById('orbit-mode-enabled');
    const statusEl = document.getElementById('free-camera-status');
    if (!cbFree || !cbOrbit) return;

    if (statusEl) statusEl.textContent = '';

    try {
      const res = await window.api.getFreeCameraOptions();
      if (!res || !res.success) {
        if (statusEl) {
          statusEl.textContent = '⚠️ ' + (res && res.error ? res.error : 'Erreur');
          statusEl.style.color = '#ff6b6b';
        }
        return;
      }
      cbFree.checked  = !!res.allowFreeCamera;
      cbOrbit.checked = !!res.orbitMode;

      if (!initialized) {
        initialized = true;
        cbFree.addEventListener('change', onChange);
        cbOrbit.addEventListener('change', onChange);
      }
    } catch (e) {
      console.error('[freeCamera] load KO', e);
      if (statusEl) {
        statusEl.textContent = '⚠️ ' + e.message;
        statusEl.style.color = '#ff6b6b';
      }
    }
  }

  async function onChange() {
    const cbFree  = document.getElementById('free-camera-enabled');
    const cbOrbit = document.getElementById('orbit-mode-enabled');
    const statusEl = document.getElementById('free-camera-status');

    if (cbFree)  cbFree.disabled  = true;
    if (cbOrbit) cbOrbit.disabled = true;
    if (statusEl) {
      statusEl.textContent = '⏳ Application…';
      statusEl.style.color = 'var(--text-tertiary)';
    }

    try {
      const res = await window.api.setFreeCameraOptions({
        allowFreeCamera: cbFree ? cbFree.checked : undefined,
        orbitMode:       cbOrbit ? cbOrbit.checked : undefined,
      });
      if (res && res.success) {
        if (statusEl) {
          statusEl.textContent = '✅ Appliqué à ' + new Date().toLocaleTimeString();
          statusEl.style.color = '#4caf50';
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        }
      } else {
        alert('Erreur : ' + ((res && res.error) || 'inconnue'));
        if (statusEl) {
          statusEl.textContent = '❌ Échec';
          statusEl.style.color = '#ff6b6b';
        }
      }
    } catch (e) {
      alert('Erreur : ' + e.message);
      if (statusEl) {
        statusEl.textContent = '❌ ' + e.message;
        statusEl.style.color = '#ff6b6b';
      }
    } finally {
      if (cbFree)  cbFree.disabled  = false;
      if (cbOrbit) cbOrbit.disabled = false;
    }
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

  global.FreeCamera = { init, load };
})(window);