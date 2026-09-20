import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PUBLIC_TESSERACT = path.join(ROOT, 'public', 'tesseract');
const CORE_DEST = path.join(PUBLIC_TESSERACT, 'core');
const LANG_DEST = path.join(PUBLIC_TESSERACT, 'lang');

// Ensure destination directories exist
fs.mkdirSync(PUBLIC_TESSERACT, { recursive: true });
fs.mkdirSync(CORE_DEST, { recursive: true });
fs.mkdirSync(LANG_DEST, { recursive: true });

// 1. Copy worker script
const workerSrc = path.join(ROOT, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
if (fs.existsSync(workerSrc)) {
  fs.copyFileSync(workerSrc, path.join(PUBLIC_TESSERACT, 'worker.min.js'));
}

// 2. Copy core wasm and js files
const coreSrcDir = path.join(ROOT, 'node_modules', 'tesseract.js-core');
if (fs.existsSync(coreSrcDir)) {
  const files = fs.readdirSync(coreSrcDir);
  for (const file of files) {
    if (file.startsWith('tesseract-core')) {
      fs.copyFileSync(path.join(coreSrcDir, file), path.join(CORE_DEST, file));
    }
  }
}

// 3. Copy traineddata (eng.traineddata.gz)
const trainedDataGzSrc = path.join(ROOT, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0', 'eng.traineddata.gz');
if (fs.existsSync(trainedDataGzSrc)) {
  fs.copyFileSync(trainedDataGzSrc, path.join(LANG_DEST, 'eng.traineddata.gz'));
}

console.log('[copy-tesseract-assets] Successfully copied self-hosted Tesseract assets to public/tesseract/');
