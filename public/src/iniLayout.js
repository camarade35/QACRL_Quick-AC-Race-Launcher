// public/src/iniLayout.js
// Structure d'organisation des onglets du formulaire INI.

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
        // 🎮 BOUTONS — organisés par catégories
        // ---------------------------------------------------------------------
        {
          id: 'buttons',
          label: '🎮 Boutons',
          groups: [

            // ═══════════════════════════════════════════════════════════════
            // ⚙️ Boîte & Vitesses
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '⚙️ Boîte & Vitesses',
              groups: [
                { type: 'pair', label: 'Passage de vitesse',
                  sections: [
                    { section: 'GEARUP', label: '↑ Monter' },
                    { section: 'GEARDN', label: '↓ Descendre' }
                  ]
                },
                { type: 'single', section: 'SHIFTER', label: 'Levier de vitesses (H-shifter)' },
                { type: 'pair', label: 'Marche arrière / Boîte automatique',
                  sections: [
                    { section: 'REV',           label: 'Marche arrière' },
                    { section: 'AUTO_SHIFTER',  label: 'Boîte automatique' }
                  ]
                },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 🎛️ Réglages en course
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🎛️ Réglages en course',
              groups: [
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
                { type: 'single', section: 'ABS', label: 'ABS (activer / désactiver)' },
                { type: 'pair', label: 'ABS — Réglage fin',
                  sections: [
                    { section: 'ABSUP', label: '↑ Augmenter' },
                    { section: 'ABSDN', label: '↓ Diminuer' }
                  ]
                },
                { type: 'pair', label: 'Force Feedback (en course)',
                  sections: [
                    { section: '__EXT_FFB_INCREASE', label: '↑ Augmenter' },
                    { section: '__EXT_FFB_DECREASE', label: '↓ Diminuer' }
                  ]
                },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 💡 Lumières & Signalisation
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🚗 Commandes de base',
              groups: [
                { type: 'single', section: '__EXT_STARTER', label: 'Démarreur' },
                { type: 'pair', label: 'Phares / Appel de phares',
                  sections: [
                    { section: 'ACTION_HEADLIGHTS',       label: 'Phares' },
                    { section: 'ACTION_HEADLIGHTS_FLASH', label: 'Appel de phares' }
                  ]
                },
                { type: 'single', section: '__EXT_LOW_BEAM', label: 'Feux de croisement (pluie)' },
                { type: 'single', section: '__EXT_HAZARDS',  label: 'Feux de détresse' },
                { type: 'pair', label: 'Clignotants',
                  sections: [
                    { section: '__EXT_TURNSIGNAL_LEFT',  label: '← Gauche' },
                    { section: '__EXT_TURNSIGNAL_RIGHT', label: '→ Droite' }
                  ]
                },
                { type: 'single', section: '__EXT_TURNSIGNAL_CANCEL', label: 'Annuler clignotants' },
                { type: 'single', section: 'ACTION_HORN', label: 'Klaxon' },
                { type: 'pair', label: 'Essuie-glaces',
                  sections: [
                    { section: '__EXT_WIPERS_MORE', label: '+ Plus vite' },
                    { section: '__EXT_WIPERS_LESS', label: '− Moins vite' }
                  ]
                },
                { type: 'single', section: '__EXT_WIPERS_OFF', label: 'Essuie-glaces OFF' },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 📷 Caméras & Vues
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '📷 Caméras & Vues',
              groups: [
                { type: 'single', section: 'ACTION_CHANGE_CAMERA', label: 'Changer de caméra' },
                { type: 'pair', label: 'Regarder autour',
                  sections: [
                    { section: 'GLANCELEFT',  label: '← Gauche' },
                    { section: 'GLANCERIGHT', label: '→ Droite' }
                  ]
                },
                { type: 'single', section: 'GLANCEBACK', label: 'Regarder derrière' },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // ⚡ Énergie & Boost
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '⚡ Énergie & Boost',
              groups: [
                { type: 'single', section: 'KERS', label: 'Activation KERS' },
                { type: 'single', section: 'DRS',  label: 'Activation DRS' },
                { type: 'single', section: 'MGUH_MODE', label: 'MGU-H — Mode' },
                { type: 'pair', label: 'MGU-K — Puissance',
                  sections: [
                    { section: 'MGUK_DELIVERY_UP', label: '↑ Augmenter' },
                    { section: 'MGUK_DELIVERY_DN', label: '↓ Réduire' }
                  ]
                },
                { type: 'pair', label: 'MGU-K — Récupération',
                  sections: [
                    { section: 'MGUK_RECOVERY_UP', label: '↑ Augmenter' },
                    { section: 'MGUK_RECOVERY_DN', label: '↓ Réduire' }
                  ]
                },
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
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 🔧 Divers
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🔧 Divers',
              groups: [
                { type: 'single', section: 'TRACTION_CONTROL', label: 'Contrôle de traction' },
                { type: 'single', section: 'ACTIVATE_AI',      label: 'Activer l\'IA' },
                { type: 'pair', label: 'En ligne — Célébration & Claim',
                  sections: [
                    { section: 'ACTION_CELEBRATE', label: 'Célébrer' },
                    { section: 'ACTION_CLAIM',     label: 'Claim' }
                  ]
                },
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

            // ═══════════════════════════════════════════════════════════════
            // 🎬 Replay
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🎬 Replay',
              groups: [
                { type: 'pair', label: 'Replay — Lecture',
                  sections: [
                    { section: 'START_REPLAY', label: '▶ Démarrer' },
                    { section: 'PAUSE_REPLAY', label: '⏸ Pause' }
                  ]
                },
                { type: 'pair', label: 'Replay — Vitesse',
                  sections: [
                    { section: 'FFWD',   label: '⏩ Avance rapide' },
                    { section: 'SLOWMO', label: '⏪ Ralenti' }
                  ]
                },
                { type: 'pair', label: 'Replay — Navigation tours',
                  sections: [
                    { section: 'NEXT_LAP',     label: '→ Tour suivant' },
                    { section: 'PREVIOUS_LAP', label: '← Tour précédent' }
                  ]
                },
                { type: 'pair', label: 'Replay — Navigation voitures',
                  sections: [
                    { section: 'NEXT_CAR',     label: '→ Voiture suivante' },
                    { section: 'PREVIOUS_CAR', label: '← Voiture précédente' }
                  ]
                },
                { type: 'single', section: 'PLAYER_CAR', label: 'Revenir à ma voiture' },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 🖥️ Affichage & Interface
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🖥️ Affichage & Interface',
              groups: [
                { type: 'pair', label: 'Affichage',
                  sections: [
                    { section: 'HIDE_APPS',   label: 'Cacher les apps' },
                    { section: 'HIDE_DAMAGE', label: 'Cacher les dégâts' }
                  ]
                },
                { type: 'single', section: 'SHOW_DAMAGE',  label: 'Afficher les dégâts' },
                { type: 'single', section: 'IDEAL_LINE',   label: 'Ligne idéale' },
                { type: 'single', section: 'DRIVER_NAMES', label: 'Noms des pilotes' },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 🔧 Divers
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🔧 Divers',
              groups: [
                { type: 'single', section: 'MOUSE_STEERING', label: 'Direction à la souris' },
                { type: 'single', section: 'RESET_RACE',     label: 'Réinitialiser la course' },
              ]
            },
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
        // ⚙️ AVANCÉ
        // ---------------------------------------------------------------------
        {
          id: 'advanced',
          label: '⚙️ Avancé',
          isFallback: true,
          groups: [

            // ═══════════════════════════════════════════════════════════════
            // 🎮 Périphériques
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🎮 Périphériques',
              groups: [
                { type: 'single', section: 'HEADER',      label: 'Méthode de commande' },
                { type: 'single', section: 'X360',        label: 'Manette Xbox 360' },
                { type: 'single', section: 'CONTROLLERS', label: 'Périphériques détectés (lecture seule)' },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // ⌨️ Clavier
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '⌨️ Clavier',
              groups: [
                { type: 'single', section: 'KEYBOARD', label: 'Réglages clavier' },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 🔧 Divers
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🔧 Divers',
              groups: [
                { type: 'single', section: 'ADVANCED', label: 'Options avancées' },
              ]
            },

            // ═══════════════════════════════════════════════════════════════
            // 🗑️ Sections obsolètes (hors H-shifter)
            // ═══════════════════════════════════════════════════════════════
            {
              type: 'category',
              label: '🗑️ Sections obsolètes',
              hint: 'Non utilisées par AC sur les versions récentes',
              groups: [
                { type: 'single', section: 'STARTER', label: 'Démarreur (obsolète)' },
                { type: 'single', section: 'GEAR_1', label: 'Rapport 1 (obsolète)' },
                { type: 'single', section: 'GEAR_2', label: 'Rapport 2 (obsolète)' },
                { type: 'single', section: 'GEAR_3', label: 'Rapport 3 (obsolète)' },
                { type: 'single', section: 'GEAR_4', label: 'Rapport 4 (obsolète)' },
                { type: 'single', section: 'GEAR_5', label: 'Rapport 5 (obsolète)' },
                { type: 'single', section: 'GEAR_6', label: 'Rapport 6 (obsolète)' },
                { type: 'single', section: 'GEAR_7', label: 'Rapport 7 (obsolète)' },
                { type: 'single', section: 'GEAR_R', label: 'Marche arrière (obsolète)' },
              ]
            },
          ]
        },
      ]
    },

    // =========================================================================
    // video.ini
    // =========================================================================
    'video.ini': {
      defaultTab: 'main',
      tabs: [
        {
          id: 'main',
          label: '🖥️ Affichage',
          groups: [
            {
              type: 'category',
              label: '🖼️ Affichage',
              groups: [
                { type: 'single', section: 'VIDEO',    label: 'Affichage' },
                { type: 'single', section: 'REFRESH',  label: 'Fréquence de rafraîchissement' },
                { type: 'single', section: 'CAMERA',   label: 'Caméra' },
              ]
            },
            {
              type: 'category',
              label: '🎨 Effets & Qualité',
              groups: [
                { type: 'single', section: 'POST_PROCESS', label: 'Post-traitement' },
                { type: 'single', section: 'SATURATION',   label: 'Saturation' },
                { type: 'single', section: 'EFFECTS',      label: 'Effets' },
                { type: 'single', section: 'MIRROR',       label: 'Rétroviseurs' },
                { type: 'single', section: 'CUBEMAP',      label: 'Cubemap' },
              ]
            },
            {
              type: 'category',
              label: '🚗 Visuel in-game',
              groups: [
                { type: 'single', section: 'ASSETTOCORSA', label: 'Réglages AC' },
              ]
            },
          ]
        }
      ]
    },

    // =========================================================================
    // audio.ini
    // =========================================================================
    'audio.ini': {
      defaultTab: 'main',
      tabs: [{ id: 'main', label: '🔊 Audio', groups: [] }]
    }
  };

  // =========================================================================
  // ⭐ v1.6.0 — Layouts ALTERNATIFS selon INPUT_METHOD
  // -------------------------------------------------------------------------
  // Le layout principal (LAYOUT ci-dessus) reste celui de WHEEL, INCHANGÉ.
  //
  // Notes issues des fichiers de référence AC :
  //   - X360Default.ini → mode manette. AXE sur [THROTTLE]/[BRAKES], XBOXBUTTON
  //     sur les actions (boîte, caméra...). PAS de XBOXBUTTON dans les pédales.
  //   - Default.ini → mode clavier. KEY=0xXX sur les sections boutons +
  //     [KEYBOARD] pour les touches de conduite.
  //
  // ⭐ v1.6.0-4A — Enrichissement complet :
  //   - X360 : 7 catégories (Direction / Périphériques / Pédales / Boîte /
  //            Caméras / Signalisation & Énergie / Système)
  //   - KEYBOARD : 5 catégories (Conduite / Souris / Boîte / Caméras /
  //                Signalisation / Système)
  // =========================================================================
  const ALT_LAYOUTS = {
    'controls.ini': {

      // ---------------------------------------------------------------------
      // 🎮 MODE MANETTE (X360)
      // ---------------------------------------------------------------------
      'X360': {
        defaultTab: 'gamepad',
        tabs: [
          {
            id: 'gamepad',
            label: '🎮 Configuration Manette',
            groups: [

              // --- 1. Direction (joystick) ---
              {
                type: 'category',
                label: '🎮 Direction (Joystick)',
                hint: 'Joystick gauche ou droit, sensibilité et zone morte',
                groups: [
                  { type: 'single', section: 'X360', label: 'Réglages de l\'axe direction' }
                ]
              },

              // --- 2. Périphériques (info + tête) ---
              {
                type: 'category',
                label: '📡 Périphériques & Mode',
                hint: 'Méthode de commande + devices AC',
                groups: [
                  { type: 'single', section: 'HEADER',      label: 'Méthode de commande' },
                  { type: 'single', section: 'CONTROLLERS', label: 'Devices AC' }
                ]
              },

              // --- 3. Pédales (axes analogiques RT/LT) ---
              {
                type: 'category',
                label: '🕹️ Accélération & Freinage',
                hint: 'Assigne RT/LT sur chaque axe (bouton 🎯 pour la capture)',
                groups: [
                  { type: 'pair', label: 'Accélérateur & Frein',
                    sections: [
                      { section: 'THROTTLE', label: 'Accélérateur (RT)' },
                      { section: 'BRAKES',   label: 'Frein (LT)' }
                    ]
                  },
                  { type: 'single', section: 'CLUTCH',    label: 'Embrayage' },
                  { type: 'single', section: 'HANDBRAKE', label: 'Frein à main' }
                ]
              },

              // --- 4. Boîte & réglages en course ---
              {
                type: 'category',
                label: '⚙️ Boîte & Réglages en course',
                groups: [
                  { type: 'pair', label: 'Passage de vitesse',
                    sections: [
                      { section: 'GEARUP', label: '↑ Monter' },
                      { section: 'GEARDN', label: '↓ Descendre' }
                    ]
                  },
                  { type: 'single', section: 'REV',          label: 'Marche arrière' },
                  { type: 'single', section: 'AUTO_SHIFTER', label: 'Boîte automatique' },
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
                  { type: 'single', section: 'ABS', label: 'ABS (activer / désactiver)' }
                ]
              },

              // --- 5. Caméras & Vues ---
              {
                type: 'category',
                label: '📷 Caméras & Vues',
                groups: [
                  { type: 'single', section: 'ACTION_CHANGE_CAMERA', label: 'Changer de caméra' },
                  { type: 'pair', label: 'Regarder autour',
                    sections: [
                      { section: 'GLANCELEFT',  label: '← Gauche' },
                      { section: 'GLANCERIGHT', label: '→ Droite' }
                    ]
                  },
                  { type: 'single', section: 'GLANCEBACK', label: 'Regarder derrière' }
                ]
              },

              // --- 6. Signalisation & Énergie ---
              {
                type: 'category',
                label: '💡 Signalisation & Énergie',
                groups: [
                  { type: 'single', section: 'ACTION_HORN',       label: 'Klaxon' },
                  { type: 'single', section: 'ACTION_HEADLIGHTS', label: 'Phares' },
                  { type: 'single', section: 'KERS',              label: 'KERS' },
                  { type: 'single', section: 'DRS',               label: 'DRS' }
                ]
              }
            ]
          },
          {
            id: 'advanced-x360',
            label: '⚙️ Système',
            isFallback: true,
            groups: [
              {
                type: 'category',
                label: '🔧 Options système',
                groups: [
                  { type: 'single', section: 'ADVANCED', label: 'Options avancées' }
                ]
              }
            ]
          }
        ]
      },

      // ---------------------------------------------------------------------
      // ⌨️ MODE CLAVIER (KEYBOARD)
      // ---------------------------------------------------------------------
      'KEYBOARD': {
        defaultTab: 'keyboard',
        tabs: [
          {
            id: 'keyboard',
            label: '⌨️ Configuration Clavier',
            groups: [

              // --- 1. Conduite (essentiels) ---
              {
                type: 'category',
                label: '⌨️ Conduite',
                hint: 'Les 4 touches essentielles + réglages de direction',
                groups: [
                  { type: 'single', section: 'KEYBOARD', label: 'Touches & direction' }
                ]
              },

              // --- 2. Périphériques (info) ---
              {
                type: 'category',
                label: '📡 Périphériques & Mode',
                groups: [
                  { type: 'single', section: 'HEADER',      label: 'Méthode de commande' },
                  { type: 'single', section: 'CONTROLLERS', label: 'Devices AC' }
                ]
              },

              // --- 3. Boîte & Actions ---
              {
                type: 'category',
                label: '⚙️ Boîte & Actions',
                groups: [
                  { type: 'pair', label: 'Passage de vitesse',
                    sections: [
                      { section: 'GEARUP', label: '↑ Monter' },
                      { section: 'GEARDN', label: '↓ Descendre' }
                    ]
                  },
                  { type: 'single', section: 'REV',          label: 'Marche arrière' },
                  { type: 'single', section: 'HANDBRAKE',    label: 'Frein à main' },
                  { type: 'single', section: 'AUTO_SHIFTER', label: 'Boîte automatique' },
                  { type: 'single', section: 'ABS',          label: 'ABS' }
                ]
              },

              // --- 4. Caméras & Vues ---
              {
                type: 'category',
                label: '📷 Caméras & Vues',
                groups: [
                  { type: 'single', section: 'ACTION_CHANGE_CAMERA', label: 'Changer de caméra' },
                  { type: 'pair', label: 'Regarder autour',
                    sections: [
                      { section: 'GLANCELEFT',  label: '← Gauche' },
                      { section: 'GLANCERIGHT', label: '→ Droite' }
                    ]
                  },
                  { type: 'single', section: 'GLANCEBACK', label: 'Regarder derrière' }
                ]
              },

              // --- 5. Signalisation ---
              {
                type: 'category',
                label: '💡 Signalisation',
                groups: [
                  { type: 'single', section: 'ACTION_HORN',       label: 'Klaxon' },
                  { type: 'single', section: 'ACTION_HEADLIGHTS', label: 'Phares' }
                ]
              }
            ]
          },
          {
            id: 'advanced-kb',
            label: '⚙️ Système',
            isFallback: true,
            groups: [
              {
                type: 'category',
                label: '🔧 Options système',
                groups: [
                  { type: 'single', section: 'ADVANCED', label: 'Options avancées' }
                ]
              }
            ]
          }
        ]
      }
    }
  };

  // -------------------------------------------------------------------------
  // ⭐ v1.6.0 — getLayout() accepte maintenant un 2e paramètre `options`
  //    avec `options.inputMethod` ∈ { 'WHEEL', 'X360', 'KEYBOARD' }.
  //
  //    - WHEEL (ou absent) → LAYOUT principal (comportement v1.5.0 inchangé)
  //    - X360 / KEYBOARD    → ALT_LAYOUTS si dispo pour ce fichier,
  //                            sinon fallback sur LAYOUT principal
  // -------------------------------------------------------------------------
  function getLayout(filename, options) {
    const method = (options && options.inputMethod)
      ? String(options.inputMethod).toUpperCase()
      : 'WHEEL';

    // Mode non-WHEEL → cherche d'abord dans les layouts alternatifs
    if (method !== 'WHEEL' && ALT_LAYOUTS[filename] && ALT_LAYOUTS[filename][method]) {
      return ALT_LAYOUTS[filename][method];
    }

    // Fallback : layout principal (WHEEL ou autre fichier non concerné)
    return LAYOUT[filename] || null;
  }

  function getTabForSection(filename, sectionName) {
    const layout = LAYOUT[filename];
    if (!layout) return null;
    for (const tab of layout.tabs) {
      for (const group of tab.groups) {
        const match = groupMatchesSection(group, sectionName);
        if (match) return tab.id;
      }
    }
    for (const tab of layout.tabs) {
      if (tab.isFallback) return tab.id;
    }
    return layout.tabs[0] ? layout.tabs[0].id : null;
  }
  
  
  // -------------------------------------------------------------------------
  // Clés à exclure de l'affichage (déjà gérées ailleurs, ex : bloc Rendu)
  // -------------------------------------------------------------------------
  const EXCLUDED_SECTIONS = {
    // ⭐ Sections à ne pas afficher du tout (en-têtes internes, etc.)
    'audio.ini': ['HEADER'],
  };

  const EXCLUDED_KEYS = {
    'video.ini': {
      'POST_PROCESS': ['FILTER', 'ENABLED'],
      'VIDEO': ['HEIGHT'],   // ⭐ géré automatiquement par le widget de résolution
    }
  };

  function isSectionExcluded(filename, sectionName) {
    const list = EXCLUDED_SECTIONS[filename];
    if (!Array.isArray(list)) return false;
    return list.indexOf(sectionName) !== -1;
  }

  // ⭐ v1.6.0 — Filtrage des clés de binding selon le mode
  //    En X360 → seul XBOXBUTTON a du sens (les JOY/BUTTON/KEY sont des
  //    bindings parallèles pour d'autres périphériques).
  //    En KEYBOARD → seul KEY a du sens.
  //    En WHEEL → pas de XBOXBUTTON (c'est un volant).
  //
  //    ⚠️ EXCEPTIONS : les sections analogiques (THROTTLE, BRAKES, CLUTCH,
  //    HANDBRAKE) gardent AXLE/MIN/MAX/GAMMA même en X360 (les gâchettes
  //    analogiques sont bindées sur des axes).
  const HIDE_KEYS_BY_METHOD = {
    'controls.ini': {
      'X360': {
        // En manette, on cache tout ce qui concerne volant/clavier
        'global': ['JOY', 'JOY_MODIFICATOR', 'BUTTON', 'BUTTON_MODIFICATOR',
                   'KEY', 'KEY_MODIFICATOR'],
        // Sauf dans ces sections où AXLE/MIN/MAX/GAMMA restent utiles
        'keepAxesIn': ['STEER', 'THROTTLE', 'BRAKES', 'CLUTCH', 'HANDBRAKE'],
      },
      'KEYBOARD': {
        // En clavier, on cache tout sauf KEY
        'global': ['JOY', 'JOY_MODIFICATOR', 'BUTTON', 'BUTTON_MODIFICATOR',
                   'XBOXBUTTON', 'AXLE'],
      },
      'WHEEL': {
        // En volant, on cache XBOXBUTTON (peu pertinent pour un volant)
        'global': ['XBOXBUTTON'],
      },
    },
  };

  function isKeyExcludedByMethod(filename, sectionName, keyName, inputMethod) {
    if (!inputMethod) return false;
    const byFile = HIDE_KEYS_BY_METHOD[filename];
    if (!byFile) return false;
    const byMethod = byFile[String(inputMethod).toUpperCase()];
    if (!byMethod) return false;

    // Exception : les sections "axes" gardent AXLE/MIN/MAX/GAMMA même en X360
    if (byMethod.keepAxesIn && byMethod.keepAxesIn.indexOf(sectionName) !== -1) {
      const axisKeys = ['AXLE', 'MIN', 'MAX', 'GAMMA', 'SCALE', 'LOCK',
                        'STEER_GAMMA', 'STEER_FILTER', 'SPEED_SENSITIVITY',
                        'DEBOUNCING_MS', 'FF_GAIN', 'FILTER_FF'];
      if (axisKeys.indexOf(keyName) !== -1) return false;
      // ⭐ v1.6.0 — Les gâchettes RT/LT sont des AXES, pas des boutons
      //    nommés. On cache XBOXBUTTON dans les sections pédales même en X360.
      if (keyName === 'XBOXBUTTON') return true;
    }

    return (byMethod.global || []).indexOf(keyName) !== -1;
  }

  function isKeyExcluded(filename, sectionName, keyName, inputMethod) {
    // ⭐ v1.6.1 — Masquer le JOY pour TOUS les boutons/actions.
    //    Le JOY n'est utile QUE pour les axes analogiques (volant, pédales, shifter).
    //    Pour les boutons, c'est la capture (🎯) qui définit le périphérique automatiquement.
    if (filename === 'controls.ini' && keyName === 'JOY') {
      const axisSections = ['STEER', 'THROTTLE', 'BRAKES', 'CLUTCH', 'HANDBRAKE', 'SHIFTER'];
      if (!axisSections.includes(sectionName)) {
        return true; // On cache le dropdown JOY pour ACTION_HEADLIGHTS, GEARUP, etc.
      }
    }

    // ⭐ v1.6.0 — Check du mode courant
    if (inputMethod && isKeyExcludedByMethod(filename, sectionName, keyName, inputMethod)) {
      return true;
    }

    const byFile = EXCLUDED_KEYS[filename];
    if (!byFile) return false;
    const list = byFile[sectionName];
    if (!Array.isArray(list)) return false;
    return list.indexOf(keyName) !== -1;
  }
  
    /**
   * ⭐ Retourne un Set de TOUTES les sections référencées dans le layout
   *    (peu importe l'onglet). Utilisé pour le fallback "Autres sections".
   */
  function getAllUsedSections(filename, options) {
    // ⭐ v1.6.0 — Utilise getLayout pour respecter inputMethod
    const layout = getLayout(filename, options);
    const used = new Set();
    if (!layout) return used;
    for (const tab of layout.tabs) {
      for (const group of tab.groups || []) {
        collectSectionsFromGroup(group, used);
      }
    }
    return used;
  }

  function collectSectionsFromGroup(group, set) {
    if (!group) return;
    if (group.type === 'single' && group.section) {
      set.add(group.section);
    } else if (group.type === 'pair' && Array.isArray(group.sections)) {
      for (const s of group.sections) {
        if (s && s.section) set.add(s.section);
      }
    } else if (group.type === 'category' && Array.isArray(group.groups)) {
      for (const sub of group.groups) {
        collectSectionsFromGroup(sub, set);
      }
    }
  }

  function groupMatchesSection(group, sectionName) {
    if (!group) return false;
    if (group.type === 'single' && group.section === sectionName) return true;
    if (group.type === 'pair') {
      for (const s of group.sections) if (s.section === sectionName) return true;
    }
    if (group.type === 'category' && Array.isArray(group.groups)) {
      for (const sub of group.groups) {
        if (groupMatchesSection(sub, sectionName)) return true;
      }
    }
    return false;
  }

  const API = {
    getLayout, getTabForSection, getAllUsedSections, isKeyExcluded, isSectionExcluded,
    LAYOUT,
    ALT_LAYOUTS,        // ⭐ v1.6.0 — pour debug / tests
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof global !== 'undefined') global.IniLayout = API;
})(typeof window !== 'undefined' ? window : globalThis);