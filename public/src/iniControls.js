// public/src/iniControls.js
// Générateur de widgets HTML pour éditer une clé INI selon son type.
//
// Usage :
//   const ctrl = createIniControl({
//     filename: 'audio.ini', section: 'LEVELS', key: 'MASTER',
//     value: '0.64', schema: { label: 'Volume général', type: 'float', min: 0, max: 1, step: 0.01 },
//     ppfilters: ['pure', 'default'],   // optionnel, pour type 'ppfilter'
//     onChange: (newValue) => { ... }
//   });
//   container.appendChild(ctrl.element);
//   ctrl.getValue();   // -> "0.64"

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (attrs[k] !== null && attrs[k] !== undefined) {
        node.setAttribute(k, attrs[k]);
      }
    }
    if (children) for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function parseBool(v) {
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    return s === '1' || s === 'true';
  }

  function resolveType(schema, rawValue) {
    if (!schema) return 'auto';
    if (schema.type && schema.type !== 'auto') {
      // 'button' / 'axis' / 'key' → ce sont tous des bindings interactifs
      if (schema.type === 'button' || schema.type === 'axis' || schema.type === 'key') {
        return 'binding';
      }
      return schema.type;
    }
    const P = global.IniParser;
    if (!P) return 'string';
    return P.detectValueType(rawValue);
  }

  // ---------------------------------------------------------------------------
  // Peuple un <select> avec les périphériques audio de sortie détectés.
  // Utilise navigator.mediaDevices (Electron/Chromium).
  // ---------------------------------------------------------------------------
  async function populateAudioSinks(select, currentValue) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      // Demande la permission audio (nécessaire pour avoir les noms)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (e) { /* permission refusée — on continue quand même */ }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');

      const seen = new Set();
      if (currentValue) seen.add(currentValue);

      for (const d of outputs) {
        const label = (d.label || '').trim() || ('Sortie ' + d.deviceId.slice(0, 8));
        if (seen.has(label)) continue;
        seen.add(label);
        const opt = document.createElement('option');
        opt.value = label;
        opt.textContent = label;
        select.appendChild(opt);
      }
    } catch (e) {
      console.warn('[iniControls] enumerateDevices KO :', e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Fabrique principale
  // ---------------------------------------------------------------------------
  function createIniControl(opts) {
    opts = opts || {};
    const schema = opts.schema || {};
    const rawValue = opts.value != null ? String(opts.value) : '';
    const type = resolveType(schema, rawValue);
    const label = schema.label || opts.key || '';

    let controlEl;
    let getValue;

    switch (type) {

      // ---------------------------------------------------------------------
      // BOOL : case à cocher
      // ---------------------------------------------------------------------
      case 'bool': {
        const cb = el('input', { type: 'checkbox', class: 'ini-checkbox' });
        cb.checked = parseBool(rawValue);
        controlEl = cb;
        getValue = () => (cb.checked ? '1' : '0');
        cb.addEventListener('change', () => {
          if (opts.onChange) opts.onChange(getValue());
        });
        break;
      }

      // ---------------------------------------------------------------------
      // INT / FLOAT : slider + champ numérique si min+max, sinon champ seul
      // ---------------------------------------------------------------------
      case 'int':
      case 'float': {
        const step = schema.step != null ? schema.step : (type === 'int' ? 1 : 0.01);
        const hasRange = schema.min != null && schema.max != null;

        if (hasRange) {
          const range = el('input', {
            type: 'range', class: 'ini-range',
            min: schema.min, max: schema.max, step: step,
            value: rawValue
          });
          const num = el('input', {
            type: 'number', class: 'ini-number',
            min: schema.min, max: schema.max, step: step,
            value: rawValue
          });
          // Sync bidirectionnelle
          range.addEventListener('input', () => {
            num.value = range.value;
            if (opts.onChange) opts.onChange(range.value);
          });
          num.addEventListener('input', () => {
            range.value = num.value;
            if (opts.onChange) opts.onChange(num.value);
          });
          controlEl = el('div', { class: 'ini-slider-wrap' }, [range, num]);
          getValue = () => num.value;
        } else {
          const num = el('input', {
            type: 'number', class: 'ini-number',
            step: step, value: rawValue
          });
          num.addEventListener('input', () => {
            if (opts.onChange) opts.onChange(num.value);
          });
          controlEl = num;
          getValue = () => num.value;
        }
        break;
      }

      // ---------------------------------------------------------------------
      // ENUM : menu déroulant
      // ---------------------------------------------------------------------
      case 'enum': {
        const sel = el('select', { class: 'ini-select' });
        const options = schema.options || [];
        let matched = false;
        for (const o of options) {
          const opt = el('option', { value: o.value, text: o.label });
          if (String(o.value) === rawValue) { opt.selected = true; matched = true; }
          sel.appendChild(opt);
        }
        // Si la valeur n'est pas dans la liste, on l'ajoute pour ne rien perdre
        if (!matched && rawValue) {
          const opt = el('option', { value: rawValue, text: rawValue });
          opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          if (opts.onChange) opts.onChange(sel.value);
        });
        controlEl = sel;
        getValue = () => sel.value;
        break;
      }

      // ---------------------------------------------------------------------
      // PPFILTER : menu déroulant peuplé depuis les filtres PP détectés
      // ---------------------------------------------------------------------
      case 'ppfilter': {
        const sel = el('select', { class: 'ini-select' });
        const filters = Array.isArray(opts.ppfilters) ? opts.ppfilters : [];
        let matched = false;
        for (const f of filters) {
          const opt = el('option', { value: f, text: f });
          if (f === rawValue) { opt.selected = true; matched = true; }
          sel.appendChild(opt);
        }
        if (!matched && rawValue) {
          const opt = el('option', { value: rawValue, text: rawValue });
          opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          if (opts.onChange) opts.onChange(sel.value);
        });
        controlEl = sel;
        getValue = () => sel.value;
        break;
      }

      // ---------------------------------------------------------------------
      // BINDING : widget interactif de capture
      //
      // Selon le nom de la clé :
      //   - KEY / KEY_MODIFICATOR  → capture clavier (touche)
      //   - BUTTON / XBOXBUTTON    → capture manette (étape 4 à venir)
      //   - JOY                    → juste un champ numérique (index du device)
      // ---------------------------------------------------------------------
            case 'binding': {
        // -------------------------------------------------------------------
        // JOY / JOY_MODIFICATOR : menu déroulant peuplé par [CONTROLLERS]
        // -------------------------------------------------------------------
        if ((opts.key === 'JOY' || opts.key === 'JOY_MODIFICATOR') && opts.sectionContext) {
          const controllers = opts.sectionContext.controllers || [];
          const sel = el('select', { class: 'ini-select' });

          // Option "aucun"
          const none = el('option', { value: '-1', text: '— Aucun —' });
          if (rawValue === '-1') none.selected = true;
          sel.appendChild(none);

          // Une option par CONx
          let matched = false;
          for (const c of controllers) {
            const label = 'JOY=' + c.index + ' — ' + c.name;
            const opt = el('option', { value: String(c.index), text: label });
            if (String(c.index) === String(rawValue)) { opt.selected = true; matched = true; }
            sel.appendChild(opt);
          }
          if (!matched && rawValue && rawValue !== '-1') {
            const opt = el('option', { value: rawValue, text: 'JOY=' + rawValue + ' (inconnu)' });
            opt.selected = true;
            sel.appendChild(opt);
          }

          sel.addEventListener('change', () => {
            if (opts.onChange) opts.onChange(sel.value);
          });
          controlEl = sel;
          getValue = () => sel.value;
          break;
        }

        const schemaType = (schema && schema.type) || '';
        const isKeyboard = (
          schemaType === 'key' ||
          opts.key === 'KEY' || opts.key === 'KEY_MODIFICATOR'
        );
        const isAxis = (
          schemaType === 'axis' ||
          opts.key === 'AXLE'
        );
        const isButton = (
          schemaType === 'button' ||
          opts.key === 'BUTTON' || opts.key === 'BUTTON_MODIFICATOR'
        );
        const isJoy = (opts.key === 'JOY' || opts.key === 'JOY_MODIFICATOR');

        // -------------------------------------------------------------------
        // Capture CLAVIER
        // -------------------------------------------------------------------
        if (isKeyboard && global.KeyboardMapper) {
          let currentValue = rawValue;
          const btn = el('button', { type: 'button', class: 'ini-binding-btn' });
          let capturing = false;

          const labelFor = (v) => {
            const pretty = global.KeyboardMapper.formatKey(v);
            return '⌨ ' + (pretty || '(aucune)');
          };
          const updateLabel = () => { btn.textContent = labelFor(currentValue); };
          updateLabel();

          const onKeyDown = (e) => {
            if (!capturing) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') { stopCapture(); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
              currentValue = '-1';
              updateLabel();
              if (opts.onChange) opts.onChange('-1');
              stopCapture();
              return;
            }
            const code = global.KeyboardMapper.captureFromEvent(e);
            if (code == null) return;
            currentValue = global.KeyboardMapper.toAcFormat(code);
            updateLabel();
            if (opts.onChange) opts.onChange(currentValue);
            stopCapture();
          };
          const startCapture = () => {
            capturing = true;
            btn.classList.add('capturing');
            btn.textContent = '⌨ Appuyez sur une touche… (Échap = annule, Suppr = efface)';
            document.addEventListener('keydown', onKeyDown, true);
          };
          const stopCapture = () => {
            capturing = false;
            btn.classList.remove('capturing');
            document.removeEventListener('keydown', onKeyDown, true);
            updateLabel();
          };
          btn.addEventListener('click', () => { capturing ? stopCapture() : startCapture(); });

          controlEl = btn;
          getValue = () => currentValue;
          break;
        }

        // -------------------------------------------------------------------
        // Capture BOUTON manette (BUTTON, GEAR_N de [SHIFTER], …)
        // -------------------------------------------------------------------
        if (isButton && global.GamepadCapture && opts.gamepadMapper && opts.sectionHelpers) {
          let currentValue = rawValue;
          const btn = el('button', { type: 'button', class: 'ini-binding-btn ini-binding-pad' });
          let capturing = false;

          const updateLabel = () => {
            const n = parseInt(currentValue, 10);
            btn.textContent = (!isNaN(n) && n >= 0) ? '🎮 Bouton ' + n : '🎮 (aucun)';
          };
          updateLabel();

          const stopCapture = () => {
            capturing = false;
            btn.classList.remove('capturing');
            if (global.GamepadCapture.isCapturing()) global.GamepadCapture.stop();
            updateLabel();
          };

          const startCapture = () => {
            capturing = true;
            btn.classList.add('capturing');
            btn.textContent = '🎮 Appuyez sur un bouton du pad… (Échap annule, Suppr efface)';

            global.GamepadCapture.start({
              axesThreshold: 0,
              timeoutMs: 10000,
              resolveAcIndex: (chromiumIndex) => {
                const t = opts.gamepadMapper.match();
                const m = t.find(x => x.chromiumIndex === chromiumIndex && x.matched);
                return m ? m.acIndex : null;
              },
              onCapture: (r) => {
                if (r.kind !== 'button') return;
                currentValue = String(r.buttonIndex);
                updateLabel();
                if (opts.onChange) opts.onChange(currentValue);
                // Écrit le JOY correspondant
                // ⚠️ On ne met PLUS à jour JOY automatiquement : les 2 Fanatec
                // ont le même Vendor:Product, l'utilisateur choisit via le menu.
              },
              onCancel: () => stopCapture()
            });

            const escHandler = (e) => {
              if (e.key === 'Escape' && capturing) {
                e.preventDefault(); e.stopPropagation();
                document.removeEventListener('keydown', escHandler, true);
                stopCapture();
              }
            };
            document.addEventListener('keydown', escHandler, true);
          };

          btn.addEventListener('click', () => { capturing ? stopCapture() : startCapture(); });

          controlEl = btn;
          getValue = () => currentValue;
          break;
        }

        // -------------------------------------------------------------------
        // Capture AXE analogique (AXLE)
        // -------------------------------------------------------------------
        if (isAxis && global.GamepadCapture && opts.gamepadMapper && opts.sectionHelpers) {
          let currentValue = rawValue;
          const btn = el('button', { type: 'button', class: 'ini-binding-btn ini-binding-axis' });
          let capturing = false;

          let updateLabel = () => {
            const n = parseInt(currentValue, 10);
            btn.textContent = (!isNaN(n) && n >= 0) ? '↔ Axe ' + n : '↔ (aucun)';
          };
          updateLabel();

          const stopCapture = () => {
            capturing = false;
            btn.classList.remove('capturing');
            if (global.GamepadCapture.isCapturing()) global.GamepadCapture.stop();
            updateLabel();
          };

          const startCapture = () => {
            capturing = true;
            btn.classList.add('capturing');
            btn.textContent = '↔ Bougez l\'axe (volant / pédale)… (Échap annule)';

            global.GamepadCapture.start({
              axesThreshold: 0.5,
              timeoutMs: 10000,
              resolveAcIndex: (chromiumIndex) => {
                const t = opts.gamepadMapper.match();
                const m = t.find(x => x.chromiumIndex === chromiumIndex && x.matched);
                return m ? m.acIndex : null;
              },
              onCapture: (r) => {
                if (r.kind !== 'axis') return;

                // ⭐ Convertit l'index Chromium → index AC selon le périphérique
                let acAxis = r.axisIndex;
                if (global.GamepadMapper && global.GamepadMapper.chromiumAxisToAcAxis) {
                  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                  const pad = pads[r.chromiumIndex];
                  const vp = pad ? global.GamepadMapper.parseChromiumGamepadId(pad.id) : null;
                  if (vp) {
                    acAxis = global.GamepadMapper.chromiumAxisToAcAxis(vp.vendor, vp.product, r.axisIndex);
                    console.log('[iniControls] axe Chromium', r.axisIndex, '→ axe AC', acAxis, '(pad', vp.vendor + ':' + vp.product + ')');
                  }
                }

                currentValue = String(acAxis);
                updateLabel();
                if (opts.onChange) opts.onChange(currentValue);
                // ⚠️ On ne met PLUS à jour JOY automatiquement : les 2 Fanatec
                // ont le même Vendor:Product, l'utilisateur choisit via le menu.
              },
              onCancel: () => stopCapture()
            });

            const escHandler = (e) => {
              if (e.key === 'Escape' && capturing) {
                e.preventDefault(); e.stopPropagation();
                document.removeEventListener('keydown', escHandler, true);
                stopCapture();
              }
            };
            document.addEventListener('keydown', escHandler, true);
          };

          btn.addEventListener('click', () => { capturing ? stopCapture() : startCapture(); });

          // ⭐ Champ numérique éditable (ajustement manuel)
          const numInp = el('input', {
            type: 'number', class: 'ini-number', min: -1, max: 31,
            value: currentValue
          });
          numInp.addEventListener('input', () => {
            currentValue = numInp.value;
            updateLabel();
            if (opts.onChange) opts.onChange(currentValue);
          });

          // ⭐ Réassigne updateLabel pour synchroniser bouton + champ numérique
          const _baseUpdateLabel = updateLabel;
          updateLabel = () => {
            _baseUpdateLabel();
            numInp.value = currentValue;
          };
          updateLabel();

          const wrap = el('div', { class: 'ini-binding-wrap' }, [btn, numInp]);

          controlEl = wrap;
          getValue = () => currentValue;
          break;
        }

        // -------------------------------------------------------------------
        // XBOXBUTTON : menu déroulant
        // -------------------------------------------------------------------
        if (opts.key === 'XBOXBUTTON') {
          const values = ['-1', 'A', 'B', 'X', 'Y', 'LSHOULDER', 'RSHOULDER',
                          'BACK', 'START', 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT',
                          'LTHUMB', 'RTHUMB'];
          const sel = el('select', { class: 'ini-select' });
          let matched = false;
          for (const v of values) {
            const opt = el('option', { value: v, text: v === '-1' ? '(aucun)' : v });
            if (v === rawValue) { opt.selected = true; matched = true; }
            sel.appendChild(opt);
          }
          if (!matched && rawValue) {
            const opt = el('option', { value: rawValue, text: rawValue });
            opt.selected = true;
            sel.appendChild(opt);
          }
          sel.addEventListener('change', () => { if (opts.onChange) opts.onChange(sel.value); });
          controlEl = sel;
          getValue = () => sel.value;
          break;
        }

        // -------------------------------------------------------------------
        // Fallback : champ texte (JOY, JOY_MODIFICATOR…)
        // -------------------------------------------------------------------
        const inp = el('input', {
          type: 'text', class: 'ini-text ini-binding',
          value: rawValue,
          placeholder: isJoy ? 'index du périphérique AC' : 'valeur brute'
        });
        inp.addEventListener('input', () => { if (opts.onChange) opts.onChange(inp.value); });
        controlEl = inp;
        getValue = () => inp.value;
        break;
      }

      // ---------------------------------------------------------------------
      // AUDIOSINK : menu déroulant peuplé par les périphériques audio détectés
      // ---------------------------------------------------------------------
      case 'audiosink': {
        const sel = el('select', { class: 'ini-select' });

        if (rawValue) {
          const opt0 = el('option', { value: rawValue, text: rawValue });
          opt0.selected = true;
          sel.appendChild(opt0);
        } else {
          const opt0 = el('option', { value: '', text: '— Aucun —' });
          sel.appendChild(opt0);
        }

        populateAudioSinks(sel, rawValue);

        sel.addEventListener('change', () => {
          if (opts.onChange) opts.onChange(sel.value);
        });
        controlEl = sel;
        getValue = () => sel.value;
        break;
      }

      // ---------------------------------------------------------------------
      // STRING (et 'auto' par défaut) : champ texte
      // ---------------------------------------------------------------------
      case 'string':
      default: {
        const inp = el('input', {
          type: 'text', class: 'ini-text',
          value: rawValue
        });
        inp.addEventListener('input', () => {
          if (opts.onChange) opts.onChange(inp.value);
        });
        controlEl = inp;
        getValue = () => inp.value;
        break;
      }
    }

    // ---------------------------------------------------------------------
    // Enveloppe : libellé + contrôle + affichage type
    // ---------------------------------------------------------------------
    const labelEl = el('label', {
      class: 'ini-label',
      title: opts.key || '',
      text: label
    });
    if (schema.unit) {
      labelEl.appendChild(el('span', { class: 'ini-unit', text: ' (' + schema.unit + ')' }));
    }

    const wrapper = el('div', { class: 'ini-row' }, [labelEl, controlEl]);

    return {
      element: wrapper,
      getValue: getValue,
      setValue: (v) => {
        v = v != null ? String(v) : '';
        switch (type) {
          case 'bool':
            controlEl.checked = parseBool(v);
            break;
          case 'int':
          case 'float':
            if (controlEl.classList.contains('ini-slider-wrap')) {
              controlEl.querySelector('.ini-range').value = v;
              controlEl.querySelector('.ini-number').value = v;
            } else {
              controlEl.value = v;
            }
            break;
          default:
            controlEl.value = v;
        }
      },
      type: type,
    };
  }

  const API = { createIniControl };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.IniControls = API;
})(typeof window !== 'undefined' ? window : globalThis);