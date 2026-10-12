# Changelog

Toutes les modifications notables de QACRL sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [Unreleased]

### À venir
- Undo fin (par option, pas global)
- Détection auto de conflits CSP

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