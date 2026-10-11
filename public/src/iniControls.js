// public/src/iniControls.js
(function (global) {
  'use strict';

  const _liveIntervals = [];

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
      if (schema.type === 'button' || schema.type === 'axis' || schema.type === 'key') {
        return 'binding';
      }
      return schema.type;
    }
    const P = global.IniParser;
    if (!P) return 'string';
    return P.detectValueType(rawValue);
  }

  async function populateAudioSinks(select, currentValue) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (e) {}
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

  function createIniControl(opts) {
    opts = opts || {};
    const schema = opts.schema || {};
    const rawValue = opts.value != null ? String(opts.value) : '';
    const type = resolveType(schema, rawValue);
    const label = schema.label || opts.key || '';

    let controlEl;
    let getValue;

    switch (type) {

      case 'bool': {
        const cb = el('input', { type: 'checkbox', class: 'ini-checkbox' });
        cb.checked = parseBool(rawValue);
        controlEl = cb;
        getValue = () => (cb.checked ? '1' : '0');
        cb.addEventListener('change', () => { if (opts.onChange) opts.onChange(getValue()); });
        break;
      }

      case 'int':
      case 'float': {
        const step = schema.step != null ? schema.step : (type === 'int' ? 1 : 0.01);
        const hasRange = schema.min != null && schema.max != null;
        if (hasRange) {
          const range = el('input', { type: 'range', class: 'ini-range',
            min: schema.min, max: schema.max, step: step, value: rawValue });
          const num = el('input', { type: 'number', class: 'ini-number',
            min: schema.min, max: schema.max, step: step, value: rawValue });
          range.addEventListener('input', () => { num.value = range.value; if (opts.onChange) opts.onChange(range.value); });
          num.addEventListener('input', () => { range.value = num.value; if (opts.onChange) opts.onChange(num.value); });
          controlEl = el('div', { class: 'ini-slider-wrap' }, [range, num]);
          getValue = () => num.value;
        } else {
          const num = el('input', { type: 'number', class: 'ini-number', step: step, value: rawValue });
          num.addEventListener('input', () => { if (opts.onChange) opts.onChange(num.value); });
          controlEl = num;
          getValue = () => num.value;
        }
        break;
      }

      case 'enum': {
        const sel = el('select', { class: 'ini-select' });
        const options = schema.options || [];
        let matched = false;
        for (const o of options) {
          const opt = el('option', { value: o.value, text: o.label });
          if (String(o.value) === rawValue) { opt.selected = true; matched = true; }
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
        sel.addEventListener('change', () => { if (opts.onChange) opts.onChange(sel.value); });
        controlEl = sel;
        getValue = () => sel.value;
        break;
      }

      case 'binding': {
        // JOY / JOY_MODIFICATOR : menu déroulant
        if ((opts.key === 'JOY' || opts.key === 'JOY_MODIFICATOR') && opts.sectionContext) {
          const controllers = opts.sectionContext.controllers || [];
          const sel = el('select', { class: 'ini-select' });
          const none = el('option', { value: '-1', text: '— Aucun —' });
          if (rawValue === '-1') none.selected = true;
          sel.appendChild(none);
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
          sel.addEventListener('change', () => { if (opts.onChange) opts.onChange(sel.value); });
          controlEl = sel;
          getValue = () => sel.value;
          break;
        }

        const schemaType = (schema && schema.type) || '';
        const isKeyboard = (schemaType === 'key' || opts.key === 'KEY' || opts.key === 'KEY_MODIFICATOR');
        const isAxis = (schemaType === 'axis' || opts.key === 'AXLE');
        const isButton = (schemaType === 'button' || opts.key === 'BUTTON' || opts.key === 'BUTTON_MODIFICATOR');
        const isJoy = (opts.key === 'JOY' || opts.key === 'JOY_MODIFICATOR');

        // CLAVIER
        if (isKeyboard && global.KeyboardMapper) {
          let currentValue = rawValue;
          const btn = el('button', { type: 'button', class: 'ini-binding-btn' });
          let capturing = false;
          const labelFor = (v) => '⌨ ' + (global.KeyboardMapper.formatKey(v) || '(aucune)');
          const updateLabel = () => { btn.textContent = labelFor(currentValue); };
          updateLabel();
          const onKeyDown = (e) => {
            if (!capturing) return;
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') { stopCapture(); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
              currentValue = '-1'; updateLabel();
              if (opts.onChange) opts.onChange('-1');
              stopCapture(); return;
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

        // BOUTON
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
              axesThreshold: 0, timeoutMs: 10000,
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

        // AXE analogique
        if (isAxis && global.GamepadCapture && opts.gamepadMapper && opts.sectionHelpers) {
          let currentValue = rawValue;
          const btn = el('button', { type: 'button', class: 'ini-binding-btn ini-binding-axis' });
          let capturing = false;
          let updateLabel = () => {
            const n = parseInt(currentValue, 10);
            if (!isNaN(n) && n >= 0) {
              btn.textContent = '↔ Axe ' + n;
              btn.classList.remove('ini-binding-axis-empty');
            } else {
              btn.textContent = '⚠️ Non assigné — Cliquez pour configurer';
              btn.classList.add('ini-binding-axis-empty');
            }
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
            btn.textContent = '↔ Bougez l\'axe… (Échap annule)';
            global.GamepadCapture.start({
              axesThreshold: 0.5, timeoutMs: 10000,
              resolveAcIndex: (chromiumIndex) => {
                const t = opts.gamepadMapper.match();
                const m = t.find(x => x.chromiumIndex === chromiumIndex && x.matched);
                return m ? m.acIndex : null;
              },
              onCapture: (r) => {
                if (r.kind !== 'axis') return;
                let acAxis = r.axisIndex;
                if (global.GamepadMapper && global.GamepadMapper.chromiumAxisToAcAxis) {
                  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                  const pad = pads[r.chromiumIndex];
                  const vp = pad ? global.GamepadMapper.parseChromiumGamepadId(pad.id) : null;
                  if (vp) {
                    acAxis = global.GamepadMapper.chromiumAxisToAcAxis(vp.vendor, vp.product, r.axisIndex);
                  }
                }
                currentValue = String(acAxis);
                updateLabel();
                if (opts.onChange) opts.onChange(currentValue);
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

          const numInp = el('input', { type: 'number', class: 'ini-number', min: -1, max: 31, value: currentValue });
          numInp.addEventListener('input', () => {
            currentValue = numInp.value;
            updateLabel();
            if (opts.onChange) opts.onChange(currentValue);
          });
          const _baseUpdateLabel = updateLabel;
          updateLabel = () => { _baseUpdateLabel(); numInp.value = currentValue; };
          updateLabel();

          // ⭐ Barre de prévisualisation live
          const liveFill = el('div', { class: 'ini-axis-live-fill' });
          const liveValue = el('div', { class: 'ini-axis-live-value', text: '—' });
          const liveBar = el('div', { class: 'ini-axis-live' }, [liveFill, liveValue]);
          const wrapTop = el('div', { class: 'ini-binding-wrap' }, [btn, numInp]);
          const fullWrap = el('div', { class: 'ini-axis-fullwrap' }, [wrapTop, liveBar]);

          let liveInterval = null;

          function updateLiveBar() {
            const mapper = opts.gamepadMapper;
            const sh = opts.sectionHelpers;
            if (!mapper || !sh) { liveValue.textContent = '—'; return; }

            const acAxis = parseInt(currentValue, 10);
            if (isNaN(acAxis)) { liveValue.textContent = '—'; liveFill.style.width = '0%'; return; }

            const acJoy = parseInt(sh.getValue('JOY'), 10);
            if (isNaN(acJoy) || acJoy < 0) {
              liveValue.textContent = 'JOY=?';
              liveFill.style.width = '0%';
              return;
            }

            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const table = mapper.match();
            const row = table.find(x => x.acIndex === acJoy && x.matched);
            if (!row || row.chromiumIndex == null) {
              liveValue.textContent = 'pad?';
              liveFill.style.width = '0%';
              return;
            }

            const refPad = pads[row.chromiumIndex];
            if (!refPad) { liveValue.textContent = '—'; liveFill.style.width = '0%'; return; }
            const vp = mapper.parseChromiumGamepadId(refPad.id);
            if (!vp) { liveValue.textContent = '—'; liveFill.style.width = '0%'; return; }

            if (acAxis < 0) { liveValue.textContent = '—'; liveFill.style.width = '0%'; return; }
            const cAxis = mapper.acAxisToChromiumAxis(vp.vendor, vp.product, acAxis);
            if (cAxis < 0) { liveValue.textContent = '?'; liveFill.style.width = '0%'; return; }

            // ⭐ Trouve parmi tous les pads avec le même Vendor:Product celui
            //    qui a la plus grande amplitude sur cAxis (évite le pad fantôme)
            let bestVal = null;
            for (let i = 0; i < pads.length; i++) {
              const p = pads[i];
              if (!p) continue;
              const pVp = mapper.parseChromiumGamepadId(p.id);
              if (!pVp || pVp.vendor !== vp.vendor || pVp.product !== vp.product) continue;
              const v = p.axes[cAxis];
              if (v == null) continue;
              if (bestVal === null || Math.abs(v) > Math.abs(bestVal)) bestVal = v;
            }
            if (bestVal === null) { liveValue.textContent = '—'; liveFill.style.width = '0%'; return; }

            // ⭐ Détecte si l'axe est inversé (MIN > MAX dans controls.ini)
            const minRaw = sh.getValue('MIN');
            const maxRaw = sh.getValue('MAX');
            const minVal = parseFloat(minRaw);
            const maxVal = parseFloat(maxRaw);
            const isInverted = !isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal;

            let pct = ((bestVal + 1) / 2) * 100;
            if (isInverted) pct = 100 - pct;

            liveFill.style.width = pct.toFixed(1) + '%';
            liveValue.textContent = (isInverted ? '⇄ ' : '') + bestVal.toFixed(2);
          }

          function startLive() {
            if (liveInterval) return;
            liveInterval = setInterval(updateLiveBar, 80);
            _liveIntervals.push(liveInterval);
          }

          controlEl = fullWrap;
          getValue = () => currentValue;
          controlEl._startLive = startLive;
          break;
        }

        // XBOXBUTTON
        if (opts.key === 'XBOXBUTTON') {
          const values = ['-1','A','B','X','Y','LSHOULDER','RSHOULDER','BACK','START',
                          'DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT','LTHUMB','RTHUMB'];
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

        // Fallback texte
        const inp = el('input', { type: 'text', class: 'ini-text ini-binding',
          value: rawValue, placeholder: isJoy ? 'index du périphérique AC' : 'valeur brute' });
        inp.addEventListener('input', () => { if (opts.onChange) opts.onChange(inp.value); });
        controlEl = inp;
        getValue = () => inp.value;
        break;
      }

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
        sel.addEventListener('change', () => { if (opts.onChange) opts.onChange(sel.value); });
        controlEl = sel;
        getValue = () => sel.value;
        break;
      }

      case 'string':
      default: {
        const inp = el('input', { type: 'text', class: 'ini-text', value: rawValue });
        inp.addEventListener('input', () => { if (opts.onChange) opts.onChange(inp.value); });
        controlEl = inp;
        getValue = () => inp.value;
        break;
      }
    }

    const labelEl = el('label', { class: 'ini-label', title: opts.key || '', text: label });
    if (schema.unit) labelEl.appendChild(el('span', { class: 'ini-unit', text: ' (' + schema.unit + ')' }));
    const wrapper = el('div', { class: 'ini-row' }, [labelEl, controlEl]);

    return {
      element: wrapper,
      getValue: getValue,
      setValue: (v) => {
        v = v != null ? String(v) : '';
        switch (type) {
          case 'bool': controlEl.checked = parseBool(v); break;
          case 'int':
          case 'float':
            if (controlEl.classList && controlEl.classList.contains('ini-slider-wrap')) {
              controlEl.querySelector('.ini-range').value = v;
              controlEl.querySelector('.ini-number').value = v;
            } else if (controlEl && controlEl.value !== undefined) {
              controlEl.value = v;
            }
            break;
          default:
            if (controlEl && controlEl.value !== undefined) controlEl.value = v;
        }
      },
      type: type,
      startLive: controlEl && controlEl._startLive ? controlEl._startLive : null,
    };
  }

  function stopAllLives() {
    for (const id of _liveIntervals) clearInterval(id);
    _liveIntervals.length = 0;
  }

  const API = { createIniControl, stopAllLives };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.IniControls = API;
})(typeof window !== 'undefined' ? window : globalThis);