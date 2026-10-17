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
        // ⭐ v1.6.2 — Deadzone custom avec pourcentage et bouton Reset
        if (opts.section === 'X360' && opts.key === 'STEER_DEADZONE') {
          let currentValue = parseFloat(rawValue) || 0;
          const wrap = el('div', { class: 'ini-slider-wrap' });
          
          const range = el('input', { type: 'range', class: 'ini-range', min: 0, max: 1, step: 0.01, value: currentValue });
          const num = el('div', { class: 'ini-number', style: 'width: 60px; text-align: center; font-weight: bold;', text: Math.round(currentValue * 100) + '%' });
          
          const resetBtn = el('button', {
            type: 'button',
            class: 'ini-axis-reset',
            title: T('Réinitialiser à 0%')
          });
          resetBtn.textContent = '↺';
          
          const updateUI = (val) => {
            currentValue = parseFloat(val) || 0;
            range.value = currentValue;
            num.textContent = Math.round(currentValue * 100) + '%';
            if (opts.onChange) opts.onChange(currentValue.toFixed(2));
          };

          range.addEventListener('input', () => updateUI(range.value));
          resetBtn.addEventListener('click', () => updateUI(0));

          wrap.appendChild(range);
          wrap.appendChild(num);
          wrap.appendChild(resetBtn);

          controlEl = wrap;
          getValue = () => currentValue.toFixed(2);
          break;
        }

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
        // ⭐ v1.6.2 — ThumbPicker pour la section X360
        if (opts.section === 'X360' && opts.key === 'STEER_THUMB') {
          let currentValue = rawValue || 'LEFT';
          const wrap = el('div', { class: 'qacrl-ctrl-method-picker', style: 'gap: 6px;' });
          
          const btnLeft = el('button', {
            type: 'button',
            class: 'qacrl-ctrl-method-btn' + (currentValue === 'LEFT' ? ' active' : ''),
            style: 'flex: 1; min-height: 40px; padding: 8px;'
          }, [el('span', { class: 'qacrl-ctrl-method-icon', text: '🕹️' }), el('span', { text: T('Stick Gauche') })]);
          
          const btnRight = el('button', {
            type: 'button',
            class: 'qacrl-ctrl-method-btn' + (currentValue === 'RIGHT' ? ' active' : ''),
            style: 'flex: 1; min-height: 40px; padding: 8px;'
          }, [el('span', { class: 'qacrl-ctrl-method-icon', text: '🕹️' }), el('span', { text: T('Stick Droit') })]);

          const updateBtns = () => {
            btnLeft.classList.toggle('active', currentValue === 'LEFT');
            btnRight.classList.toggle('active', currentValue === 'RIGHT');
          };

          btnLeft.addEventListener('click', () => { currentValue = 'LEFT'; updateBtns(); if (opts.onChange) opts.onChange(currentValue); });
          btnRight.addEventListener('click', () => { currentValue = 'RIGHT'; updateBtns(); if (opts.onChange) opts.onChange(currentValue); });

          wrap.appendChild(btnLeft);
          wrap.appendChild(btnRight);
          controlEl = wrap;
          getValue = () => currentValue;
          break;
        }

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
        // JOY / JOY_MODIFICATOR : menu déroulant (⭐ v1.6.0-UX : filtré par mode)
        if ((opts.key === 'JOY' || opts.key === 'JOY_MODIFICATOR') && opts.sectionContext) {
          const allControllers = opts.sectionContext.controllers || [];
          const inputMethod = String(opts.currentInputMethod || '').toUpperCase();

          // Filtre selon le mode courant :
          //   - WHEEL → wheels d'abord, puis accessoires (other)
          //   - X360  → gamepads d'abord, puis accessoires (other)
          //   - autres → tout
          //
          // ⭐ v1.6.0-fix-other — Les devices "other" (frein à main ODDOR,
          //    shifter DIY, pédaliers custom…) sont désormais INCLUS dans la
          //    liste, sinon impossible de les assigner en mode X360/WHEEL
          //    (ex : frein à main ODDOR classé "other" disparaissait du
          //    dropdown JOY → utilisateur bloqué, JOY=0 pointait sur Xbox
          //    au lieu d'ODDOR sans que l'utilisateur puisse corriger).
          let filtered = allControllers;
          let filterLabel = null;
          if (inputMethod === 'WHEEL') {
            const primary     = allControllers.filter(c => c.type === 'wheel');
            const accessories = allControllers.filter(c => c.type === 'other');
            filtered = primary.concat(accessories);
            filterLabel = T('Volants + accessoires (mode Volant)');
          } else if (inputMethod === 'X360') {
            const primary     = allControllers.filter(c => c.type === 'gamepad');
            const accessories = allControllers.filter(c => c.type === 'other');
            filtered = primary.concat(accessories);
            filterLabel = T('Manettes + accessoires (mode Manette)');
          }

          const sel = el('select', { class: 'ini-select' });
          const none = el('option', { value: '-1', text: '— ' + T('Aucun') + ' —' });
          if (rawValue === '-1') none.selected = true;
          sel.appendChild(none);

          let matched = false;

          // Options filtrées
          for (const c of filtered) {
            // ⭐ v1.6.0-fix-other — Préfixe visuel pour les accessoires
            //    (handbrake, shifter, pédalier custom… classés "other")
            const prefix = (c.type === 'other' && inputMethod && inputMethod !== 'KEYBOARD')
              ? '🔧 '
              : '';
            const labelTxt = prefix + 'JOY=' + c.index + ' — ' + c.name;
            const opt = el('option', { value: String(c.index), text: labelTxt });
            if (String(c.index) === String(rawValue)) { opt.selected = true; matched = true; }
            sel.appendChild(opt);
          }

          // ⭐ Si la valeur actuelle n'est PAS dans la liste filtrée → ajoute-la
          //    en haut avec un warning, pour que l'utilisateur voie l'incohérence
          if (!matched && rawValue && rawValue !== '-1') {
            const current = allControllers.find(c => String(c.index) === String(rawValue));
            if (current) {
              const typeLabel = current.type === 'wheel' ? T('volant')
                              : current.type === 'gamepad' ? T('manette')
                              : T('inconnu');
              const opt = el('option', {
                value: rawValue,
                text: '⚠️ JOY=' + rawValue + ' — ' + current.name + ' (' + typeLabel + ')',
              });
              opt.selected = true;
              opt.style.color = '#e6a33b';
              sel.insertBefore(opt, none.nextSibling);
            } else {
              const opt = el('option', {
                value: rawValue,
                text: 'JOY=' + rawValue + ' (' + T('non détecté') + ')',
              });
              opt.selected = true;
              opt.style.color = '#e6a33b';
              sel.insertBefore(opt, none.nextSibling);
            }
          }

          // Hint si aucun device du bon type n'existe
          if (filtered.length === 0 && inputMethod) {
            const emptyOpt = el('option', {
              value: '',
              text: '⚠️ ' + T('Aucun device détecté pour ce mode'),
            });
            emptyOpt.disabled = true;
            sel.appendChild(emptyOpt);
          }

          sel.addEventListener('change', () => { if (opts.onChange) opts.onChange(sel.value); });

          // ⭐ v1.6.0-UX — Ajoute un petit hint au-dessus si filtré
          if (filterLabel && filtered.length > 0) {
            sel.title = filterLabel;
          }

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
            let deviceName = '';
            if (opts.sectionHelpers) {
              const joyStr = opts.sectionHelpers.getValue('JOY');
              const joyIndex = parseInt(joyStr, 10);
              if (!isNaN(joyIndex) && joyIndex >= 0) {
                const ctrlList = (opts.sectionContext && opts.sectionContext.controllers) || [];
                const c = ctrlList.find(x => String(x.index) === String(joyIndex));
                if (c) deviceName = ' (' + c.name + ')';
              }
            }
            btn.textContent = (!isNaN(n) && n >= 0) ? '🎮 ' + T('Bouton') + ' ' + n + deviceName : '🎮 (' + T('aucun') + ')';
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

            let captured = false;
            const onButtonCaptured = (buttonIndex, acIndex) => {
              if (captured) return;
              captured = true;
              currentValue = String(buttonIndex);
              
              if (acIndex != null && opts.sectionHelpers) {
                opts.sectionHelpers.setValue('JOY', String(acIndex));
              }

              updateLabel();
              if (opts.onChange) opts.onChange(currentValue);
              if (global.GamepadCapture.isCapturing()) global.GamepadCapture.stop();
              if (global.GamepadHidCapture) global.GamepadHidCapture.stop();
              stopCapture();
            };

            // 1. Capture standard Chromium
            global.GamepadCapture.start({
              axesThreshold: 0, timeoutMs: 10000,
              resolveAcIndex: (chromiumIndex) => {
                const t = opts.gamepadMapper.match();
                const m = t.find(x => x.chromiumIndex === chromiumIndex && x.matched);
                return m ? m.acIndex : null;
              },
              onCapture: (r) => {
                if (r.kind !== 'button') return;
                onButtonCaptured(r.buttonIndex, r.acIndex);
              },
              onCancel: () => {
                // On ne fait rien si c'est l'autre capture qui a réussi
                if (!captured) stopCapture();
              }
            });

            // 2. Capture WebHID (pour SparkFun et DIY)
            if (global.GamepadHidCapture) {
              global.GamepadHidCapture.start({
                timeoutMs: 10000,
                onCapture: (r) => {
                  let acIndex = null;
                  const ctrlList = (opts.sectionContext && opts.sectionContext.controllers) || [];
                  const devName = r.device.productName || '';
                  const match = ctrlList.find(c => c.name === devName || c.name.includes(devName) || devName.includes(c.name));
                  if (match) acIndex = match.index;
                  
                  onButtonCaptured(r.buttonIndex, acIndex);
                },
                onCancel: () => {}
              }).catch(() => {});
            }

            const escHandler = (e) => {
              if (e.key === 'Escape' && capturing) {
                e.preventDefault(); e.stopPropagation();
                document.removeEventListener('keydown', escHandler, true);
                if (global.GamepadHidCapture) global.GamepadHidCapture.stop();
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

          // ⭐ v1.6.0-W4C — Widget AxisCapture dédié aux sections pédales en mode X360
          // ⭐ v1.6.0-final — CORRECTION : en mode X360, AC utilise les gâchettes
          //    XInput NATIVES (LT/RT hardcodées au moteur). Les AXLE du fichier
          //    sont des artefacts ignorés. On affiche donc un badge READ-ONLY.
          const isPedalSection = ['THROTTLE', 'BRAKES', 'CLUTCH', 'HANDBRAKE'].indexOf(opts.section) !== -1;
          const isX360Mode = String(opts.currentInputMethod || '').toUpperCase() === 'X360';

          if (isPedalSection && isX360Mode) {
            // Badge read-only : informatif uniquement
            const nativeLabel = (opts.section === 'THROTTLE') ? 'RT'
                              : (opts.section === 'BRAKES')   ? 'LT'
                              : (opts.section === 'CLUTCH')   ? 'LT (partagé)'
                              : (opts.section === 'HANDBRAKE') ? 'Bouton B'
                              : 'natif';

            const badge = el('div', {
              class: 'ini-readonly-badge',
              title: T('En mode Manette, AC utilise les gâchettes XInput natives (RT/LT). Ces valeurs sont ignorées en jeu.'),
            });
            badge.innerHTML = '🎮 <strong>' + nativeLabel + '</strong> — ' +
                              T('Gâchette native XInput (mappage fixe)');

            const wrap = el('div', { class: 'ini-axis-x360-wrap' }, [badge]);

            // ⚠️ On stocke la valeur pour compat mais elle ne sera jamais modifiée
            controlEl = wrap;
            getValue = () => rawValue;
            break;
          }


          // ─── Widget AXLE standard (comportement historique) ───
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
          // ⭐ v1.6.0-fix-other — Le wizard est DÉSACTIVÉ pour les devices "other"
          //    (handbrake, shifter DIY, pédaliers custom…). Ces périphériques
          //    n'apparaissent PAS dans navigator.getGamepads() → Chromium ne
          //    les voit pas → le wizard capturerait un axe d'un AUTRE device
          //    (ex: embrayage du Fanatec) et écraserait le bon axe.
          const reconfigBtn = el('button', {
            type: 'button',
            class: 'ini-axis-reconfig',
            title: T('Reconfigurer cet axe avec le wizard guidé')
          });
          reconfigBtn.textContent = '🎯';

          // ⭐ v1.6.2 — Bouton de capture HID pour les devices invisibles (ODDOR)
          const hidBtn = el('button', {
            type: 'button',
            class: 'ini-axis-reconfig',
            title: T('Tester l\'axe en temps réel via WebHID'),
            style: 'display: none;' // Caché par défaut, affiché si device "other"
          });
          hidBtn.textContent = '🔍';

          // Détermine si le device JOY courant est un "other" (accessoire)
          // ⭐ FIX : opts.sectionHelpers (pas sectionHelpers)
          const currentJoyStr = opts.sectionHelpers
            ? opts.sectionHelpers.getValue('JOY')
            : null;
          const currentCtl = (opts.sectionContext && Array.isArray(opts.sectionContext.controllers))
            ? opts.sectionContext.controllers.find(c => String(c.index) === String(currentJoyStr))
            : null;
          const isOtherDevice = currentCtl && currentCtl.type === 'other';

          if (isOtherDevice) {
            // ⭐ v1.6.2 — Wizard HID pour les devices "other" (ODDOR, etc.)
            reconfigBtn.title = T('Détecter automatiquement l\'axe via WebHID');
            reconfigBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              if (!global.GamepadHidCapture) {
                alert(T('Module WebHID non disponible.'));
                return;
              }

              // On lance une capture HID (pas de test continu, on veut juste le 1er mouvement)
              const originalText = liveValue.textContent;
              liveValue.textContent = 'Tirez le frein...';
              
              global.GamepadHidCapture.start({
                captureMode: 'axis',
                timeoutMs: 5000,
                deviceName: currentCtl ? currentCtl.name : null,
                onCapture: (r) => {
                  // ⭐ v1.6.2 — Assignation intelligente selon le périphérique
                  // L'ODDOR (et la plupart des DIY) utilisent le Slider (Axe 6) pour le frein à main.
                  let suggestedAxis = 6; 
                  if (opts.section === 'THROTTLE') suggestedAxis = 1;
                  if (opts.section === 'STEER') suggestedAxis = 0;
                  if (opts.section === 'BRAKES') suggestedAxis = 2;

                  currentValue = String(suggestedAxis);
                  if (opts.onChange) opts.onChange(currentValue);
                  
                  // ⭐ Met à jour l'interface visuelle (le menu déroulant et le bouton)
                  if (typeof updateLabel === 'function') {
                    updateLabel(); 
                  }
                  
                  liveValue.textContent = originalText;
                  
                  // ⭐ Alerte de succès
                  const showAlert = window.QacrlDialogs ? window.QacrlDialogs.alert : window.alert;
                  showAlert(
                    T('Mouvement détecté sur le périphérique !\n\n') +
                    T('L\'axe a été assigné à AXLE=' + suggestedAxis + ' par défaut.\n\n') +
                    T('Si cela ne fonctionne pas en jeu, tu pourras changer la valeur dans le menu déroulant.'),
                    T('Détection réussie'),
                    { variant: 'success', okLabel: 'OK' }
                  );
                },
                onCancel: () => {
                  liveValue.textContent = originalText;
                }
              }).catch(() => {
                liveValue.textContent = originalText;
              });
            });
          } else {
            reconfigBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (global.WheelCalibration && typeof global.WheelCalibration.startSingleStep === 'function') {
                global.WheelCalibration.startSingleStep(opts.section);
              } else {
                alert(T('Le wizard de calibration n\'est pas disponible.'));
              }
            });
          }

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
          // ⭐ v1.6.2 — Affiche le bouton HID si c'est un device "other" (ex: ODDOR)
          if (isOtherDevice) {
            hidBtn.style.display = 'flex';
            hidBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              if (!global.GamepadHidCapture) {
                alert(T('Module WebHID non disponible.'));
                return;
              }

              // ⭐ Stoppe le live en cours avant de lancer le test
              if (global.GamepadHidCapture) global.GamepadHidCapture.stop();

              const originalText = liveValue.textContent;
              liveValue.textContent = 'En attente...';
              liveFill.style.width = '0%';

              hidBtn.disabled = true;
              hidBtn.style.opacity = '0.5';

              let minObserved = 999999;
              let maxObserved = -1;

              let lastPct = 0; // ⭐ Mémorise la dernière position pour le lissage

              global.GamepadHidCapture.start({
                captureMode: 'axis',
                timeoutMs: 15000,
                isTestMode: true, // ⭐ Mode Test continu
                deviceName: currentCtl ? currentCtl.name : null,
                onLiveData: (val) => {
                  // ⭐ Calcul du pourcentage pour l'ODDOR (0 - 1023 après correction)
                  const maxVal = 1023; 
                  const pct = Math.min(100, Math.max(0, (val / maxVal) * 100));
                  
                  liveFill.style.transition = 'none';
                  liveFill.style.width = pct.toFixed(1) + '%';
                  liveValue.textContent = `Valeur : ${val} (${pct.toFixed(0)}%)`;
                },
                onCapture: () => {
                  // Pas utilisé en mode Test
                },
                onCancel: () => {
                  liveFill.style.transition = 'width 0.08s linear'; // ⭐ Restaure l'animation
                  liveFill.style.width = '0%';
                  liveValue.textContent = originalText;
                  hidBtn.disabled = false;
                  hidBtn.style.opacity = '1';
                }
              }).catch(() => {
                liveFill.style.width = '0%';
                liveValue.textContent = originalText;
                hidBtn.disabled = false;
                hidBtn.style.opacity = '1';
              });
            });
          }

          const wrapTop = el('div', { class: 'ini-binding-wrap ini-binding-wrap-4col' }, [btn, sel, hidBtn, reconfigBtn]);
          const fullWrap = el('div', { class: 'ini-axis-fullwrap' }, [wrapTop, liveBar]);

          // ⭐ Astuce MIN/MAX pour les devices "other"
          if (isOtherDevice) {
            const hintEl = el('div', {
              class: 'ini-axis-hint',
              text: T('💡 Astuce : Pour un frein à main, choisis AXLE=5, puis ajuste MIN=-1 et MAX=1. Si l\'axe est inversé, mets MIN=1 et MAX=-1.'),
              style: 'font-size: 0.72rem; color: var(--text-tertiary); margin-top: 6px; font-style: italic; display: block;'
            });
            fullWrap.appendChild(hintEl);
          }

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

            // ⭐ v1.6.2 — Live continu via WebHID pour les devices invisibles (ODDOR)
            if (isOtherDevice && global.GamepadHidCapture) {
              liveValue.textContent = 'En attente...';
              global.GamepadHidCapture.start({
                captureMode: 'axis',
                timeoutMs: 0, // 0 = Tourne à l'infini
                isTestMode: true,
                deviceName: currentCtl ? currentCtl.name : null,
                onLiveData: (val) => {
                  // ⭐ Calcul du pourcentage pour l'ODDOR (0 - 1023 après correction)
                  const maxVal = 1023; 
                  const pct = Math.min(100, Math.max(0, (val / maxVal) * 100));
                  
                  liveFill.style.transition = 'none';
                  liveFill.style.width = pct.toFixed(1) + '%';
                  liveValue.textContent = `Valeur : ${val} (${pct.toFixed(0)}%)`;
                },
                onCancel: () => {
                  liveFill.style.width = '0%';
                  liveValue.textContent = '—';
                }
              }).catch(() => {
                liveValue.textContent = 'Erreur HID';
              });
              return;
            }

            // Comportement normal pour les manettes/volants (Gamepad API)
            liveInterval = setInterval(updateLiveBar, 80);
            _liveIntervals.push(liveInterval);
          }

          controlEl = fullWrap;
          getValue = () => currentValue;
          controlEl._startLive = startLive;
          break;
        }

        // ⭐ v1.6.0-W2 — XBOXBUTTON : widget visuel avec capture automatique
        // ⭐ v1.6.0-W2b — Variante DpadPicker : grille croisée pour les sections
        //    de navigation (GLANCE*, ACTION_CHANGE_CAMERA).
        if (opts.key === 'XBOXBUTTON') {
          // Sections qui bénéficient d'une grille croisée
          const DPAD_SECTIONS = ['GLANCELEFT', 'GLANCERIGHT', 'GLANCEBACK', 'ACTION_CHANGE_CAMERA'];
          const isDpadFriendly = DPAD_SECTIONS.indexOf(opts.section) !== -1;

          let currentValue = rawValue || '-1';

          // Métadonnées visuelles par bouton AC
          const BTN_META = {
            '-1':         { icon: '⭕', label: T('Aucun') },
            'A':          { icon: '🅰️', label: 'A' },
            'B':          { icon: '🅱️', label: 'B' },
            'X':          { icon: '❎', label: 'X' },
            'Y':          { icon: '🟡', label: 'Y' },
            'LSHOULDER':  { icon: '🔼', label: T('Gâchette haute G (LB)') },
            'RSHOULDER':  { icon: '🔼', label: T('Gâchette haute D (RB)') },
            'LTHUMB':     { icon: '🕹️', label: T('Clic stick G') },
            'RTHUMB':     { icon: '🕹️', label: T('Clic stick D') },
            'BACK':       { icon: '⏪', label: 'Back' },
            'START':      { icon: '⏩', label: 'Start' },
            'DPAD_UP':    { icon: '⬆️', label: T('Croix ↑') },
            'DPAD_DOWN':  { icon: '⬇️', label: T('Croix ↓') },
            'DPAD_LEFT':  { icon: '⬅️', label: T('Croix ←') },
            'DPAD_RIGHT': { icon: '➡️', label: T('Croix →') },
          };
          const getMeta = (v) => BTN_META[v] || { icon: '❔', label: v || '?' };

          // ─── Afficheur (commun aux 2 variantes) ───
          const display = el('div', { class: 'ini-xbox-display' });
          const displayIcon = el('span', { class: 'ini-xbox-display-icon' });
          const displayLabel = el('span', { class: 'ini-xbox-display-label' });
          display.appendChild(displayIcon);
          display.appendChild(displayLabel);

          // Callback de highlight (assigné par la variante grille)
          let updateGridHighlight = null;

          const updateDisplay = () => {
            const meta = getMeta(currentValue);
            displayIcon.textContent = meta.icon;
            displayLabel.textContent = meta.label;
            display.classList.toggle('empty', currentValue === '-1' || !currentValue);
            if (typeof updateGridHighlight === 'function') updateGridHighlight();
          };

          // ─── Bouton "Capter" (commun aux 2 variantes) ───
          const captureBtn = el('button', {
            type: 'button',
            class: 'ini-xbox-capture-btn',
            title: T('Appuie sur un bouton de la manette'),
          });
          captureBtn.textContent = '🎯 ' + T('Capter');

          // ⚠️ Déclaré ici pour être accessible depuis la capture (variante dropdown)
          let selDropdown = null;

          let capturing = false;
          const stopCapture = () => {
            capturing = false;
            captureBtn.classList.remove('capturing');
            captureBtn.textContent = '🎯 ' + T('Capter');
            if (global.GamepadCapture && global.GamepadCapture.isCapturing()) {
              global.GamepadCapture.stop();
            }
          };

                    const startCapture = () => {
            if (!global.GamepadCapture) {
              alert(T('Module de capture non disponible.'));
              return;
            }
            capturing = true;
            captureBtn.classList.add('capturing');
            captureBtn.textContent = '● ' + T('Appuie sur un bouton…');
            global.GamepadCapture.start({
              axesThreshold: 0,
              timeoutMs: 10000,
              resolveAcIndex: () => null,
              onCapture: (r) => {
                if (r.kind !== 'button') return;
                let acValue = null;
                if (global.GamepadMapper && global.GamepadMapper.chromiumButtonToXboxButton) {
                  acValue = global.GamepadMapper.chromiumButtonToXboxButton(r.buttonIndex);
                }
                if (!acValue) {
                  console.warn('[XboxButtonPicker] bouton Chromium non mappé :', r.buttonIndex);
                  alert(T('Ce bouton n\'est pas reconnu (gâchette analogique ?). Utilise le menu déroulant.'));
                  stopCapture();
                  return;
                }
                currentValue = acValue;
                if (r.acIndex != null && opts.sectionHelpers) {
                  opts.sectionHelpers.setValue('JOY', String(r.acIndex));
                }
                if (selDropdown) selDropdown.value = acValue;
                updateDisplay();
                if (opts.onChange) opts.onChange(currentValue);
                stopCapture();
              },
              onCancel: () => stopCapture(),
            });

            const escHandler = (e) => {
              if (e.key === 'Escape' && capturing) {
                e.preventDefault();
                e.stopPropagation();
                document.removeEventListener('keydown', escHandler, true);
                stopCapture();
              }
            };
            document.addEventListener('keydown', escHandler, true);
          };

          captureBtn.addEventListener('click', () => {
            capturing ? stopCapture() : startCapture();
          });

          // ═════════════════════════════════════════════════════════════
          // Variante A : GRILLE CROISÉE (sections de navigation)
          // ═════════════════════════════════════════════════════════════
          if (isDpadFriendly) {
            const grid = el('div', { class: 'ini-dpad-grid' });

            // Cellules 3×3 : tl, up, tr, left, center, right, bl, down, br
            const cellDefs = [
              { type: 'empty' },
              { type: 'btn', value: 'DPAD_UP',    label: '⬆' },
              { type: 'empty' },
              { type: 'btn', value: 'DPAD_LEFT',  label: '⬅' },
              { type: 'center' },
              { type: 'btn', value: 'DPAD_RIGHT', label: '➡' },
              { type: 'empty' },
              { type: 'btn', value: 'DPAD_DOWN',  label: '⬇' },
              { type: 'empty' },
            ];

            const btnByValue = {};

            for (const c of cellDefs) {
              if (c.type === 'empty') {
                grid.appendChild(el('div', { class: 'ini-dpad-empty' }));
              } else if (c.type === 'center') {
                const center = el('div', {
                  class: 'ini-dpad-center',
                  title: T('Croix directionnelle'),
                });
                center.textContent = '◉';
                grid.appendChild(center);
              } else {
                const btn = el('button', {
                  type: 'button',
                  class: 'ini-dpad-btn',
                  'data-dir': c.value,
                  title: T('Cliquer pour assigner') + ' — ' + getMeta(c.value).label,
                });
                btn.textContent = c.label;
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Toggle : re-clic sur la flèche active → désassigne
                  if (currentValue === c.value) {
                    currentValue = '-1';
                  } else {
                    currentValue = c.value;
                  }
                  if (selDropdown) selDropdown.value = currentValue;
                  updateDisplay();
                  if (opts.onChange) opts.onChange(currentValue);
                });
                btnByValue[c.value] = btn;
                grid.appendChild(btn);
              }
            }

            // Highlight de la flèche active
            updateGridHighlight = () => {
              for (const v of Object.keys(btnByValue)) {
                btnByValue[v].classList.toggle('active', v === currentValue);
              }
            };

            // Colonne droite : badge + bouton Capter
            const rightCol = el('div', { class: 'ini-dpad-right' }, [display, captureBtn]);

            // Layout : [grille] [colonne droite]
            const wrap = el('div', { class: 'ini-dpad-wrap' }, [grid, rightCol]);

            updateDisplay();

            controlEl = wrap;
            getValue = () => currentValue;
            break;
          }

          // ═════════════════════════════════════════════════════════════
          // Variante B : DROPDOWN (comportement historique — sections action)
          // ═════════════════════════════════════════════════════════════
          selDropdown = el('select', { class: 'ini-select ini-xbox-select' });
          const values = ['-1','A','B','X','Y','LSHOULDER','RSHOULDER','BACK','START',
                          'DPAD_UP','DPAD_DOWN','DPAD_LEFT','DPAD_RIGHT','LTHUMB','RTHUMB'];
          for (const v of values) {
            const meta = getMeta(v);
            const opt = el('option', { value: v, text: meta.icon + '  ' + meta.label });
            if (v === currentValue) opt.selected = true;
            selDropdown.appendChild(opt);
          }
          if (!values.includes(currentValue)) {
            const opt = el('option', { value: currentValue, text: currentValue });
            opt.selected = true;
            selDropdown.appendChild(opt);
          }
          selDropdown.addEventListener('change', () => {
            currentValue = selDropdown.value;
            updateDisplay();
            if (opts.onChange) opts.onChange(currentValue);
          });

          updateDisplay();

          // Layout : [Display] [Capter] [Dropdown]
          const wrap = el('div', { class: 'ini-xbox-wrap' }, [display, captureBtn, selDropdown]);

          controlEl = wrap;
          getValue = () => currentValue;
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
    // ⭐ v1.6.2 — Stoppe aussi la capture HID en arrière-plan pour éviter les fuites
    if (global.GamepadHidCapture) {
      global.GamepadHidCapture.stop();
    }
  }

  const API = { createIniControl, stopAllLives };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.IniControls = API;
})(typeof window !== 'undefined' ? window : globalThis);