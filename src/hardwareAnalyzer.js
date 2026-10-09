const si = require('systeminformation');

class HardwareAnalyzer {
    static async detectAndOptimize() {
        const gpu = (await si.graphics()).controllers[0] || {};
        const mem = await si.mem();
        
        const vramGB = gpu.vram ? gpu.vram / 1024 : 0;
        const ramGB = mem.total / (1024 * 1024 * 1024);
        const gpuModel = (gpu.model || '').toLowerCase();

        let preset = 'MEDIUM';
        if (vramGB >= 10 || gpuModel.includes('4070') || gpuModel.includes('3080') || gpuModel.includes('4080')) {
            preset = 'ULTRA';
        } else if (vramGB >= 6 && ramGB >= 16) {
            preset = 'HIGH';
        } else {
            preset = 'LOW';
        }

        const presets = {
            ULTRA: { ppfilter: 'PureCS', extraFx: true, rainFxQuality: 'HIGH', shadowMapSize: 4096 },
            HIGH: { ppfilter: 'Pure', extraFx: false, rainFxQuality: 'MEDIUM', shadowMapSize: 2048 },
            MEDIUM: { ppfilter: 'Pure', extraFx: false, rainFxQuality: 'LOW', shadowMapSize: 2048 },
            LOW: { ppfilter: 'Pure_Light', extraFx: false, rainFxQuality: 'OFF', shadowMapSize: 1024 }
        };

        return {
            detectedHardware: { gpu: gpu.model, vram: `${vramGB} GB`, ram: `${ramGB.toFixed(1)} GB` },
            preset,
            settings: presets[preset]
        };
    }
}

module.exports = HardwareAnalyzer;