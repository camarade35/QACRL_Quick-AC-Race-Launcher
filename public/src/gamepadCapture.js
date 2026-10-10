// public/src/gamepadCapture.js
// Capture d'un appui sur un gamepad (Chromium) via polling requestAnimationFrame.

(function (global) {
  'use strict';

  let rafId = null;
  let active = false;
  let prevButtons = [];
  let prevAxes    = [];
  let currentOpts = null;
  let timeoutHandle = null;

  let axisCaptureState = null;  // { start, candidates: { 'padIdx:axIdx': {...} } }
  let initialAxes      = null;  // baseline des axes au démarrage

  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  function detectPress(prev, curr, axesThreshold) {
    // 1) Boutons (priorité)
    for (let padIdx = 0; padIdx < curr.buttons.length; padIdx++) {
      const btns = curr.buttons[padIdx];
      const prevBtns = prev.buttons[padIdx];
      if (!btns) continue;
      for (let btnIdx = 0; btnIdx < btns.length; btnIdx++) {
        const isPressed = btns[btnIdx];
        const wasPressed = prevBtns ? prevBtns[btnIdx] : false;
        if (isPressed && !wasPressed) {
          return { chromiumIndex: padIdx, buttonIndex: btnIdx, kind: 'button' };
        }
      }
    }
    // 2) Axes — liste des axes qui bougent
    if (axesThreshold > 0) {
      const hits = [];
      for (let padIdx = 0; padIdx < curr.axes.length; padIdx++) {
        const ax = curr.axes[padIdx];
        const prevAx = prev.axes[padIdx];
        if (!ax) continue;
        for (let axIdx = 0; axIdx < ax.length; axIdx++) {
          const v = ax[axIdx];
          const pv = prevAx ? prevAx[axIdx] : 0;
          if (Math.abs(v - pv) > 0.05) {
            hits.push({ chromiumIndex: padIdx, axisIndex: axIdx, value: v, prev: pv });
          }
        }
      }
      if (hits.length > 0) return { kind: 'axis-candidates', hits };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Helper : vérifie si un axe est blacklisté pour ce device (D-pad, hat…)
  // ---------------------------------------------------------------------------
  function isAxisBlacklisted(chromiumIndex, axisIndex) {
    if (!global.GamepadMapper || !global.GamepadMapper.isAxisBlocked) return false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[chromiumIndex];
    if (!pad) return false;
    const vp = global.GamepadMapper.parseChromiumGamepadId(pad.id);
    if (!vp) return false;
    return global.GamepadMapper.isAxisBlocked(vp.vendor, vp.product, axisIndex);
  }

  // ---------------------------------------------------------------------------
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

    // ---- Axes : accumule les candidats puis choisit le meilleur
    if (hit && hit.kind === 'axis-candidates') {
      const now = Date.now();
      if (!axisCaptureState) axisCaptureState = { start: now, candidates: {} };

      for (const h of hit.hits) {
        // ⛔ ignore les axes blacklistés (D-pad, hat switch…)
        if (isAxisBlacklisted(h.chromiumIndex, h.axisIndex)) continue;

        const key = h.chromiumIndex + ':' + h.axisIndex;
        if (!axisCaptureState.candidates[key]) {
          const baseline =
            (initialAxes && initialAxes[h.chromiumIndex] &&
             initialAxes[h.chromiumIndex][h.axisIndex] !== undefined)
              ? initialAxes[h.chromiumIndex][h.axisIndex]
              : h.prev;
          axisCaptureState.candidates[key] = {
            chromiumIndex: h.chromiumIndex,
            axisIndex:     h.axisIndex,
            baseline:      baseline,
            amplitude:     0,
          };
        }
        const c = axisCaptureState.candidates[key];
        c.amplitude = Math.max(c.amplitude, Math.abs(h.value - c.baseline));
      }

      // Cherche l'axe avec la plus grande amplitude (en ignorant les hat)
      let best = null;
      for (const k of Object.keys(axisCaptureState.candidates)) {
        const c = axisCaptureState.candidates[k];
        if (Math.abs(c.baseline) > 1.05) continue;
        if (!best || c.amplitude > best.amplitude) best = c;
      }

      // Dès qu'un axe a bougé de > 0.7, on capture
      if (best && best.amplitude > 0.7) {
        const acIndex = currentOpts.resolveAcIndex ? currentOpts.resolveAcIndex(best.chromiumIndex) : null;
        const pad = navigator.getGamepads()[best.chromiumIndex];
        axisCaptureState = null;
        stop();
        if (currentOpts.onCapture) {
          currentOpts.onCapture({
            kind:          'axis',
            chromiumIndex: best.chromiumIndex,
            axisIndex:     best.axisIndex,
            value:         best.amplitude,
            acIndex,
            padId:         pad ? pad.id : null,
          });
        }
        return;
      }

      // Timeout dur à 5s : rien de convaincant → reset et on continue
      if (now - axisCaptureState.start > 5000) {
        axisCaptureState = null;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
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
    rafId  = requestAnimationFrame(tick);

    if (currentOpts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        stop();
        if (currentOpts.onCancel) currentOpts.onCancel('timeout');
      }, currentOpts.timeoutMs);
    }
  }

  function stop() {
    active = false;
    if (rafId)         { cancelAnimationFrame(rafId); rafId = null; }
    if (timeoutHandle) { clearTimeout(timeoutHandle);  timeoutHandle = null; }
    axisCaptureState = null;
  }

  function isCapturing() { return active; }

  const API = { start, stop, isCapturing };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.GamepadCapture = API;
})(typeof window !== 'undefined' ? window : globalThis);