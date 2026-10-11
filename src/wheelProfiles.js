// src/wheelProfiles.js
// Gestion des profils de volants : mapping Chromium → AC par device.
// Stocké dans %APPDATA%\qacrl_quick_ac_race_launcher\wheel-profiles.json

const fs = require('fs');
const path = require('path');

function createManager(userDataPath) {
  const filePath = path.join(userDataPath, 'wheel-profiles.json');

  function readAll() {
    try {
      if (!fs.existsSync(filePath)) return {};
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return (data && typeof data === 'object') ? data : {};
    } catch (e) {
      console.error('[wheelProfiles] lecture KO:', e.message);
      return {};
    }
  }

  function writeAll(data) {
    try {
      // Écriture atomique
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
      return true;
    } catch (e) {
      console.error('[wheelProfiles] écriture KO:', e.message);
      return false;
    }
  }

  /**
   * Récupère le profil d'un device (clé "vendor:product").
   * Retourne null si aucun profil.
   */
  function getProfile(vendor, product) {
    if (!vendor || !product) return null;
    const key = (vendor + ':' + product).toLowerCase();
    const all = readAll();
    return all[key] || null;
  }

  /**
   * Sauvegarde le profil complet d'un device.
   * data : { axes: { '0': 0, '1': 6, ... }, source: 'wizard'|'controls', learnedAt: Date.now() }
   */
  function saveProfile(vendor, product, data) {
    if (!vendor || !product) return { success: false, error: 'vendor/product manquant' };
    const key = (vendor + ':' + product).toLowerCase();
    const all = readAll();
    all[key] = Object.assign({}, data, {
      learnedAt: Date.now(),
      vendor: vendor.toLowerCase(),
      product: product.toLowerCase(),
    });
    const ok = writeAll(all);
    return { success: ok, key };
  }

  /**
   * Fusionne un mapping partiel dans le profil existant.
   * axes : { '0': 0, '2': 1, ... }
   */
  function mergeAxisMapping(vendor, product, axes, source) {
    if (!vendor || !product) return { success: false, error: 'vendor/product manquant' };
    const key = (vendor + ':' + product).toLowerCase();
    const all = readAll();
    const existing = all[key] || { axes: {} };
    if (!existing.axes) existing.axes = {};
    for (const k of Object.keys(axes)) {
      existing.axes[k] = axes[k];
    }
    existing.source = source || existing.source || 'partial';
    existing.learnedAt = Date.now();
    existing.vendor = vendor.toLowerCase();
    existing.product = product.toLowerCase();
    all[key] = existing;
    const ok = writeAll(all);
    return { success: ok, profile: existing };
  }

  function deleteProfile(vendor, product) {
    if (!vendor || !product) return false;
    const key = (vendor + ':' + product).toLowerCase();
    const all = readAll();
    if (!all[key]) return true;
    delete all[key];
    return writeAll(all);
  }

  function getAllProfiles() {
    return readAll();
  }

  return { getProfile, saveProfile, mergeAxisMapping, deleteProfile, getAllProfiles, _filePath: filePath };
}

module.exports = { createManager };