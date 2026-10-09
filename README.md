<div align="center">

<img src="public/assets/logo.png" alt="QACRL Logo" width="120" height="120">

# QACRL — Quick Assetto Corsa Race Launcher

**Un launcher custom léger, moderne et rapide pour Assetto Corsa**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/camarade35/QACRL_Quick-AC-Race-Launcher/releases)
[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)](https://github.com/camarade35/QACRL_Quick-AC-Race-Launcher/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[Fonctionnalités](#-fonctionnalités) • [Installation](#-installation) • [Captures d'écran](#-captures-décran) • [Contribuer](#-contribuer)

</div>

---

## 📖 À propos

**QACRL** (Quick Assetto Corsa Race Launcher) est un launcher alternatif pour Assetto Corsa, pensé pour les joueurs qui veulent **lancer une session en quelques clics** sans passer par le launcher officiel ni Content Manager.

Il se concentre sur **l'essentiel** : choix voiture + circuit + session, configuration météo, et surtout **la connexion rapide aux serveurs en ligne**.

### 🎯 Pourquoi QACRL ?

- ⚡ **Rapide** — démarre en moins d'une seconde
- 🎨 **Interface moderne** — thème sombre/clair, accent personnalisable
- 🌐 **Serveurs en ligne intégrés** — GS4u scraping + serveurs manuels
- 🚀 **Rejoindre un serveur en 2 clics** — écriture automatique du `race.ini`
- 📦 **Gestion des mods** — glisser-déposer pour installer
- 🎮 **Compatible AssettoServer & Kunos** — détecte automatiquement le type de serveur

---

## ✨ Fonctionnalités

### 🚗 Sélection voiture & circuit
- Parcours complet de votre `content/cars` et `content/tracks`
- Recherche instantanée + filtres (Kunos / Mods / Favoris / Déjà joués)
- **Filtres par tags** avec popup interactive
- Sélection de la livrée (skin) et de la variante de circuit
- Logos constructeurs + drapeaux automatiques
- Favoris ⭐ et compteur de sessions

### ⚙️ Configuration de session
- Type de session : **Practice / Race / Hotlap**
- Durée, tours, nombre d'adversaires
- Grille IA : voitures identiques / même classe / même marque / aléatoire
- **Réglages IA** : niveau ± variance, agressivité ± variance
- Assistances : TC, ABS, stabilité, autoclutch, autoblip, ligne idéale, etc.
- Réalisme : usure pneus, carburant, dommages, aspiration
- **Nationalité du pilote** + drapeaux aléatoires pour les IA

### 🌦️ Météo avancée
- **Météo fixe** — sélection parmi toutes les conditions Kunos / SOL / Pure
- **Plans Pure Planner existants** — chargement depuis `extension/config-ext/PurePlanner`
- **Plans personnalisés** — création d'une timeline météo multi-étapes
- Paramètres **pureCtrl** (autostart / last used / live)
- **Heure de départ** + multiplicateur de temps
- Calcul automatique des angles soleil (`SUN_ANGLE`) pour `[RACE]` et `[LIGHTING]`

### 🌐 Serveurs en ligne
- **Scraping GS4u** — liste de 300+ serveurs publics
- **Filtres** : pays, circuit, joueurs min
- **Tri** : nom, joueurs, pays, rating
- **Ping en arrière-plan** (6 threads parallèles)
- **Favoris serveurs** ⭐
- **Ajout manuel** de serveurs par IP:Port
- **Détection AssettoServer** via `/api/details` (fallback Kunos `/INFO` + `/ENTRY`)
- **Description BBCode** convertie en HTML (liens cliquables, images)
- **Features CSP** affichées en badges
- **Bouton Rafraîchir** sans fermer la modale
- **Détection des mods manquants** avec bouton 🔍 (DuckDuckGo) et 📋 (copier)
- **Auto-suffixe du nom en ligne** si déjà pris
- **Support CSP Custom Update** — injection automatique de `__FEATURES`

### 📦 Gestion des mods
- **Drag & drop** d'archives (.zip, .rar, .7z, .tar.gz)
- Détection automatique voiture / circuit / apps / extension / system
- Barre de progression détaillée
- Gestion des conflits (remplacer / passer / annuler)
- **Historique d'installation** avec prévisualisations
- Suppression de mods depuis l'historique

### 🎨 Interface
- **Thème sombre / clair** avec bouton toggle
- **Couleur d'accent** personnalisable (color picker)
- Animations fluides et transitions
- Sidebar récap (voiture / circuit / session / météo)
- Sélection aléatoire 🎲 (voiture + skin + circuit + variante)

### 🎮 Multi-comptes
- **Auto-détection du SteamID** depuis `loginusers.vdf` (fallback `race.ini`)
- Gestion des noms pilote / en ligne séparés
- Détection du dossier Documents automatique

---

## 📸 Captures d'écran

<div align="center">

| 🚗 Sélection voiture | 🌐 Serveurs en ligne |
|---|---|
| ![Cars](docs/screenshots/cars.png) | ![Servers](docs/screenshots/servers.png) |

| ⚙️ Configuration session | 🌦️ Météo & Plans |
|---|---|
| ![Session](docs/screenshots/session.png) | ![Weather](docs/screenshots/weather.png) |

| 🎯 Rejoindre un serveur | 🎨 Thème clair |
|---|---|
| ![Join](docs/screenshots/join.png) | ![Light](docs/screenshots/light-theme.png) |

</div>

---

## 🚀 Installation

### Prérequis

- **Windows 10/11** (64-bit)
- **Assetto Corsa** installé via Steam
- **7-Zip** installé (recommandé pour extraire les mods .rar/.7z)
- **Node.js 18+** (pour build depuis les sources)

### Téléchargement

**Option 1 — Binaire pré-compilé** (recommandé)

Télécharge la dernière release : [Releases](https://github.com/camarade35/QACRL_Quick-AC-Race-Launcher/releases)

**Option 2 — Depuis les sources**

```bash
# Cloner le repo
git clone https://github.com/camarade35/QACRL_Quick-AC-Race-Launcher
cd qacrl

# Installer les dépendances
npm install

# Lancer en mode développement
npm start

# Ou packager pour la distribution
npm run build