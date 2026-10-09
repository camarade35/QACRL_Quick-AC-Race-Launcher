const fs = require('fs');
const path = require('path');

class ConfigManager {
    static sanitizeJsonText(text) {
        if (!text) return '{}';
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        return text.replace(/[\r\n\t]/g, ' ').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
    }

    static getPpFilters(acPath) {
        const filtersDir = path.join(acPath, 'system', 'cfg', 'ppfilters');
        if (!fs.existsSync(filtersDir)) return ['default'];

        const files = fs.readdirSync(filtersDir);
        const filters = files
            .filter(file => file.endsWith('.ini'))
            .map(file => path.basename(file, '.ini'));

        return filters.length > 0 ? filters : ['default'];
    }

    static getCars(acPath) {
        const carsDir = path.join(acPath, 'content', 'cars');
        if (!fs.existsSync(carsDir)) return [];

        const carFolders = fs.readdirSync(carsDir).filter(file => {
            return fs.statSync(path.join(carsDir, file)).isDirectory();
        });

        return carFolders.map(folder => {
            const carPath = path.join(carsDir, folder);
            const jsonPath = path.join(carPath, 'ui', 'ui_car.json');
            let displayName = folder.replace(/_/g, ' ');

            if (fs.existsSync(jsonPath)) {
                try {
                    const rawData = fs.readFileSync(jsonPath, 'utf8');
                    const cleanData = this.sanitizeJsonText(rawData);
                    const carJson = JSON.parse(cleanData);
                    if (carJson.name) {
                        displayName = carJson.brand ? `${carJson.brand} - ${carJson.name}` : carJson.name;
                    }
                } catch (err) {}
            }

            const skinsDir = path.join(carPath, 'skins');
            const skins = [];
            let mainPreview = null;

            if (fs.existsSync(skinsDir)) {
                const skinFolders = fs.readdirSync(skinsDir).filter(f => fs.statSync(path.join(skinsDir, f)).isDirectory());
                for (const skinFolder of skinFolders) {
                    const skinPath = path.join(skinsDir, skinFolder);
                    const previewJpg = path.join(skinPath, 'preview.jpg');
                    const previewPng = path.join(skinPath, 'preview.png');

                    let skinPreviewUrl = null;
                    if (fs.existsSync(previewJpg)) skinPreviewUrl = `file://${previewJpg.replace(/\\/g, '/')}`;
                    else if (fs.existsSync(previewPng)) skinPreviewUrl = `file://${previewPng.replace(/\\/g, '/')}`;

                    if (!mainPreview && skinPreviewUrl) {
                        mainPreview = skinPreviewUrl;
                    }

                    let skinName = skinFolder;
                    const skinJsonPath = path.join(skinPath, 'ui_skin.json');
                    if (fs.existsSync(skinJsonPath)) {
                        try {
                            const skinRaw = fs.readFileSync(skinJsonPath, 'utf8');
                            const skinClean = this.sanitizeJsonText(skinRaw);
                            const skinJson = JSON.parse(skinClean);
                            if (skinJson.skinname) skinName = skinJson.skinname;
                        } catch (e) {}
                    }

                    skins.push({
                        id: skinFolder,
                        name: skinName,
                        preview: skinPreviewUrl
                    });
                }
            }

            return {
                id: folder,
                name: displayName,
                preview: mainPreview,
                skins: skins
            };
        });
    }

    static getTracks(acPath) {
        const tracksDir = path.join(acPath, 'content', 'tracks');
        if (!fs.existsSync(tracksDir)) return [];

        const trackFolders = fs.readdirSync(tracksDir).filter(file => {
            return fs.statSync(path.join(tracksDir, file)).isDirectory();
        });

        return trackFolders.map(folder => {
            const trackPath = path.join(tracksDir, folder);
            const uiDir = path.join(trackPath, 'ui');
            let displayName = folder.replace(/_/g, ' ');
            const variants = [];

            if (fs.existsSync(uiDir)) {
                const jsonPath = path.join(uiDir, 'ui_track.json');
                if (fs.existsSync(jsonPath)) {
                    try {
                        const rawData = fs.readFileSync(jsonPath, 'utf8');
                        const cleanData = this.sanitizeJsonText(rawData);
                        const trackJson = JSON.parse(cleanData);
                        if (trackJson.name) displayName = trackJson.name;
                    } catch (e) {}
                }

                const directPreview = path.join(uiDir, 'preview.png');
                const directOutline = path.join(uiDir, 'outline.png');

                if (fs.existsSync(directPreview)) {
                    variants.push({
                        id: '',
                        name: 'Standard',
                        preview: `file://${directPreview.replace(/\\/g, '/')}`,
                        outline: fs.existsSync(directOutline) ? `file://${directOutline.replace(/\\/g, '/')}` : null
                    });
                }

                const subItems = fs.readdirSync(uiDir).filter(f => fs.statSync(path.join(uiDir, f)).isDirectory());
                for (const sub of subItems) {
                    const subPreview = path.join(uiDir, sub, 'preview.png');
                    const subOutline = path.join(uiDir, sub, 'outline.png');
                    if (fs.existsSync(subPreview)) {
                        let varName = sub;
                        const subJson = path.join(uiDir, sub, 'ui_track.json');
                        if (fs.existsSync(subJson)) {
                            try {
                                const subRaw = fs.readFileSync(subJson, 'utf8');
                                const subClean = this.sanitizeJsonText(subRaw);
                                const parsed = JSON.parse(subClean);
                                if (parsed.name) varName = parsed.name;
                            } catch (e) {}
                        }
                        variants.push({
                            id: sub,
                            name: varName,
                            preview: `file://${subPreview.replace(/\\/g, '/')}`,
                            outline: fs.existsSync(subOutline) ? `file://${subOutline.replace(/\\/g, '/')}` : null
                        });
                    }
                }
            }

            return {
                id: folder,
                name: displayName,
                variants: variants
            };
        });
    }
}

module.exports = ConfigManager;