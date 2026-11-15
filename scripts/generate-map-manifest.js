const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const MAPAS_ROOT = path.join(WORKSPACE_ROOT, 'Mapas');
const OUT_PATH = path.join(WORKSPACE_ROOT, 'maps-manifest.json');
const FORMATS = ['2v2', '3v3', '4v4'];
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;
const COPY_SUFFIX_RE = /(?:\s*[-_]\s*copia|\s+copia|\s*[-_]\s*copy|\s+copy|\s*\(\d+\))(?=\.[^.]+$)/i;

function readImageDimensions(filePath) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const header = Buffer.alloc(65536);
        const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
        const buf = header.subarray(0, bytesRead);

        if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
        }

        if (buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
            let offset = 2;
            while (offset + 4 < buf.length) {
                if (buf[offset] !== 0xFF) {
                    offset++;
                    continue;
                }
                while (offset < buf.length && buf[offset] === 0xFF) offset++;
                if (offset >= buf.length) break;
                const marker = buf[offset];
                offset++;

                if (marker === 0x00 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) {
                    continue;
                }
                if (offset + 2 > buf.length) break;
                const segLen = buf.readUInt16BE(offset);
                const isSof = (marker >= 0xC0 && marker <= 0xC3)
                    || (marker >= 0xC5 && marker <= 0xC7)
                    || (marker >= 0xC9 && marker <= 0xCB)
                    || (marker >= 0xCD && marker <= 0xCF);
                if (isSof && offset + 7 <= buf.length) {
                    const height = buf.readUInt16BE(offset + 3);
                    const width = buf.readUInt16BE(offset + 5);
                    return { width, height };
                }
                if (segLen < 2) break;
                offset += segLen;
            }
        }
    } finally {
        fs.closeSync(fd);
    }
    return { width: null, height: null };
}

function normalizeMapName(rawName) {
    const cleaned = String(rawName || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\bLive\s*Fire\b/i, 'Live Fire')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeMode(rawMode) {
    const upper = String(rawMode || '').trim().toUpperCase();
    if (upper === 'SLAYER') return 'SLAYER';
    if (upper === 'CTF') return 'CTF';
    if (upper === 'KOTH') return 'KOTH';
    if (upper === 'ODDBALL') return 'ODDBALL';
    if (upper === 'ST' || upper === 'STRONGHOLDS') return 'ST';
    return upper;
}

function parseMapFilename(fileName) {
    if (COPY_SUFFIX_RE.test(fileName)) {
        return null;
    }
    const base = fileName.replace(/\.[^.]+$/, '').trim();
    const match = base.match(/^(.*?)\s+(Slayer|CTF|Koth|Oddball|St|Strongholds)$/i);
    if (!match) {
        throw new Error(`Nombre de mapa/modo no reconocido: "${fileName}"`);
    }
    const mapName = normalizeMapName(match[1]);
    const mode = normalizeMode(match[2]);
    return { mapName, mode };
}

function buildManifest() {
    const manifest = {
        generatedAt: new Date().toISOString(),
        workspaceRoot: 'Mapas',
        formats: {}
    };

    for (const format of FORMATS) {
        const dirPath = path.join(MAPAS_ROOT, format);
        if (!fs.existsSync(dirPath)) {
            manifest.formats[format] = [];
            continue;
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter((d) => d.isFile() && IMAGE_EXT_RE.test(d.name))
            .sort((a, b) => a.name.localeCompare(b.name, 'en'));

        const items = [];
        for (const entry of entries) {
            if (COPY_SUFFIX_RE.test(entry.name)) {
                continue;
            }
            const parsed = parseMapFilename(entry.name);
            const fullPath = path.join(dirPath, entry.name);
            const stat = fs.statSync(fullPath);
            const mtimeMs = Math.round(stat.mtimeMs);
            const { width, height } = readImageDimensions(fullPath);
            const slug = `${format}-${parsed.mapName}-${parsed.mode}`
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            const versionedPath = `Mapas/${format}/${entry.name}?v=${mtimeMs}`;

            items.push({
                id: slug,
                mapName: parsed.mapName,
                mode: parsed.mode,
                fileName: entry.name,
                path: versionedPath,
                desktopPath: versionedPath,
                mobilePath: versionedPath,
                mtimeMs,
                format,
                width,
                height
            });
        }
        manifest.formats[format] = items;
    }

    return manifest;
}

if (require.main === module) {
    const manifest = buildManifest();
    fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2), 'utf8');
    const counts = Object.fromEntries(
        Object.entries(manifest.formats).map(([k, v]) => [k, v.length])
    );
    console.log('MANIFEST_GENERATED:', OUT_PATH, JSON.stringify(counts));
}

module.exports = {
    buildManifest,
    parseMapFilename,
    normalizeMapName,
    normalizeMode,
    readImageDimensions
};
