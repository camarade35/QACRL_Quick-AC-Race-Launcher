// public/src/iniControls.js
(function (global) {
  'use strict';

  const _liveIntervals = [];

  // ⭐ Helper de traduction : utilise I18n.tFr si dispo, sinon renvoie le texte
  function T(s) {
    if (!s) return '';
    return (global.I18n && global.I18n.tFr) ? global.I18n.tFr(s) : s;
  }

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
        const label = (d.label || '').trim() || (T('Sortie ') + d.deviceId.slice(0, 8));
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
          const opt = el('option', { value: f, text: formatPpFilterName(f) });
          if (f === rawValue) { opt.selected = true; matched = true; }
          sel.appendChild(opt);
        }
        if (!matched && rawValue) {
          const opt = el('option', { value: rawValue, text: formatPpFilterName(rawValue) });
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
          const none = el('option', { value: '-1', text: '— ' + T('Aucun') + ' —' });
          if (rawValue === '-1') none.selected = true;
          sel.appendChild(none);
          let matched = false;
          for (const c of controllers) {
            const labelTxt = 'JOY=' + c.index + ' — ' + c.name;
            const opt = el('option', { value: String(c.index), text: labelTxt });
            if (String(c.index) === String(rawValue)) { opt.selected = true; matched = true; }
            sel.appendChild(opt);
          }
          if (!matched && rawValue && rawValue !== '-1') {
            const opt = el('option', { value: rawValue, text: 'JOY=' + rawValue + ' (' + T('inconnu') + ')' });
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
          const labelFor = (v) => '⌨ ' + (global.KeyboardMapper.formatKey(v) || '(' + T('aucune') + ')');
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
            btn.textContent = T('⌨ Appuyez sur une touche… (Échap = annule, Suppr = efface)');
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
            btn.textContent = (!isNaN(n) && n >= 0) ? '🎮 ' + T('Bouton') + ' ' + n : '🎮 (' + T('aucun') + ')';
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
            btn.textContent = T('🎮 Appuyez sur un bouton du pad… (Échap annule, Suppr efface)');
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

          // ⭐ Hint indicatif par index AC (DirectInput — purement informatif)
          const AC_AXIS_HINTS = {
            0: 'Volant / X',
            1: 'Accélérateur / Y',
            2: 'Z (direction alt.)',
            3: 'Rx',
            4: 'Ry',
            5: 'Rz / Frein load cell',
            6: 'Slider 0 / Embrayage',
            7: 'Slider 1',
          };
          const getAcAxisLabel = (n) => {
            if (n === -1) return '— ' + T('Non assigné') + ' —';
            const base = T('Axe') + ' ' + n;
            const hint = AC_AXIS_HINTS[n];
            return hint ? base + ' — ' + T(hint) : base;
          };

          let updateLabel = () => {
            const n = parseInt(currentValue, 10);
            const axisWord = T('Axe');
            const noneWord = T('Non assigné');
            if (!isNaN(n) && n >= 0) {
              btn.textContent = '↔ ' + axisWord + ' ' + n;
              btn.classList.remove('ini-binding-axis-empty');
            } else {
              btn.textContent = '⚠️ ' + noneWord + ' — ' + T('Cliquez pour configurer');
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
            btn.textContent = T('↔ Bougez l\'axe… (Échap annule)');
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

          // ⭐ Menu déroulant AXE 0-31 (remplace l'ancien input number)
          const sel = el('select', { class: 'ini-select ini-axis-select' });
          const rebuildSelectOptions = () => {
            sel.innerHTML = '';
            const none = el('option', { value: '-1', text: getAcAxisLabel(-1) });
            sel.appendChild(none);
            for (let i = 0; i <= 31; i++) {
              const opt = el('option', { value: String(i), text: getAcAxisLabel(i) });
              sel.appendChild(opt);
            }
            // ⭐ Si la valeur actuelle est hors plage, on l'ajoute en option custom
            const n = parseInt(currentValue, 10);
            if (!isNaN(n) && (n < -1 || n > 31)) {
              const custom = el('option', {
                value: String(n),
                text: T('Axe') + ' ' + n + ' (' + T('hors plage') + ')'
              });
              sel.appendChild(custom);
            }
            sel.value = String(n);
          };
          rebuildSelectOptions();

          sel.addEventListener('change', () => {
            currentValue = sel.value;
            updateLabel();
            if (opts.onChange) opts.onChange(currentValue);
          });

          // ⭐ Bouton "Reset axe" → AXLE = -1 en un clic
          const resetBtn = el('button', {
            type: 'button',
            class: 'ini-axis-reset',
            title: T('Réinitialiser cet axe (AXLE = -1)')
          });
          resetBtn.textContent = '🔄';
          resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentValue = '-1';
            sel.value = '-1';
            updateLabel();
            if (opts.onChange) opts.onChange('-1');
          });

          // ⭐ Bouton "Reconfigurer cet axe" (mini-wizard)
          const reconfigBtn = el('button', {
            type: 'button',
            class: 'ini-axis-reconfig',
            title: T('Reconfigurer cet axe avec le wizard guidé')
          });
          reconfigBtn.textContent = '🎯';
          reconfigBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (global.WheelCalibration && typeof global.WheelCalibration.startSingleStep === 'function') {
              global.WheelCalibration.startSingleStep(opts.section);
            } else {
              alert(T('Le wizard de calibration n\'est pas disponible.'));
            }
          });

          // ⭐ Sync final : garde le select aligné sur currentValue
          const _baseUpdateLabel = updateLabel;
          updateLabel = () => {
            _baseUpdateLabel();
            sel.value = String(currentValue);
          };
          updateLabel();

          // ⭐ Barre de prévisualisation live
          const liveFill = el('div', { class: 'ini-axis-live-fill' });
          const liveValue = el('div', { class: 'ini-axis-live-value', text: '—' });
          const liveBar = el('div', { class: 'ini-axis-live' }, [liveFill, liveValue]);
          const wrapTop = el('div', { class: 'ini-binding-wrap ini-binding-wrap-4col' }, [btn, sel, resetBtn, reconfigBtn]);
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
            const opt = el('option', { value: v, text: v === '-1' ? '(' + T('aucun') + ')' : v });
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
          value: rawValue, placeholder: isJoy ? T('index du périphérique AC') : T('valeur brute') });
        inp.addEventListener('input', () => { if (opts.onChange) opts.onChange(inp.value); });
        controlEl = inp;
        getValue = () => inp.value;
        break;
      }
      
      // ---------------------------------------------------------------------
      // RESOLUTION : menu déroulant (écrit WIDTH + HEIGHT automatiquement)
      // ---------------------------------------------------------------------
      case 'resolution': {
        const sel = el('select', { class: 'ini-select' });
        const placeholder = el('option', { value: '', text: '⏳ ' + T('Chargement…') });
        sel.appendChild(placeholder);

        const w = parseInt(rawValue, 10) || 0;
        const h = opts.sectionHelpers ? parseInt(opts.sectionHelpers.getValue('HEIGHT'), 10) : 0;

        if (window.api && window.api.listResolutions) {
          window.api.listResolutions().then(res => {
            if (!res || !res.success) {
              sel.innerHTML = '<option value="">⚠️ ' + T('Erreur') + '</option>';
              return;
            }
            sel.innerHTML = '';
            let matched = false;
            for (const r of res.resolutions) {
              const opt = el('option', { value: r.width + 'x' + r.height, text: r.label });
              if (r.width === w && r.height === h) { opt.selected = true; matched = true; }
              sel.appendChild(opt);
            }
            if (!matched && w > 0 && h > 0) {
              const opt = el('option', { value: w + 'x' + h, text: `${w} × ${h} (${T('actuel')})` });
              opt.selected = true;
              sel.insertBefore(opt, sel.firstChild);
            }
          }).catch(() => {});
        }

        sel.addEventListener('change', () => {
          const v = sel.value;
          const m = v.match(/^(\d+)x(\d+)$/);
          if (!m) return;
          const newW = m[1];
          const newH = m[2];
          // Écrit WIDTH (soi-même)
          if (opts.onChange) opts.onChange(newW);
          // Écrit HEIGHT (clé sœur)
          if (opts.sectionHelpers && opts.sectionHelpers.hasKey('HEIGHT')) {
            opts.sectionHelpers.setValue('HEIGHT', newH);
            const hw = opts.siblingWidgets && opts.siblingWidgets['HEIGHT'];
            if (hw && hw.setValue) hw.setValue(newH);
          }
        });

        controlEl = sel;
        getValue = () => {
          const m = sel.value.match(/^(\d+)x(\d+)$/);
          return m ? m[1] : rawValue;
        };
        break;
      }

      case 'audiosink': {
        const sel = el('select', { class: 'ini-select' });
        if (rawValue) {
          const opt0 = el('option', { value: rawValue, text: rawValue });
          opt0.selected = true;
          sel.appendChild(opt0);
        } else {
          const opt0 = el('option', { value: '', text: '— ' + T('Aucun') + ' —' });
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

    const displayLabel = T(label);
    const labelEl = el('label', { class: 'ini-label', title: opts.key || '', text: displayLabel });
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