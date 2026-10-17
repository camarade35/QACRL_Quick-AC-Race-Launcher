// public/src/gamepadHidCapture.js
(function (global) {
  'use strict';

  let currentCapture = null;

  function startHidCapture(opts) {
    return new Promise(async (resolve, reject) => {
      let stopped = false;
      let device = null;
      let handler = null;
      let prevData = null;
      let timeoutId = null;

      const stop = () => {
        stopped = true;
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (device && handler) {
          try { device.removeEventListener('inputreport', handler); } catch (e) {}
        }
        if (currentCapture === stop) currentCapture = null;
      };

      currentCapture = stop;

      if (opts.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (opts.onCancel) opts.onCancel('timeout');
          stop();
          reject(new Error('Timeout'));
        }, opts.timeoutMs);
      }

      try {
        console.log("[HID] Début de la capture HID...");
        if (!navigator.hid) {
          throw new Error("WebHID non supporté");
        }

        let devices = await navigator.hid.getDevices();
        console.log("[HID] Périphériques HID déjà autorisés :", devices.map(d => d.productName));

        // On cherche le SparkFun (VID 0x1b4f, PID 0x9206)
        device = devices.find(d => d.vendorId === 0x1b4f && d.productId === 0x9206);

        if (!device) {
          console.log("[HID] SparkFun non autorisé, demande de permission...");
          try {
            const req = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1b4f }] });
            if (req.length > 0) device = req[0];
          } catch (e) {
            console.warn('[HID] Permission refusée', e);
          }
        }

        if (!device) {
          throw new Error("Aucun SparkFun trouvé (ni autorisé, ni sélectionné)");
        }

        console.log("[HID] Tentative d'ouverture du périphérique :", device.productName);
        if (!device.opened) {
          await device.open();
        }
        console.log("[HID] Périphérique ouvert avec succès !");
        
        handler = (e) => {
          if (stopped) return;
          const data = new Uint8Array(e.data.buffer);
          
          if (prevData && prevData.length === data.length) {
            for (let byteIdx = 0; byteIdx < data.length; byteIdx++) {
              const changed = data[byteIdx] & ~prevData[byteIdx];
              if (changed) {
                for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
                  if (changed & (1 << bitIdx)) {
                    // Numéro de bouton calculé basiquement (byte * 8 + bit)
                    const buttonIndex = byteIdx * 8 + bitIdx;
                    
                    console.log("[HID] Appui détecté ! Bouton brut :", buttonIndex);
                    stop();
                    if (opts.onCapture) opts.onCapture({ buttonIndex, device });
                    resolve({ buttonIndex, device });
                    return;
                  }
                }
              }
            }
          }
          prevData = data.slice();
        };
        
        device.addEventListener('inputreport', handler);
        console.log("[HID] En attente d'appui sur un bouton...");
      } catch (err) {
        console.error("[HID] Erreur :", err.message);
        stop();
        if (opts.onCancel) opts.onCancel(err.message);
        reject(err);
      }
    });
  }

  global.GamepadHidCapture = { 
    start: startHidCapture, 
    stop: () => { if (currentCapture) currentCapture(); } 
  };
})(window);