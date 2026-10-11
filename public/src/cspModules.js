// public/src/cspModules.js
// Définition statique des modules CSP : catégories, labels FR, descriptions.

(function (global) {
  'use strict';

  const CATEGORIES = [
    { id: 'graphics',   label: '🎨 Graphismes & Rendu' },
    { id: 'camera',     label: '🎥 Caméra & Vue' },
    { id: 'interface',  label: '🖥️ Interface' },
    { id: 'simulation', label: '⚙️ Simulation & Gameplay' },
    { id: 'system',     label: '🔧 Système & Compat' },
  ];

  const MODULES = [
    // --------------------------------------------------------------
    // GRAPHISMES & RENDU
    // --------------------------------------------------------------
    { id: 'grass_fx',              label: 'Grass FX',              category: 'graphics', description: 'Herbe procédurale' },
    { id: 'lighting_fx',           label: 'Lighting FX',           category: 'graphics', description: 'Éclairage avancé', disableable: false },
    { id: 'particles_fx',          label: 'Particles FX',          category: 'graphics', description: 'Fumée, flammes, éclats' },
    { id: 'reflections_fx',        label: 'Reflections FX',        category: 'graphics', description: 'Reflets' },
    { id: 'extra_fx',              label: 'Extra FX',              category: 'graphics', description: 'Effets post-process (SSLR, TAA, AO…)' },
    { id: 'rain_fx',               label: 'Rain FX',               category: 'graphics', description: 'Pluie' },
    { id: 'skidmarks_fx',          label: 'Skidmarks FX',          category: 'graphics', description: 'Marques de pneus' },
    { id: 'tyres_fx',              label: 'Tyres FX',              category: 'graphics', description: 'Déformation des pneus' },
    { id: 'windscreen_fx',         label: 'Windscreen FX',         category: 'graphics', description: 'Effets pare-brise' },
    { id: 'smart_shadows',         label: 'Smart Shadows',         category: 'graphics', description: 'Ombres dynamiques' },
    { id: 'smart_mirror',          label: 'Smart Mirror',          category: 'graphics', description: 'Rétroviseurs haute qualité' },
    { id: 'graphics_adjustments',  label: 'Graphics Adjustments',  category: 'graphics', description: 'FSR/DLSS, LOD, MSAA', disableable: false },

    // --------------------------------------------------------------
    // CAMÉRA & VUE
    // --------------------------------------------------------------
    { id: 'neck',          label: 'Neck FX',          category: 'camera', description: 'Mouvement de tête' },
    { id: 'chaser_camera', label: 'Chaser Camera',    category: 'camera', description: 'Caméra poursuite améliorée' },
    { id: 'freer_camera',  label: 'Free Camera',      category: 'camera', description: 'Caméra libre' },

    // --------------------------------------------------------------
    // INTERFACE
    // --------------------------------------------------------------
    { id: 'gui',              label: 'GUI générale',        category: 'interface', description: 'Nouvelle interface' },
    { id: 'taskbar',          label: 'Taskbar',             category: 'interface', description: 'Barre des tâches' },
    { id: 'splashscreen',     label: 'Splashscreen',        category: 'interface', description: 'Écran de chargement' },
    { id: 'chat_shortcuts',   label: 'Chat Shortcuts',      category: 'interface', description: 'Raccourcis de chat' },
    { id: 'car_instruments',  label: 'Car Instruments',     category: 'interface', description: 'Instruments de voiture' },
    { id: 'nice_screenshots', label: 'Nice Screenshots',    category: 'interface', description: 'Screenshots améliorés' },
    { id: 'music',            label: 'Music',               category: 'interface', description: 'Musique in-game' },

    // --------------------------------------------------------------
    // SIMULATION & GAMEPLAY
    // --------------------------------------------------------------
    { id: 'new_behaviour',     label: 'New Behaviour (IA)',  category: 'simulation', description: 'IA améliorée' },
    { id: 'surfaces_fx',       label: 'Surfaces FX',         category: 'simulation', description: 'Physique hors-piste' },
    { id: 'track_adjustments', label: 'Track Adjustments',   category: 'simulation', description: 'Spectateurs, saisons' },
    { id: 'gamepad_fx',        label: 'Gamepad FX',          category: 'simulation', description: 'Effets manette' },
    { id: 'ffb_tweaks',        label: 'FFB Tweaks',          category: 'simulation', description: 'Force Feedback avancé' },
    { id: 'g27_lights',        label: 'G27 Lights',          category: 'simulation', description: 'LED Logitech G27' },

    // --------------------------------------------------------------
    // SYSTÈME & COMPAT
    // --------------------------------------------------------------
    { id: 'dxgi_tweaks',             label: 'DXGI Tweaks',            category: 'system', description: 'Tweaks DirectX' },
    { id: 'general',                 label: 'General',                category: 'system', description: 'Réglages généraux CSP' },
    { id: 'small_tweaks',            label: 'Small Tweaks',           category: 'system', description: 'Petits fixes' },
    { id: 'triple_custom',           label: 'Triple Custom',          category: 'system', description: 'Multi-écrans' },
    { id: 'vr_tweaks',               label: 'VR Tweaks',              category: 'system', description: 'Optimisations VR' },
    { id: 'custom_rendering_modes',  label: 'Custom Rendering Modes', category: 'system', description: 'Modes de rendu alternatifs' },
  ];

  function getCategories() { return CATEGORIES.slice(); }
  function getModules()    { return MODULES.slice(); }
  function getModulesByCategory(catId) {
    return MODULES.filter(m => m.category === catId);
  }
  function getModule(id) {
    return MODULES.find(m => m.id === id) || null;
  }

  const API = { getCategories, getModules, getModulesByCategory, getModule, CATEGORIES, MODULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.CspModules = API;
})(typeof window !== 'undefined' ? window : globalThis);