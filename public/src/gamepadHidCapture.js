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
      let lockedByte = -1; // ⭐ v1.6.2 : Mémorise l'octet de l'axe
      let lastLockedVal = 0; // ⭐ Anti-clignotement

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
        console.log("[HID] Périphériques HID autorisés :", devices.map(d => d.productName));

        // ⭐ v1.6.2 — Recherche générique : on cherche un device qui correspond (nom ou premier dispo)
        if (opts.deviceName) {
          device = devices.find(d => d.productName && d.productName.includes(opts.deviceName));
        }
        if (!device && devices.length > 0) {
          device = devices[0]; // Fallback : on prend le premier périphérique HID
        }

        // Si on n'a pas trouvé, on demande la permission (popup Electron)
        if (!device) {
          console.log("[HID] Aucun périphérique autorisé, demande de permission...");
          try {
            const req = await navigator.hid.requestDevice({ filters: [] }); // Filtre vide = tous les devices
            if (req.length > 0) device = req[0];
          } catch (e) {
            console.warn('[HID] Permission refusée', e);
          }
        }

        if (!device) {
          throw new Error("Aucun périphérique HID trouvé.");
        }

        console.log("[HID] Ouverture de :", device.productName);
        if (!device.opened) {
          await device.open();
        }
        console.log("[HID] Périphérique ouvert avec succès !");
        
        handler = (e) => {
          if (stopped) return;
          const data = new Uint8Array(e.data.buffer);
          
          // ⭐ LOGS DE DÉBOGAGE : Affiche les octets et l'ID du rapport
          if (opts.isTestMode && prevData) {
            let hasDiff = false;
            for (let i = 0; i < Math.min(data.length, prevData.length); i++) {
              if (data[i] !== prevData[i]) { hasDiff = true; break; }
            }
            if (hasDiff) {
              console.log(`[HID RAW] ReportID: ${e.reportId} | Length: ${data.length} | Data:`, Array.from(data));
            }
          }

          if (prevData && prevData.length === data.length) {
            // ─── MODE AXE (ODDOR, frein à main, pédalier DIY) ───
            if (opts.captureMode === 'axis') {
              if (opts.isTestMode) {
                // ⭐ ODDOR : Octet 0 = Position (0-255), Octet 1 = Tours (0-255)
                let tours = data[1];
                let position = data[0];
                
                // ⭐ Correction de la table : l'encodeur saute de 2 à 6 (il perd 4 tours = 1024)
                // On compense en retirant 1024 pour retrouver une échelle linéaire de 0 à 1023.
                let valAbsolue = (tours * 256) + position;
                if (tours >= 6) {
                  valAbsolue -= 1024; 
                }

                if (opts.onLiveData) opts.onLiveData(valAbsolue, 1);
              } else {
                // Mode normal (capture unique)
                let maxDiff = 0;
                let bestByte = -1;
                let currentVal = 0;

                for (let byteIdx = 0; byteIdx < data.length; byteIdx++) {
                  const diff = Math.abs(data[byteIdx] - prevData[byteIdx]);
                  if (diff > maxDiff) {
                    maxDiff = diff;
                    bestByte = byteIdx;
                    currentVal = data[byteIdx];
                  }
                }

                if (maxDiff > 20) {
                  if (opts.onLiveData) opts.onLiveData(currentVal, bestByte);
                  if (opts.onCapture) {
                    stop();
                    opts.onCapture({ byteIndex: bestByte, value: currentVal, device });
                    resolve({ byteIndex: bestByte, value: currentVal, device });
                    return;
                  }
                }
              }
            } 
            // ─── MODE BOUTON (SparkFun) ───
            else {
              for (let byteIdx = 0; byteIdx < data.length; byteIdx++) {
                const changed = data[byteIdx] & ~prevData[byteIdx];
                if (changed) {
                  for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
                    if (changed & (1 << bitIdx)) {
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
          }
          prevData = data.slice();
        };
        
        device.addEventListener('inputreport', handler);
        console.log("[HID] En attente de mouvement...");
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