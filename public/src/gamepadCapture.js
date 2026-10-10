// public/src/gamepadCapture.js
// Capture d'un appui ou d'un mouvement d'axe sur un gamepad (Chromium).
// Utilise setTimeout(30ms) au lieu de requestAnimationFrame pour éviter le throttling Electron.

(function (global) {
  'use strict';

  let rafId = null;
  let active = false;
  let prevButtons = [];
  let prevAxes    = [];
  let currentOpts = null;
  let timeoutHandle = null;

  let axisCaptureState = null;
  let initialAxes      = null;

  function snapshot() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const buttons = [];
    const axes = [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) { buttons.push(null); axes.push(null); continue; }
      buttons.push(pad.buttons.map(b => !!b.pressed));
      axes.push(pad.axes.slice());
    }
    return { buttons, axes };
  }

  function detectPress(prev, curr, axesThreshold) {
    for (let padIdx = 0; padIdx < curr.buttons.length; padIdx++) {
      const btns = curr.buttons[padIdx];
      const prevBtns = prev.buttons[padIdx];
      if (!btns) continue;
      for (let btnIdx = 0; btnIdx < btns.length; btnIdx++) {
        if (btns[btnIdx] && !(prevBtns ? prevBtns[btnIdx] : false)) {
          return { chromiumIndex: padIdx, buttonIndex: btnIdx, kind: 'button' };
        }
      }
    }
    if (axesThreshold > 0) {
      const hits = [];
      for (let padIdx = 0; padIdx < curr.axes.length; padIdx++) {
        const ax = curr.axes[padIdx];
        const prevAx = prev.axes[padIdx];
        if (!ax) continue;
        for (let axIdx = 0; axIdx < ax.length; axIdx++) {
          const v = ax[axIdx];
          const pv = prevAx ? prevAx[axIdx] : 0;
          if (Math.abs(v - pv) > 0.01) {
            hits.push({ chromiumIndex: padIdx, axisIndex: axIdx, value: v, prev: pv });
          }
        }
      }
      if (hits.length > 0) return { kind: 'axis-candidates', hits };
    }
    return null;
  }

  function isAxisBlacklisted(chromiumIndex, axisIndex) {
    if (!global.GamepadMapper || !global.GamepadMapper.isAxisBlocked) return false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[chromiumIndex];
    if (!pad) return false;
    const vp = global.GamepadMapper.parseChromiumGamepadId(pad.id);
    if (!vp) return false;
    return global.GamepadMapper.isAxisBlocked(vp.vendor, vp.product, axisIndex);
  }

  function tick() {
    if (!active) return;
    const curr = snapshot();
    const hit = detectPress(
      { buttons: prevButtons, axes: prevAxes },
      curr,
      currentOpts.axesThreshold || 0
    );
    prevButtons = curr.buttons;
    prevAxes    = curr.axes;

    // ---- Bouton : capture immédiate
    if (hit && hit.kind === 'button') {
      const acIndex = currentOpts.resolveAcIndex ? currentOpts.resolveAcIndex(hit.chromiumIndex) : null;
      const pad = navigator.getGamepads()[hit.chromiumIndex];
      stop();
      if (currentOpts.onCapture) {
        currentOpts.onCapture({ ...hit, acIndex, padId: pad ? pad.id : null });
      }
      return;
    }

    // ---- Axes : accumulation puis choix du gagnant
    if (hit && hit.kind === 'axis-candidates') {
      const now = Date.now();

      if (!axisCaptureState) {
        axisCaptureState = {
          start: now,
          gate:  now + 300,
          candidates: {},
          initialSnapshot: initialAxes ? JSON.parse(JSON.stringify(initialAxes)) : null,
        };
      }

      // Accumule les candidats (même avant la fin du gate)
      for (const h of hit.hits) {
        if (isAxisBlacklisted(h.chromiumIndex, h.axisIndex)) continue;

        const key = h.chromiumIndex + ':' + h.axisIndex;
        if (!axisCaptureState.candidates[key]) {
          const baseline =
            (axisCaptureState.initialSnapshot &&
             axisCaptureState.initialSnapshot[h.chromiumIndex] &&
             axisCaptureState.initialSnapshot[h.chromiumIndex][h.axisIndex] !== undefined)
              ? axisCaptureState.initialSnapshot[h.chromiumIndex][h.axisIndex]
              : h.prev;
          axisCaptureState.candidates[key] = {
            chromiumIndex: h.chromiumIndex,
            axisIndex:     h.axisIndex,
            baseline:      baseline,
            minVal:        h.value,
            maxVal:        h.value,
            extremeReached: false,
          };
        }
        const c = axisCaptureState.candidates[key];
        c.minVal = Math.min(c.minVal, h.value);
        c.maxVal = Math.max(c.maxVal, h.value);
        if (Math.abs(h.value) > 0.9) c.extremeReached = true;
      }

      // Bloque la décision tant que le gate de 300 ms n'est pas passé
      if (now < axisCaptureState.gate) {
        rafId = setTimeout(tick, 30);
        return;
      }

      // Gagnant : axe avec la plus grande plage, atteignant un extrême
      let winner = null;
      let bestRange = 0;
      for (const k of Object.keys(axisCaptureState.candidates)) {
        const c = axisCaptureState.candidates[k];
        if (Math.abs(c.baseline) > 1.05) continue;
        const range = c.maxVal - c.minVal;
        if (c.extremeReached && range > bestRange) {
          bestRange = range;
          winner = c;
        }
      }

      if (winner && bestRange > 0.5) {
        const acIndex = currentOpts.resolveAcIndex ? currentOpts.resolveAcIndex(winner.chromiumIndex) : null;
        const pad = navigator.getGamepads()[winner.chromiumIndex];
        axisCaptureState = null;
        stop();
        if (currentOpts.onCapture) {
          currentOpts.onCapture({
            kind:          'axis',
            chromiumIndex: winner.chromiumIndex,
            axisIndex:     winner.axisIndex,
            value:         bestRange,
            acIndex,
            padId:         pad ? pad.id : null,
          });
        }
        return;
      }

      // Timeout interne 5s
      if (now - axisCaptureState.start > 5000) {
        axisCaptureState = null;
      }
    }

    rafId = setTimeout(tick, 30);
  }

  function start(opts) {
    if (active) stop();
    currentOpts = Object.assign({
      axesThreshold:  0,
      timeoutMs:      10000,
      resolveAcIndex: null,
    }, opts || {});

    const init = snapshot();
    prevButtons  = init.buttons;
    prevAxes     = init.axes;
    initialAxes  = init.axes;
    axisCaptureState = null;

    active = true;
    rafId  = setTimeout(tick, 30);

    if (currentOpts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        stop();
        if (currentOpts.onCancel) currentOpts.onCancel('timeout');
      }, currentOpts.timeoutMs);
    }
  }

  function stop() {
    active = false;
    if (rafId)         { clearTimeout(rafId); rafId = null; }
    if (timeoutHandle) { clearTimeout(timeoutHandle);  timeoutHandle = null; }
    axisCaptureState = null;
  }

  function isCapturing() { return active; }

  const API = { start, stop, isCapturing };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.GamepadCapture = API;
})(typeof window !== 'undefined' ? window : globalThis);