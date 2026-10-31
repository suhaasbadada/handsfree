// Read-only: prove current Vite assets are embedded in the actual executable,
// not merely present beside a stale app. Tauri codegen caches Brotli bytes.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

export function verifyEmbeddedFrontend(executable, assets, cached) {
  requireThat(assets.some(asset => asset.name.endsWith('.js')), 'Missing built frontend JavaScript');
  requireThat(assets.some(asset => asset.name.endsWith('.css')), 'Missing built frontend CSS');
  const javascript = assets.filter(asset => asset.name.endsWith('.js')).map(asset => asset.bytes.toString()).join('\n');
  requireThat(javascript.includes('Your activity') && !/Last transcript|<details\b|<summary\b/i.test(javascript), 'Stale dashboard: expected stats-first UI without transcript/disclosures');
  for (const asset of assets) {
    const embedded = cached.some(bytes => {
      let decoded;
      try { decoded = brotliDecompressSync(bytes); } catch { decoded = bytes; }
      return decoded.equals(asset.bytes) && executable.includes(bytes);
    });
    requireThat(embedded, `Current frontend asset not embedded in executable: ${asset.name}`);
  }
}

export function verifyCompiledAssets(root, app) {
  const assets = readdirSync(join(root, 'dist/assets')).filter(name => /\.(js|css)$/.test(name))
    .map(name => ({ name, bytes: readFileSync(join(root, 'dist/assets', name)) }));
  const build = join(root, 'src-tauri/target/release/build');
  const cached = [];
  for (const name of readdirSync(build).filter(name => name.startsWith('handsfree-'))) {
    const directory = join(build, name, 'out/tauri-codegen-assets');
    if (existsSync(directory)) for (const file of readdirSync(directory).filter(file => /\.(js|css)$/.test(file))) cached.push(readFileSync(join(directory, file)));
  }
  verifyEmbeddedFrontend(readFileSync(join(app, 'Contents/MacOS/handsfree')), assets, cached);
  for (const profile of ['clean', 'warm']) for (const role of ['start', 'end']) {
    const name = `${profile}-${role}.wav`;
    requireThat(readFileSync(join(app, 'Contents/Resources/sounds', name)).equals(readFileSync(join(root, 'src-tauri/native/assets/sounds', name))), `Stale bundled cue: ${name}`);
  }
  requireThat(readFileSync(join(app, 'Contents/Resources/icon.icns')).equals(readFileSync(join(root, 'src-tauri/icons/icon.icns'))), 'Stale or missing bundled app icon');
  console.log('PASS: current compiled stats dashboard/CSS embedded in executable; all four Clean/Warm cue bytes and app icon match source.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireThat(process.argv.length === 3, 'Usage: node scripts/check-macos-assets.mjs /path/to/HandsFree.app');
    verifyCompiledAssets(resolve(dirname(fileURLToPath(import.meta.url)), '..'), resolve(process.argv[2]));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
