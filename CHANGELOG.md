# Changelog

Toutes les modifications notables de QACRL sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [Unreleased]

### À venir
- Undo fin (par option, pas global)
- Détection auto de conflits CSP
- Améliorations UX wizard volant (bouton reset axe, dropdown AC manuel)
- Test in-game post-wizard

---

## [1.4.3] - 2026-10-15

### ✨ Ajouté
- **Internationalisation complète des nouveautés v1.4.x** : toutes les chaînes hardcodées en français sont désormais traduites via `I18n.tFr()` (fallback automatique).
  - **Plans** : "Créé par QACRL", "Fichier Sol", messages "Aucun plan trouvé", "(CSP+Pure ou Sol requis)"
  - **Récap sidebar** : "Plan Sol aléatoire" / "Plan Pure aléatoire"
  - **Modale gamepad** : titre, message, boutons "🔄 Relancer QACRL" / "Plus tard"
  - **Warning désync** : tout le message au lancement d'une course

### 🔧 Modifié
- `public/assets/i18n/en.json` : ~20 nouvelles clés dans `app.iniLabels`
- `public/src/session.js` : strings `renderExistingPlans`, `updateWeatherUI`, `launchGame` passées par `I18n.tFr`
- `public/src/content.js` : `updateRecapSidebar` idem
- `public/app.js` : `_showGamepadWarning` idem

### 📝 Notes
- Le fichier `fr.json` reste inchangé : `I18n.tFr()` retourne le texte d'origine en mode FR.
- Bascule FR ↔ EN live testée (les modales, récap, plans basculent instantanément).

---

## [1.4.2] - 2026-10-15

### ✨ Ajouté
- **Détection live des périphériques** : listeners `gamepadconnected` / `gamepaddisconnected` + poll de secours (1.5s). Chromium ne déclenche pas toujours les events selon la fenêtre active.
- **Modale "Périphériques modifiés"** : si un device est branché/débranché, une modale stylée QACRL propose de **relancer l'app** ou de reporter.
- **Bouton 🔄 Relancer QACRL** : IPC `relaunch-app` qui redémarre l'application proprement.
- **Warning de désynchronisation** au lancement d'une course si l'ordre des gamepads a changé depuis la dernière calibration (utilise `QacrlDialogs.confirm`).

### 🐛 Corrigé
- **Doublon de devices** : certains drivers (Fanatec en mode compatibilité + natif) exposent le MÊME device sur 2 index Chromium → dédupliqué par `vendor:product` dans le wizard.
- **Faux positifs de la modale** : grâce de 30s au démarrage + comparaison par **set de `vendor:product`** (au lieu d'index) + debounce 3s. Un appui sur une pédale ou un mouvement de volant ne déclenche plus d'alerte.

### 🔧 Modifié
- `main.js` : IPC `relaunch-app` ; `reconcileControlsIni` **désactivé** (l'approche "réécriture au lancement" cassait les JOY=n quand un device était éteint).
- `preload.js` : `relaunchApp` exposé.
- `public/app.js` : détection gamepad refondue (set unique, grâce, debounce, modale action).
- `public/src/session.js` : warning désync au lancement de course.
- `public/src/wheelCalibration.js` : `buildAcControllersFromChromium` déduplique par `vendor:product`.

### 📝 Notes
- **Comportement attendu** : si un device est débranché/rebranché pendant que QACRL tourne, une modale propose de relancer l'app. Si l'utilisateur choisit "Plus tard" et que les axes ne répondent plus → il relance QACRL manuellement.
- **Cas limite connu** : double rebranchement rapide peut ne pas déclencher la 2ᵉ modale (protection anti-spam). Acceptable vu la rareté.

---

## [1.4.1] - 2026-10-15

### 🐛 Corrigé (critique)
- **Wizard volant — priorité table > profil appris** : la table hardcodée des devices (`AXIS_MAP_BY_DEVICE`) est maintenant prioritaire sur le profil appris. Avant ce fix, un profil appris corrompu pouvait écraser la table à jamais (cas typique : un premier wizard raté apprenait une mauvaise conversion, et tous les wizards suivants réutilisaient cette erreur). Impact concret : sur Fanatec CSL / ClubSport, le frein était systématiquement configuré sur `AXLE=2` (défaut AC manette) au lieu de `AXLE=5` (valeur réelle DirectInput).

### 🔧 Modifié
- `public/src/gamepadMapper.js` — `getAxisMapping()` réécrite avec options `ignoreTable` / `ignoreLearned`. La table gagne désormais sur le profil appris.
- `public/src/wheelCalibration.js` — utilise `GamepadMapper.getAxisMapping()` pour convertir Chromium → AC avant de tomber sur les défauts AC.

### 📝 Notes
- Les profils appris corrompus existants sont automatiquement ignorés pour les devices connus de la table. Aucune action utilisateur requise.
- Le profil appris reste utilisé pour les devices **non répertoriés** par la table.

---

## [1.4.0] - 2026-10-14

### ✨ Ajouté
- **Support des plans Sol Planner (INI)** — QACRL gère désormais les **deux** systèmes de plans météo :
  - **Pure Planner** (JSON) : prioritaire si Pure est installé
  - **Sol Planner** (INI) : utilisé si Sol est installé sans Pure
  - Détection automatique via `hasSolPlanner` (app Python `sol_planner` présente)
  - Scan des plans Sol dans `apps/python/sol_planner/plans/*.ini`
  - Écriture dans `apps/python/sol_planner/presets/presets.ini` (slot dédié `QACRL`, sinon 1er slot vide, sinon fallback slot 0)
  - Activation automatique via `loadWithStart` (camelCase exact attendu par Sol)
  - Gestion des modes `static` / `existing_plan` / `custom_plan` routés vers le bon writer
  - Nettoyage one-shot des `loadwithstart` (lowercase) résiduels
- **Récap sidebar** — affichage du plan actif avec son moteur (`cloudy-rainy-nice (Sol)` / `MonPlan (Pure)`)
- **Badge dynamique "SOL" / "PURE"** dans le titre de la section "Plans existants"
- **IPC** : `scan-sol-plans`, `load-sol-plan`, `delete-sol-plan`, `save-custom-sol-plan`, `cleanup-sol-presets`

### 🐛 Corrigé
- Doublon de préfixe `QACRL_QACRL_` dans les noms de plans Sol
- Casse `loadWithStart` vs `loadwithstart` (Sol utilise `optionxform = str`, sensible à la casse)
- Suffixe "(CSP+Pure requis)" qui s'accumulait en boucle dans le dropdown Mode météo
- Message d'état vide dans la liste "Plans existants" quand Sol est actif
- Affichage `Météo : —` dans le récap sidebar quand un plan Sol était sélectionné

### 🔧 Modifié
- `src/solPlanner.js` : nouveau module (~650 lignes) — parseurs, writers, scanners Sol
- `main.js` : IPC Sol + routing dans `launch-game` (priorité Pure préservée)
- `preload.js` : 5 nouveaux IPC exposés
- `public/src/session.js` : helpers `isSolAvailable()` + `getActivePlanner()`, routing UI
- `public/src/content.js` : récap sidebar route vers le bon planner
- `public/app.js` : `appData.solPlans` + capacités Sol
- `package.json` : version 1.4.0

### 📝 Notes
- **Priorité Pure** : si Pure est installé, le flux Pure reste strictement inchangé. Sol est ignoré.
- **Aucun risque** pour les fichiers Pure : les writers Sol ne touchent jamais à `PurePlanner/` ni `pureCtrl__settings.ini`.
- **Backup auto** : `presets.ini.bak` avant chaque écriture de plan Sol.

---

## [1.3.1] - 2026-10-14

### ✨ Ajouté
- **Assistant d'installation** — détection de Sol en plus de CSP et Pure
- **Assistant** — étape *Graphismes* : liste de filtres PP avec noms lisibles (`__Sol` → `Sol`, `__Sol_Extra` → `Sol Extra`…)
- **Assistant** — étape *Graphismes* : styles Weather FX filtrés selon ce qui est installé (Sol 2.x si Sol seul, Pure Gamma/LCS si Pure, Default sinon)
- **Assistant** — étape *Récap* : détection live des capacités (si CSP/Sol/Pure sont installés pendant le wizard, le récap se met à jour)
- **Wizard volant** — support de la polarité inversée (pédales Fanatec/load cell) : `MIN` = valeur au repos, `MAX` = valeur à fond
- **Wizard volant** — écriture automatique dans `controls.ini` : `[CONTROLLERS]`, `[HEADER] INPUT_METHOD=WHEEL`, `JOY`, `AXLE`, `MIN`, `MAX`
- **Wizard volant** — création de `controls.ini` à partir de zéro si absent (install vierge)
- **Wizard volant** — calcul automatique de l'index `JOY` (device AC) à partir du gamepad Chromium détecté
- **Wizard volant** — bouton 🎯 individuel par axe (reconfig rapide sans refaire les 5 étapes)
- **Installation CSP/Sol** — détection et activation automatique des apps Python Sol dans `python.ini`
- **Installation CSP/Sol** — détection du dossier `apps/python` dans les archives
- **Onglet CSP** — bouton « Installer CSP + Sol/Pure » quand CSP est présent mais pas de script météo

### 🐛 Corrigé
- **`window.api.detectSteamId is not a function`** — handler maintenant exposé dans `preload.js`
- **`python.ini` mal formé** après installation Sol (`[SOL_CONFIG]ACTIVE=1` collés sur une ligne)
- **Wizard volant** — skip silencieux des axes non assignés (`AXLE=-1`), empêchant tout mapping sur install vierge
- **Wizard volant** — priorité aux AXLE réellement assignés (`>= 0`), plus de fallback prématuré sur `-1`
- **Focus des modales** — `z-index` explicites : wizard volant > guide CSP > setup wizard > update
- **Rafraîchissement des éditeurs INI** après écriture par le wizard volant
- **Écriture `video.ini`** — le dossier parent est créé s'il n'existe pas
- **Récap assistant** — n'affiche plus « sans CSP » alors que CSP est installé

### 🔧 Modifié
- `preload.js` : `detectSteamId` exposé
- `main.js` : détection Sol dans `detect-setup-status`, création dossier parent dans `write-ini-file`
- `public/src/wheelCalibration.js` : refonte complète de `finalizeAndSummary` (écriture `controls.ini`, polarité, `CONTROLLERS`, `HEADER`)
- `public/src/setupWizard.js` : étape *Graphismes* adaptative (CSP/Sol/Pure), récap live, gestion focus modales
- `public/src/cspInstallGuide.js` : événement `qacrl:cspinstall-closed`
- `public/src/weatherFx.js` / `iniControls.js` / `settingsSearch.js` : noms PP filters lisibles
- `public/src/utils.js` : helper `formatPpFilterName()`
- `src/cspArchiveInstaller.js` : `activateSolPythonApps` réécrit (regex + EOL), marker `apps/python`
- `style.css` : z-index explicites par modale
- i18n FR/EN : nouvelles clés `setup.graphics.*`, `setup.detection.sol`, `setup.recap.cspWeather`

---

## [1.3.0] - 2026-10-12

### ✨ Ajouté
- **Assistant d'installation** (partie 2) — deux nouvelles étapes entre *Identité* et *Récap*
  - **Graphismes** — détection live de CSP / Pure + configuration directe :
    - Toggle *Weather FX activé* (écrit dans `weather_fx.ini`)
    - Sélecteur de *Style Weather FX* (Default / Pure Gamma / Pure LCS)
    - Toggle *Filtre post-process activé* (écrit dans `video.ini` → `[POST_PROCESS] ENABLED`)
    - Sélecteur de *Filtre PP* (liste lue depuis `system/cfg/ppfilters/`)
    - **Mode dégradé** : si CSP ou Pure absent → warning orange + étape skippée proprement
  - **Contrôles** — détection et calibration des périphériques :
    - Liste live des gamepads/volants connectés (via `navigator.getGamepads()`)
    - Fallback clavier/souris si aucun device détecté
    - Bouton **🎯 Lancer le wizard** qui ouvre la calibration volant par-dessus l'assistant (l'assistant se cache puis se ré-affiche automatiquement à la fin)
    - Bouton **↻ Actualiser** pour re-scanner les devices à chaud

### 🔧 Modifié
- `setupWizard.js` : passage à **6 étapes** (`welcome → detection → identity → graphics → controls → recap`)
- `style.css` : modale wizard **720 → 900px**, dots réduits (26 → 24px), gaps et séparateurs resserrés
- `fr.json` / `en.json` : ajout des clés `app.setup.steps.graphics`, `app.setup.steps.controls`, `app.setup.graphics.*`, `app.setup.controls.*`

### 🐛 Corrigé
- Barre de progression du wizard : le 6ᵉ dot (**Récap**) passait sous le bouton de fermeture `×` — corrigé par ajustement combiné largeur / tailles / gaps

---

## [1.2.9] - 2026-10-12

### ✨ Ajouté
- **Assistant d'installation** (partie 1) — affiché automatiquement au premier lancement, relançable depuis Paramètres > Général
  - **Bienvenue** — présentation et option "Passer"
  - **Détection automatique** — scan de l'installation : chemin AC (registry Steam + fallbacks), dossier Documents (OneDrive inclus), SteamID64 (via `loginusers.vdf` ou `race.ini`), présence de CSP, Pure, 7-Zip, comptage voitures/circuits. Correction manuelle possible (choisir un dossier)
  - **Identité du pilote** — nom solo, nom en ligne, SteamID, nationalité (drapeaux depuis `assets/flags`)
  - **Récap** — résumé complet avant validation
- **Support CSP-agnostique** — QACRL fonctionne maintenant **sans CSP ni Pure installés**
  - Détection live de CSP / Pure au démarrage et au changement de dossier AC (`check-csp-pure`)
  - **Mode dégradé** dans `launch-game` : si Pure absent, force une météo Kunos et skip toute la logique `PurePlanner` (plus de crash "Dossier PurePlanner introuvable")
  - **Onglet CSP** : affiche un message clair "Custom Shaders Patch n'est pas installé" si CSP absent
  - **Dropdown météo** : filtré pour ne montrer que les météos Kunos si CSP/Pure absents
  - **Modes "Plan Pure"** grisés avec mention `(CSP+Pure requis)` si indisponibles
  - Bascule automatique en "Météo fixe" si l'utilisateur était en mode plan et que Pure disparaît
  - `[LIGHTING]` omis de `race.ini` si CSP absent (les directives `__CM_*` peuvent planter AC)

### 🐛 Corrigé
- **Assistant — nationalité vide** : les drapeaux sont maintenant chargés via IPC au lieu de dépendre de `appData` (qui n'est pas exposé sur `window`)
- **`settingsCsp.load()`** : appelle directement `checkCspPure()` via IPC au lieu de lire `window.appData.capabilities`

### 🔧 Modifié
- `main.js` : ajout IPC `check-csp-pure`, `launch-game` adapté (mode dégradé), `writeRaceConfig` reçoit `{ noCsp }`
- `preload.js` : expose `checkCspPure()`
- `app.js` : `appData.capabilities` détectées au démarrage + re-détection au changement de dossier AC
- `iniWriter.js` : nouvelle signature `writeRaceConfig(..., options)` avec `options.noCsp`
- `session.js` : helpers `filterWeatherByCapabilities()` et `isPureAvailable()` + UI météo adaptée
- `settingsCsp.js` : check live CSP + message dédié
- `setupWizard.js` : nouveau module IIFE (assistant)
- `style.css` : styles `.setup-wizard-*` et `.csp-not-installed`
- i18n FR/EN : ajout de `app.setup.*`, `app.settings.cspNotInstalled.*`, `app.settings.groups.setupWizard`, `app.settings.fields.setupWizardHint`, `app.settings.btn.relaunchSetup`

---

## [1.2.8] - 2026-10-12

### ✨ Ajouté
- **Recherche globale dans les Paramètres** — barre unique qui cherche dans **tous** les onglets (Général, Contrôles, Vidéo, Audio, CSP) et affiche les résultats regroupés par fichier + section, avec widgets éditables directement
  - Index INI (controls / video / audio)
  - Index CSP (~30 modules × ~30 options, template-first)
  - Index statique (identité pilote, langue, rendu Weather FX + PP filter, caméra libre)
- **Bandeau de sauvegarde** flottant en bas des résultats :
  - Délai configurable de `Manuel` (par défaut) à `60min` (paliers : 0.5s / 1s / 3s / 5s / 10s / 30s / 1min / 5min / 10min / 15min → 60min)
  - Bouton **💾 Enregistrer maintenant**
  - Bouton **↶ Annuler** (recharge depuis le disque les fichiers modifiés)
  - Statut en temps réel (`📝 N fichier(s) modifié(s)` / `⏳ Enregistrement…` / `✅ Enregistré à HH:MM:SS`)
- **Raccourci Ctrl+F** dans l'onglet Paramètres pour focus la barre de recherche
- Persistance du délai d'auto-save dans `settings.json` (`autoSaveSearchDelay`)

### 🐛 Corrigé
- **Compteur de fichiers modifiés** dans la recherche globale : bascule sur un `Set` de fichiers dirty pour éviter qu'il ne s'accumule à chaque frappe
- **`confirm()` natif sur "Recharger"** dans Paramètres > Contrôles/Vidéo/Audio : remplacé par la modale QACRL stylée (`Dialogs.confirm`)

### 🔧 Modifié
- `settingsIni.js` : expose `getEditor`, `setValueInEditor`, `saveByName`, `reloadByName` pour la recherche globale
- `settingsCsp.js` : expose `loadModuleForSearch`, `saveCspModuleByName`, `createCspWidget` pour la recherche globale
- `settingsSearch.js` : nouveau module (IIFE) — construction d'index + rendu + saves débounced
- Bandeau save : `position: fixed` (au lieu de `sticky`) + couleurs thémées (adapté clair/sombre)

---
## [1.2.3 à 1.2.7] sur le github, oublie de changelog
---

## [1.2.2] - 2026-10-10

### 🐛 Corrigé
- **Sessions locales** : ajout des variables d'environnement Steam dans `launch-game`. Sans elles, AC démarrait sur le menu principal au lieu de charger la session configurée (même correctif que pour le join multijoueur en v1.2.1).

---


## [1.2.1] - 2026-10-10

### 🐛 Corrigé
- **Join multijoueur** : restauration des variables d'environnement Steam (`SteamAppId`, `SteamGameId`) dans le `spawn` de `acs.exe`. Sans elles, AC ignorait `[REMOTE] ACTIVE=1` et se lançait en solo malgré un `race.ini` valide.

---

## [1.2.0] - 2026-10-10

### ✨ Ajouté
- **Coller un lien serveur** : support des liens `acstuff.club`, `acmanager://` et adresses `IP:PORT`
- **Édition de serveur** : modale HTML pour renommer / changer l'IP:PORT (remplace les `prompt()` bloqués par Electron)
- **Filtres favoris** : bouton "⭐ Favoris uniquement" sur les listes "Serveurs manuels" et "Serveurs récents"
- **Barre de titre personnalisée** : plus de barre système, boutons réduire/agrandir/fermer intégrés à l'app
- **Réparation auto JSON** : les `ui_skin.json` malformés (virgules traînantes, nombres octaux) sont réparés silencieusement
- **Warnings regroupés** : les erreurs JSON sont résumées en 1 ligne au lieu de polluer la console

### 🐛 Corrigé
- **Toggle favoris** : `splice(key, 1)` remplacé par `splice(idx, 1)` (les favoris ne persistaient pas)
- **Affichage des serveurs récents** : le conteneur HTML était vide (mal fermé)
- **Section "Coller un lien de serveur" dupliquée** : suppression du doublon

### 📝 Documentation
- README : section avertissements CSP "Failed to decrypt model"
- README : section License + Contribuer
- CHANGELOG créé

---

## [1.1.1] - 2026-10-10

### 🐛 Corrigé (critique)
- **Handshake failed au join multijoueur** : les tabulations en début de ligne dans `race.ini` faisaient ignorer la section `[REMOTE]` par AC
- **Mauvais port de connexion** : utilisation de `tport` (TCP) au lieu de `port` (UDP), qui différaient sur certains serveurs AssettoServer
- **Hostnames non résolus** : les serveurs avec DNS dynamique (`mon-serveur.free.fr`) échouaient le handshake ; ils sont maintenant résolus en IP avant écriture dans `race.ini`
- **Variables Steam manquantes** : ajout de `SteamAppId` / `SteamGameId` dans le `spawn` de `acs.exe`, indispensable pour qu'AC honore `[REMOTE] ACTIVE=1`

### 📝 Documentation
- Documentation du warning CSP "Failed to decrypt model" comme avertissement connu

---

## [1.1.0] - 2026-10-09

### ✨ Ajouté
- Sélection de skin pour les serveurs multijoueur
- Profils serveur (mémorise le combo voiture + skin par serveur)
- Historique des serveurs récents
- Mémorisation des mots de passe serveur
- Support des liens `acmanager://` (partiel)

---

## [1.0.0] - 2026-10-07

### ✨ Ajouté
- Version initiale stable
- Sélection voiture / circuit / skin / variante
- Configuration session (Practice / Race / Hotlap)
- Gestion météo (fixe / plans Pure)
- Serveurs en ligne GS4u
- Installation de mods (drag & drop)
- Thèmes clair/sombre + accent personnalisable
- Favoris voitures / circuits / serveurs
- Historique sessions
- Presets de session
- Détection automatique SteamID

---

## Types de changements

- `✨ Ajouté` — nouvelles fonctionnalités
- `🔧 Modifié` — changements dans les fonctionnalités existantes
- `🗑️ Déprécié` — fonctionnalités bientôt retirées
- `❌ Supprimé` — fonctionnalités retirées
- `🐛 Corrigé` — corrections de bugs
- `🔒 Sécurité` — en lien avec la sécurité