import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as unzipper from 'unzipper';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const releaseDirectory = path.join(projectRoot, 'release');
const yueVersion = '0.15.6';
const luaVersion = '5.4';

const targets = {
    'macos-arm64': { asset: 'mac_arm64', platform: 'macos', architecture: 'arm64' },
    'macos-x64': { asset: 'mac_x64', platform: 'macos', architecture: 'x64' },
    'linux-x86': { asset: 'linux_x86', platform: 'linux', architecture: 'x86' },
    'linux-x64': { asset: 'linux_x64', platform: 'linux', architecture: 'x64' },
    'windows-x86': { asset: 'win_x86', platform: 'windows', architecture: 'x86' },
    'windows-x64': { asset: 'win_x64', platform: 'windows', architecture: 'x64' }
};

async function download(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Unable to download ${url}: HTTP ${response.status}.`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function installYueLibrary(target) {
    const extension = target.platform === 'windows' ? 'dll' : 'so';
    const files = [`yue.${extension}`, 'LICENSE'];
    if (target.platform === 'windows') {
        files.push('WebView2Loader.dll');
    }

    const yueLibraryDirectory = path.join(
        releaseDirectory,
        target.platform,
        target.architecture,
        'yue'
    );
    mkdirSync(yueLibraryDirectory, { recursive: true });

    const archiveName = `lua_yue_lua_${luaVersion}_v${yueVersion}_${target.asset}.zip`;
    const url = `https://github.com/yue/yue/releases/download/v${yueVersion}/${archiveName}`;
    const archive = await unzipper.Open.buffer(await download(url));

    const entries = files.map((filename) => {
        const entry = archive.files.find((file) => file.path === filename && file.type === 'File');
        if (!entry) {
            throw new Error(`The Yue archive ${archiveName} does not contain ${filename}.`);
        }
        return { filename, entry };
    });

    for (const { filename, entry } of entries) {
        const destination = filename === 'LICENSE'
            ? path.join(releaseDirectory, 'LICENSE.yue')
            : path.join(yueLibraryDirectory, filename.startsWith('yue.') ? `gui.${filename.slice(4)}` : filename);
        writeFileSync(destination, await entry.buffer());
    }
}

function installLuaLibraries() {
    const luaReleaseDirectory = path.join(projectRoot, 'node_modules', 'quickjs-lua', 'release');
    mkdirSync(releaseDirectory, { recursive: true });
    cpSync(luaReleaseDirectory, releaseDirectory, { recursive: true });
}

// Bundled macOS apps look for their libraries under Contents/MacOS.
function installMacOSAppLibraries() {
    const luaLibrary = path.join(releaseDirectory, 'liblua.5.4.dylib');
    const yueDirectory = path.join(releaseDirectory, 'macos');
    for (const entry of readdirSync(releaseDirectory, { withFileTypes: true })) {
        const macOSDirectory = path.join(releaseDirectory, entry.name, 'Contents', 'MacOS');
        if (entry.isDirectory() && entry.name.endsWith('.app') && existsSync(macOSDirectory)) {
            copyFileSync(luaLibrary, path.join(macOSDirectory, 'liblua.5.4.dylib'));
            cpSync(yueDirectory, path.join(macOSDirectory, 'macos'), { recursive: true });
        }
    }
}

installLuaLibraries();

for (const target of Object.values(targets)) {
    await installYueLibrary(target);
}

installMacOSAppLibraries();
