import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ROOT = process.cwd();
const PUBLIC_TESSERACT = path.join(ROOT, 'public', 'tesseract');
const CORE_DEST = path.join(PUBLIC_TESSERACT, 'core');
const LANG_DEST = path.join(PUBLIC_TESSERACT, 'lang-data');

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
      // Also copy to root of public/tesseract in case corePath points directly to /tesseract
      fs.copyFileSync(path.join(coreSrcDir, file), path.join(PUBLIC_TESSERACT, file));
    }
  }
}

// 3. Copy traineddata (both gzipped and unzipped)
const trainedDataGzSrc = path.join(ROOT, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0', 'eng.traineddata.gz');
if (fs.existsSync(trainedDataGzSrc)) {
  fs.copyFileSync(trainedDataGzSrc, path.join(LANG_DEST, 'eng.traineddata.gz'));
  fs.copyFileSync(trainedDataGzSrc, path.join(PUBLIC_TESSERACT, 'eng.traineddata.gz'));

  // Also extract uncompressed version
  const compressedBuffer = fs.readFileSync(trainedDataGzSrc);
  const decompressedBuffer = zlib.gunzipSync(compressedBuffer);
  fs.writeFileSync(path.join(LANG_DEST, 'eng.traineddata'), decompressedBuffer);
  fs.writeFileSync(path.join(PUBLIC_TESSERACT, 'eng.traineddata'), decompressedBuffer);
}

console.log('[copy-tesseract-assets] Successfully copied self-hosted Tesseract assets to public/tesseract/');
