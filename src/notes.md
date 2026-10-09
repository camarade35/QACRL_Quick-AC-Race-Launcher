# QACRL — Notes techniques

## ✅ Fonctionnalités actuelles

### Voitures / Circuits
- Scan automatique des voitures, circuits, skins et variantes
- Affichage avec aperçus (badge, preview, outline)
- Sélection via modale (skins pour voitures, variantes pour circuits)
- **Clic droit** sur une carte → ouvre le dossier du mod dans l'Explorateur Windows
- Filtres : Tous / Kunos / Mods + filtre par tags
- Détection Kunos automatique (préfixe `ks_`, liste officielle, auteur contenant "kunos")
- **Fallback country** : si `ui/ui_track.json` racine absent, récupère le `country` depuis la 1ère variante (`layout_*`)

### Récap Sidebar
- **Clic gauche** sur le bloc "Voiture" → bascule sur l'onglet Voitures
- **Clic gauche** sur le bloc "Circuit" → bascule sur l'onglet Circuits
- Aperçu des skins, tracés, infos session et météo

### Session (4 sous-onglets)
1. **Session** : type, durée, tours, heures de début
2. **Course & IA** : adversaires, grille, position de départ, agressivité IA
3. **Pilote & Réalisme** : nom du pilote, assistances, conditions de course
4. **Presets** : sauvegarde / rechargement de configurations complètes

### Météo (3 modes)
1. **Météo fixe (Day)** : sélection directe dans la liste (Kunos + SOL/Pure)
2. **Plan Pure existant** : sélection d'un `.json` dans `Plans/<dossier>/`
3. **Plan personnalisé (Stamp)** : builder d'étapes avec météo + durée (minutes)

### Gestion des mods
- Drag & drop ou clic sur la zone pour parcourir
- Support : `.zip`, `.rar`, `.7z`, `.tar.gz` (via 7-Zip détecté sur le système)
- Fallback sur adm-zip si 7-Zip absent (uniquement .zip)
- Détection auto de la structure : `content/cars/*`, `content/tracks/*`, `apps/*`, `extension/*`, `system/*`
- Détection de conflits → dialogue Remplacer / Passer / Annuler
- Barre de progression + throttling des events IPC (80ms)
- Rollback automatique si erreur

### Paramètres
- **Dossier AC** : chemin racine de l'installation Assetto Corsa
- **Dossier Documents** : chemin vers `Documents` (utile si OneDrive, autre disque, etc.)
  - Résolution dans l'ordre : choix manuel → `app.getPath('documents')` → OneDrive → fallback
  - **IMPORTANT** : `race.ini` est écrit dans `<Documents>/Assetto Corsa/cfg/race.ini`

---

## 🔑 Découvertes importantes

### SUN_ANGLE — DEUX paramètres distincts (⚠️ ne pas les confondre)

Les deux valeurs sont **nécessaires**. Retirer l'une casse le réglage d'heure en jeu.

**Dans `[RACE]`** :
- Rôle : **azimut** du soleil (position "compass")
- Plage : `0 → 360`
- Formule : `(hour − 6) × 15`, mod 360
- Exemple : 06:00 → 0° / 12:00 → 90° / 18:00 → 180°
- Lu par AC pour l'initialisation de la scène.

**Dans `[LIGHTING]`** :
- Rôle : **élévation** du soleil (hauteur dans le ciel)
- Plage : `−80 → +80`
- **FORMULE CRITIQUE VALIDÉE EN JEU (04/10/2026)** :

### JSON malformés dans les mods

Certains `ui_car.json` / `ui_track.json` / `ui_skin.json` contiennent des
**retours à la ligne bruts** dans les strings (notamment les descriptions
multi-lignes), ce qui casse `JSON.parse()`.

Solution : `sanitizeJsonText()` qui :
1. Supprime le BOM UTF-8 (`\uFEFF`)
2. Remplace `\r`, `\n`, `\t` par des espaces
3. Remplace les caractères de contrôle (`\u0000`-`\u001F`) par des espaces

Wrapper `readJsonSafe(filePath)` qui log l'erreur au lieu de l'avaler.