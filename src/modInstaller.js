const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

class ModInstaller {
    static async install(filePath, acPath) {
        if (!fs.existsSync(filePath)) throw new Error("Fichier introuvable.");

        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        let targetDir = null;

        entries.forEach(entry => {
            if (entry.entryName.includes('ui_car.json')) {
                targetDir = path.join(acPath, 'content', 'cars');
            } else if (entry.entryName.includes('ui_track.json')) {
                targetDir = path.join(acPath, 'content', 'tracks');
            }
        });

        if (!targetDir) {
            throw new Error("Impossible de détecter automatiquement s'il s'agit d'une voiture ou d'un circuit.");
        }

        zip.extractAllTo(targetDir, true);
        return { success: true, message: "Mod installé avec succès !" };
    }
}

module.exports = ModInstaller;