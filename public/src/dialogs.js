// public/src/dialogs.js
// Système de modales stylées pour remplacer alert() / confirm() / prompt()
// natifs qui ne sont pas stylables.

(function (global) {
  'use strict';

  let initialized = false;
  let overlayEl = null;
  let currentResolve = null;

  // ---------------------------------------------------------------------------
  // Initialisation : crée le conteneur des modales
  // ---------------------------------------------------------------------------
  function ensureInit() {
    if (initialized) return;
    initialized = true;

    overlayEl = document.createElement('div');
    overlayEl.className = 'qacrl-dialog-overlay';
    overlayEl.innerHTML = `
      <div class="qacrl-dialog" role="dialog" aria-modal="true">
        <div class="qacrl-dialog-header">
          <span class="qacrl-dialog-icon"></span>
          <span class="qacrl-dialog-title"></span>
        </div>
        <div class="qacrl-dialog-body"></div>
        <div class="qacrl-dialog-input" style="display:none;">
          <input type="text" class="qacrl-dialog-input-field">
        </div>
        <div class="qacrl-dialog-footer">
          <button class="filter-btn qacrl-dialog-btn-cancel" type="button" style="display:none;">Annuler</button>
          <button class="filter-btn qacrl-dialog-btn-ok" type="button">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    // Click sur l'overlay = annuler (si non-bloquant)
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) {
        close(null, false);
      }
    });

    // Échap = annuler
    document.addEventListener('keydown', (e) => {
      if (!overlayEl.classList.contains('visible')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close(null, false);
      } else if (e.key === 'Enter') {
        const inputField = overlayEl.querySelector('.qacrl-dialog-input-field');
        const isPrompt = overlayEl.querySelector('.qacrl-dialog-input').style.display !== 'none';
        if (isPrompt) {
          e.preventDefault();
          close(inputField.value, true);
        } else {
          e.preventDefault();
          close(true, true);
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Ferme la modale et résout la promesse
  // ---------------------------------------------------------------------------
  function close(value, isConfirm) {
    if (!overlayEl) return;
    overlayEl.classList.remove('visible');
    const resolve = currentResolve;
    currentResolve = null;
    if (resolve) resolve(value);
  }

  // ---------------------------------------------------------------------------
  // Ouvre une modale générique
  // opts = { type: 'alert'|'confirm'|'prompt', title, message, okLabel, cancelLabel, defaultValue, isHtml }
  // ---------------------------------------------------------------------------
  function open(opts) {
    ensureInit();
    return new Promise((resolve) => {
      currentResolve = resolve;

      const type = opts.type || 'alert';
      const isConfirm = (type === 'confirm' || type === 'prompt');

      // Icône
      const iconEl = overlayEl.querySelector('.qacrl-dialog-icon');
      const iconMap = {
        alert:   'ℹ️',
        info:    'ℹ️',
        success: '✅',
        warning: '⚠️',
        error:   '❌',
        confirm: '❓',
        prompt:  '✏️',
      };
      iconEl.textContent = opts.icon || iconMap[opts.variant] || iconMap[type] || 'ℹ️';

      // Titre
      const titleEl = overlayEl.querySelector('.qacrl-dialog-title');
      titleEl.textContent = opts.title || '';

      // Corps
      const bodyEl = overlayEl.querySelector('.qacrl-dialog-body');
      if (opts.isHtml) {
        bodyEl.innerHTML = opts.message || '';
      } else {
        bodyEl.textContent = opts.message || '';
      }
      // Remplace les \n par des <br> pour les messages multi-lignes
      if (!opts.isHtml && opts.message && opts.message.includes('\n')) {
        bodyEl.innerHTML = String(opts.message)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
      }

      // Input (prompt)
      const inputWrap = overlayEl.querySelector('.qacrl-dialog-input');
      const inputField = overlayEl.querySelector('.qacrl-dialog-input-field');
      if (type === 'prompt') {
        inputWrap.style.display = '';
        inputField.value = opts.defaultValue || '';
        setTimeout(() => { inputField.focus(); inputField.select(); }, 50);
      } else {
        inputWrap.style.display = 'none';
      }

      // Boutons
      const btnOk = overlayEl.querySelector('.qacrl-dialog-btn-ok');
      const btnCancel = overlayEl.querySelector('.qacrl-dialog-btn-cancel');
      const okLabel = opts.okLabel || 'OK';
      btnOk.textContent = okLabel;
      btnOk.onclick = () => {
        if (type === 'prompt') close(inputField.value, true);
        else close(true, true);
      };

      if (isConfirm) {
        btnCancel.style.display = '';
        btnCancel.textContent = opts.cancelLabel || 'Annuler';
        btnCancel.onclick = () => close(null, false);
      } else {
        btnCancel.style.display = 'none';
      }

      // Variant CSS
      const dialogEl = overlayEl.querySelector('.qacrl-dialog');
      dialogEl.className = 'qacrl-dialog';
      if (opts.variant) dialogEl.classList.add('qacrl-dialog-' + opts.variant);

      overlayEl.classList.add('visible');
      setTimeout(() => btnOk.focus(), 50);
    });
  }

  // ---------------------------------------------------------------------------
  // API publique
  // ---------------------------------------------------------------------------
  function alert(message, title, opts) {
    if (typeof title === 'object' && title !== null) {
      opts = title; title = undefined;
    }
    return open({
      type: 'alert',
      title: title || '',
      message: message,
      okLabel: (opts && opts.okLabel) || 'OK',
      variant: (opts && opts.variant) || null,
      ...(opts || {}),
    });
  }

  function confirm(message, title, opts) {
    if (typeof title === 'object' && title !== null) {
      opts = title; title = undefined;
    }
    return open({
      type: 'confirm',
      title: title || '',
      message: message,
      okLabel: (opts && opts.okLabel) || 'OK',
      cancelLabel: (opts && opts.cancelLabel) || 'Annuler',
      variant: (opts && opts.variant) || null,
      ...(opts || {}),
    }).then((v) => v === true);
  }

  function prompt(message, defaultValue, title, opts) {
    return open({
      type: 'prompt',
      title: title || '',
      message: message,
      defaultValue: defaultValue || '',
      okLabel: (opts && opts.okLabel) || 'OK',
      cancelLabel: (opts && opts.cancelLabel) || 'Annuler',
      ...(opts || {}),
    });
  }

  // ---------------------------------------------------------------------------
  // Override global : window.alert() devient notre modale stylée
  // ATTENTION : confirm() n'est PAS overridable automatiquement (retour synchrone)
  // ---------------------------------------------------------------------------
  function installGlobalOverrides() {
    ensureInit();

    const originalAlert = window.alert;
    window.alert = function (msg) {
      // On ne touche pas aux objets (rare, mais possible : alert(error) )
      try {
        alert(String(msg), '', null);
      } catch (e) {
        return originalAlert.call(window, msg);
      }
    };

    // Expose aussi pour usage explicite
    window.Dialogs = { alert, confirm, prompt };
  }

  const API = { alert, confirm, prompt, installGlobalOverrides };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.QacrlDialogs = API;
})(typeof window !== 'undefined' ? window : globalThis);