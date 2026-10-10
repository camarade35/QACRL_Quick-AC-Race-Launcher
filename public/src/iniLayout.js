// public/src/iniLayout.js
// Structure d'organisation des onglets du formulaire INI.
// Chaque onglet contient une liste de "groupes" :
//   - type 'single' → une seule section
//   - type 'pair'   → 2 sections côte à côte (ex : ↑ et ↓)
// Les sections non listées tombent automatiquement dans l'onglet "Avancé".

(function (global) {
  'use strict';

  const LAYOUT = {

    // =========================================================================
    // controls.ini
    // =========================================================================
    'controls.ini': {
      defaultTab: 'axes',
      tabs: [

        // ---------------------------------------------------------------------
        // 🎯 AXES
        // ---------------------------------------------------------------------
        {
          id: 'axes',
          label: '🎯 Axes',
          groups: [
            { type: 'single', section: 'STEER',     label: 'Direction' },
            { type: 'single', section: 'THROTTLE',  label: 'Accélérateur' },
            { type: 'single', section: 'BRAKES',    label: 'Freins' },
            { type: 'single', section: 'CLUTCH',    label: 'Embrayage' },
            { type: 'single', section: 'HANDBRAKE', label: 'Frein à main' },
          ]
        },

        // ---------------------------------------------------------------------
        // 🎮 BOUTONS
        // ---------------------------------------------------------------------
        {
          id: 'buttons',
          label: '🎮 Boutons',
          groups: [
            { type: 'pair', label: 'Passage de vitesse',
              sections: [
                { section: 'GEARUP', label: '↑ Monter' },
                { section: 'GEARDN', label: '↓ Descendre' }
              ]
            },
            { type: 'single', section: 'SHIFTER',      label: 'Levier de vitesses (H-shifter)' },

            { type: 'pair', label: 'Répartition du freinage',
              sections: [
                { section: 'BALANCEUP', label: '↑ Avant' },
                { section: 'BALANCEDN', label: '↓ Arrière' }
              ]
            },
            { type: 'pair', label: 'Contrôle de traction (TC)',
              sections: [
                { section: 'TCUP', label: '↑ Augmenter' },
                { section: 'TCDN', label: '↓ Diminuer' }
              ]
            },
            { type: 'pair', label: 'ABS',
              sections: [
                { section: 'ABSUP', label: '↑ Augmenter' },
                { section: 'ABSDN', label: '↓ Diminuer' }
              ]
            },
            { type: 'pair', label: 'MGU-K — Puissance (delivery)',
              sections: [
                { section: 'MGUK_DELIVERY_UP', label: '↑ Augmenter' },
                { section: 'MGUK_DELIVERY_DN', label: '↓ Réduire' }
              ]
            },
            { type: 'pair', label: 'MGU-K — Récupération (recovery)',
              sections: [
                { section: 'MGUK_RECOVERY_UP', label: '↑ Augmenter' },
                { section: 'MGUK_RECOVERY_DN', label: '↓ Réduire' }
              ]
            },
            { type: 'single', section: 'MGUH_MODE', label: 'MGU-H — Mode' },

            { type: 'pair', label: 'Turbo',
              sections: [
                { section: 'TURBOUP', label: '↑ Augmenter' },
                { section: 'TURBODN', label: '↓ Diminuer' }
              ]
            },
            { type: 'pair', label: 'Frein moteur',
              sections: [
                { section: 'ENGINE_BRAKE_UP', label: '↑ Augmenter' },
                { section: 'ENGINE_BRAKE_DN', label: '↓ Diminuer' }
              ]
            },

            { type: 'single', section: 'KERS',                  label: 'Activation KERS' },
            { type: 'single', section: 'DRS',                   label: 'Activation DRS' },
            { type: 'single', section: 'ACTION_HEADLIGHTS',     label: 'Phares' },
            { type: 'single', section: 'ACTION_HEADLIGHTS_FLASH', label: 'Appel de phares' },
            { type: 'single', section: 'ACTION_HORN',           label: 'Klaxon' },
            { type: 'single', section: 'ACTION_CHANGE_CAMERA',  label: 'Changer de caméra' },

            { type: 'pair', label: 'Regarder autour',
              sections: [
                { section: 'GLANCELEFT',  label: '← Gauche' },
                { section: 'GLANCERIGHT', label: '→ Droite' }
              ]
            },
            { type: 'single', section: 'GLANCEBACK',           label: 'Regarder derrière' },

            { type: 'single', section: 'STARTER',              label: 'Démarreur' },
            { type: 'single', section: 'REV',                  label: 'Marche arrière' },
            { type: 'single', section: 'ACTIVATE_AI',          label: 'Activer l\'IA' },
            { type: 'single', section: 'AUTO_SHIFTER',         label: 'Boîte automatique' },
            { type: 'single', section: 'TRACTION_CONTROL',     label: 'Contrôle de traction' },

            { type: 'pair', label: 'En ligne — Célébration & Claim',
              sections: [
                { section: 'ACTION_CELEBRATE', label: 'Célébrer' },
                { section: 'ACTION_CLAIM',     label: 'Claim' }
              ]
            },
          ]
        },

        // ---------------------------------------------------------------------
        // 🖥️ SYSTÈME
        // ---------------------------------------------------------------------
        {
          id: 'system',
          label: '🖥️ Système',
          groups: [
            { type: 'pair', label: 'Replay — Lecture',
              sections: [
                { section: 'START_REPLAY', label: '▶ Démarrer' },
                { section: 'PAUSE_REPLAY', label: '⏸ Pause' }
              ]
            },
            { type: 'pair', label: 'Replay — Vitesse',
              sections: [
                { section: 'FFWD',    label: '⏩ Avance rapide' },
                { section: 'SLOWMO',  label: '⏪ Ralenti' }
              ]
            },
            { type: 'pair', label: 'Replay — Navigation tours',
              sections: [
                { section: 'NEXT_LAP',     label: '→ Tour suivant' },
                { section: 'PREVIOUS_LAP', label: '← Tour précédent' }
              ]
            },

            { type: 'pair', label: 'Caméra — Voiture',
              sections: [
                { section: 'NEXT_CAR',     label: '→ Voiture suivante' },
                { section: 'PREVIOUS_CAR', label: '← Voiture précédente' }
              ]
            },
            { type: 'single', section: 'PLAYER_CAR', label: 'Revenir à ma voiture' },

            { type: 'pair', label: 'Affichage',
              sections: [
                { section: 'HIDE_APPS', label: 'Cacher les apps' },
                { section: 'HIDE_DAMAGE', label: 'Cacher les dégâts' }
              ]
            },
            { type: 'single', section: 'SHOW_DAMAGE', label: 'Afficher les dégâts' },
            { type: 'single', section: 'IDEAL_LINE',  label: 'Ligne idéale' },
            { type: 'single', section: 'DRIVER_NAMES', label: 'Noms des pilotes' },

            { type: 'single', section: 'MOUSE_STEERING', label: 'Direction à la souris' },
            { type: 'single', section: 'RESET_RACE',     label: 'Réinitialiser la course' },
          ]
        },

        // ---------------------------------------------------------------------
        // 🎢 FORCE FEEDBACK
        // ---------------------------------------------------------------------
        {
          id: 'ffb',
          label: '🎢 Force Feedback',
          groups: [
            { type: 'single', section: 'FF_ENHANCEMENT',   label: 'Effets (ABS / Bordures / Route / Dérapages)' },
            { type: 'single', section: 'FF_ENHANCEMENT_2', label: 'Sous-virage' },
            { type: 'single', section: 'FF_TWEAKS',        label: 'Réglages fins (centrage, FF minimum)' },
            { type: 'single', section: 'FF_SKIP_STEPS',    label: 'Étapes FFB ignorées' },
          ]
        },

        // ---------------------------------------------------------------------
        // ⚙️ AVANCÉ (contient aussi les orphelines en fallback)
        // ---------------------------------------------------------------------
        {
          id: 'advanced',
          label: '⚙️ Avancé',
          isFallback: true,  // les sections orphelines viennent ici
          groups: [
            { type: 'single', section: 'HEADER',       label: 'Méthode de commande' },
            { type: 'single', section: 'ADVANCED',     label: 'Options avancées' },
            { type: 'single', section: 'KEYBOARD',     label: 'Réglages clavier' },
            { type: 'single', section: 'X360',         label: 'Manette Xbox 360' },
            { type: 'single', section: 'CONTROLLERS',  label: 'Périphériques détectés (lecture seule)' },
          ]
        },
      ]
    },

    // =========================================================================
    // video.ini — un seul onglet, tout à plat
    // =========================================================================
    'video.ini': {
      defaultTab: 'main',
      tabs: [
        {
          id: 'main',
          label: '🖥️ Affichage',
          groups: []  // vide → tous les groupes sont auto-générés depuis le fichier
        }
      ]
    },

    // =========================================================================
    // audio.ini — un seul onglet, tout à plat
    // =========================================================================
    'audio.ini': {
      defaultTab: 'main',
      tabs: [
        {
          id: 'main',
          label: '🔊 Audio',
          groups: []
        }
      ]
    }
  };

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  /**
   * Récupère la config de layout pour un fichier INI donné.
   * Renvoie null si inconnu.
   */
  function getLayout(filename) {
    return LAYOUT[filename] || null;
  }

  /**
   * Récupère l'onglet qui contient une section donnée.
   * Renvoie l'id de l'onglet (ou 'advanced' si orpheline pour controls.ini).
   */
  function getTabForSection(filename, sectionName) {
    const layout = LAYOUT[filename];
    if (!layout) return null;

    for (const tab of layout.tabs) {
      for (const group of tab.groups) {
        if (group.type === 'single' && group.section === sectionName) return tab.id;
        if (group.type === 'pair') {
          for (const s of group.sections) {
            if (s.section === sectionName) return tab.id;
          }
        }
      }
    }

    // Section orpheline : on la met dans le fallback si dispo, sinon advanced
    for (const tab of layout.tabs) {
      if (tab.isFallback) return tab.id;
    }
    return layout.tabs[0] ? layout.tabs[0].id : null;
  }

  const API = { getLayout, getTabForSection, LAYOUT };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.IniLayout = API;
})(typeof window !== 'undefined' ? window : globalThis);