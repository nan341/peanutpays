import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import { parseReceipt } from '../lib/receiptParser';

// Stroke-based vector glyph renderer for clean receipt generation
type Stroke = [number, number, number, number]; // x1, y1, x2, y2 in a 12x18 box

const GLYPH_STROKES: Record<string, Stroke[]> = {
  ' ': [],
  'A': [[0, 18, 6, 0], [6, 0, 12, 18], [2, 11, 10, 11]],
  'B': [[1, 0, 1, 18], [1, 0, 9, 0], [9, 0, 12, 3], [12, 3, 12, 6], [12, 6, 9, 9], [9, 9, 1, 9], [9, 9, 12, 12], [12, 12, 12, 15], [12, 15, 9, 18], [9, 18, 1, 18]],
  'C': [[11, 3, 8, 0], [8, 0, 4, 0], [4, 0, 1, 3], [1, 3, 1, 15], [1, 15, 4, 18], [4, 18, 8, 18], [8, 18, 11, 15]],
  'D': [[1, 0, 1, 18], [1, 0, 7, 0], [7, 0, 12, 5], [12, 5, 12, 13], [12, 13, 7, 18], [7, 18, 1, 18]],
  'E': [[1, 0, 1, 18], [1, 0, 11, 0], [1, 9, 8, 9], [1, 18, 11, 18]],
  'F': [[1, 0, 1, 18], [1, 0, 11, 0], [1, 9, 8, 9]],
  'G': [[11, 3, 8, 0], [8, 0, 4, 0], [4, 0, 1, 3], [1, 3, 1, 15], [1, 15, 4, 18], [4, 18, 8, 18], [8, 18, 11, 15], [11, 15, 11, 9], [11, 9, 6, 9]],
  'H': [[1, 0, 1, 18], [11, 0, 11, 18], [1, 9, 11, 9]],
  'I': [[1, 0, 11, 0], [6, 0, 6, 18], [1, 18, 11, 18]],
  'J': [[3, 0, 11, 0], [8, 0, 8, 14], [8, 14, 5, 18], [5, 18, 1, 16], [1, 16, 0, 12]],
  'K': [[1, 0, 1, 18], [11, 0, 1, 10], [3, 8, 11, 18]],
  'L': [[1, 0, 1, 18], [1, 18, 11, 18]],
  'M': [[1, 18, 1, 0], [1, 0, 6, 9], [6, 9, 11, 0], [11, 0, 11, 18]],
  'N': [[1, 18, 1, 0], [1, 0, 11, 18], [11, 18, 11, 0]],
  'O': [[4, 0, 8, 0], [8, 0, 12, 4], [12, 4, 12, 14], [12, 14, 8, 18], [8, 18, 4, 18], [4, 18, 0, 14], [0, 14, 0, 4], [0, 4, 4, 0]],
  'P': [[1, 0, 1, 18], [1, 0, 8, 0], [8, 0, 12, 3], [12, 3, 12, 7], [12, 7, 8, 10], [8, 10, 1, 10]],
  'Q': [[4, 0, 8, 0], [8, 0, 12, 4], [12, 4, 12, 14], [12, 14, 8, 18], [8, 18, 4, 18], [4, 18, 0, 14], [0, 14, 0, 4], [0, 4, 4, 0], [7, 13, 12, 18]],
  'R': [[1, 0, 1, 18], [1, 0, 8, 0], [8, 0, 12, 3], [12, 3, 12, 7], [12, 7, 8, 10], [8, 10, 1, 10], [6, 10, 11, 18]],
  'S': [[11, 3, 8, 0], [8, 0, 4, 0], [4, 0, 1, 3], [1, 3, 3, 6], [3, 6, 9, 11], [9, 11, 11, 14], [11, 14, 8, 18], [8, 18, 4, 18], [4, 18, 1, 15]],
  'T': [[0, 0, 12, 0], [6, 0, 6, 18]],
  'U': [[1, 0, 1, 14], [1, 14, 4, 18], [4, 18, 8, 18], [8, 18, 11, 14], [11, 14, 11, 0]],
  'V': [[0, 0, 6, 18], [6, 18, 12, 0]],
  'W': [[0, 0, 3, 18], [3, 18, 6, 9], [6, 9, 9, 18], [9, 18, 12, 0]],
  'X': [[1, 0, 11, 18], [11, 0, 1, 18]],
  'Y': [[0, 0, 6, 9], [12, 0, 6, 9], [6, 9, 6, 18]],
  'Z': [[1, 0, 11, 0], [11, 0, 1, 18], [1, 18, 11, 18]],
  '0': [[4, 0, 8, 0], [8, 0, 12, 4], [12, 4, 12, 14], [12, 14, 8, 18], [8, 18, 4, 18], [4, 18, 0, 14], [0, 14, 0, 4], [0, 4, 4, 0]],
  '1': [[3, 3, 6, 0], [6, 0, 6, 18], [2, 18, 10, 18]],
  '2': [[1, 4, 4, 0], [4, 0, 8, 0], [8, 0, 11, 3], [11, 3, 11, 7], [11, 7, 1, 18], [1, 18, 12, 18]],
  '3': [[1, 2, 4, 0], [4, 0, 8, 0], [8, 0, 11, 3], [11, 3, 11, 6], [11, 6, 7, 9], [7, 9, 11, 12], [11, 12, 11, 15], [11, 15, 8, 18], [8, 18, 4, 18], [4, 18, 1, 16]],
  '4': [[9, 18, 9, 0], [9, 0, 1, 11], [1, 11, 12, 11]],
  '5': [[10, 0, 2, 0], [2, 0, 2, 8], [2, 8, 8, 8], [8, 8, 11, 11], [11, 11, 11, 15], [11, 15, 8, 18], [8, 18, 2, 18]],
  '6': [[9, 2, 5, 0], [5, 0, 2, 4], [2, 4, 2, 14], [2, 14, 5, 18], [5, 18, 8, 18], [8, 18, 11, 15], [11, 15, 11, 11], [11, 11, 8, 8], [8, 8, 2, 9]],
  '7': [[1, 0, 11, 0], [11, 0, 5, 18]],
  '8': [[4, 0, 8, 0], [8, 0, 11, 3], [11, 3, 11, 6], [11, 6, 8, 9], [8, 9, 4, 9], [4, 9, 1, 6], [1, 6, 1, 3], [1, 3, 4, 0], [8, 9, 11, 12], [11, 12, 11, 15], [11, 15, 8, 18], [8, 18, 4, 18], [4, 18, 1, 15], [1, 15, 1, 12], [1, 12, 4, 9]],
  '9': [[10, 9, 4, 9], [4, 9, 1, 7], [1, 7, 1, 3], [1, 3, 4, 0], [4, 0, 7, 0], [7, 0, 10, 3], [10, 3, 10, 14], [10, 14, 7, 18], [7, 18, 3, 16]],
  '.': [[4, 16, 6, 16], [6, 16, 6, 18], [6, 18, 4, 18], [4, 18, 4, 16]],
  ',': [[4, 15, 6, 15], [6, 15, 4, 19]],
  ':': [[5, 5, 6, 5], [5, 13, 6, 13]],
  '-': [[2, 9, 10, 9]],
  '/': [[1, 18, 11, 0]],
  '%': [[1, 2, 4, 2], [1, 18, 11, 0], [8, 16, 11, 16]],
  '₹': [[1, 0, 10, 0], [1, 4, 9, 4], [1, 0, 1, 18], [1, 0, 7, 0], [7, 0, 10, 3], [10, 3, 10, 6], [10, 6, 7, 9], [7, 9, 1, 9], [5, 9, 10, 18]],
};

function drawLine(png: PNG, x1: number, y1: number, x2: number, y2: number, thickness: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  const xInc = dx / (steps || 1);
  const yInc = dy / (steps || 1);

  let curX = x1;
  let curY = y1;

  for (let i = 0; i <= steps; i++) {
    for (let tx = -thickness; tx <= thickness; tx++) {
      for (let ty = -thickness; ty <= thickness; ty++) {
        if (tx * tx + ty * ty <= thickness * thickness) {
          const px = Math.round(curX + tx);
          const py = Math.round(curY + ty);
          if (px >= 0 && px < png.width && py >= 0 && py < png.height) {
            const idx = (png.width * py + px) << 2;
            png.data[idx] = 0;
            png.data[idx + 1] = 0;
            png.data[idx + 2] = 0;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
    curX += xInc;
    curY += yInc;
  }
}

function renderReceiptPng(lines: string[]): PNG {
  const width = 1100;
  const height = 1350;
  const png = new PNG({ width, height });

  // Fill white background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = 255;
    }
  }

  const scale = 2.2;
  const thickness = 2;
  let curY = 80;
  const startX = 80;

  for (const line of lines) {
    let curX = startX;
    const upper = line.toUpperCase();

    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      const strokes = GLYPH_STROKES[ch] || GLYPH_STROKES[' '];

      for (const [x1, y1, x2, y2] of strokes) {
        drawLine(
          png,
          curX + x1 * scale,
          curY + y1 * scale,
          curX + x2 * scale,
          curY + y2 * scale,
          thickness
        );
      }
      curX += 16 * scale;
    }
    curY += 28 * scale + 10;
  }

  return png;
}

function createBlurryPng(src: PNG): PNG {
  const { width, height } = src;
  const dst = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      const radius = 20;

      for (let dy = -radius; dy <= radius; dy += 5) {
        for (let dx = -radius; dx <= radius; dx += 5) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (width * ny + nx) << 2;
            sum += src.data[idx];
            count++;
          }
        }
      }

      const avg = sum / count;
      const washed = Math.round(220 + (avg - 128) * 0.08);
      const val = Math.min(255, Math.max(0, washed));

      const outIdx = (width * y + x) << 2;
      dst.data[outIdx] = val;
      dst.data[outIdx + 1] = val;
      dst.data[outIdx + 2] = val;
      dst.data[outIdx + 3] = 255;
    }
  }

  return dst;
}

async function run() {
  const destDir = path.join(process.cwd(), 'docs', 'test-receipts');
  fs.mkdirSync(destDir, { recursive: true });

  const receiptLines = [
    'SPICE GARDEN RESTAURANT',
    '12 MG ROAD, INDIRANAGAR, BENGALURU 560038',
    'GST NO: 29ABCDE1234F1Z5',
    'NAME: ROHAN',
    'INVOICE NO: 10482',
    'TABLE: 7',
    'DATE: 12/09/2026',
    'ITEM PRICE QTY TOTAL',
    'MUTTON BIRIYANI RS 400 4 RS 1600',
    'TANDOORI ROTI RS 30 5 RS 150',
    'CHILLY CHICKEN RS 250 2 RS 500',
    'CHICKEN PEPPER RS 250 3 RS 750',
    'SUB-TOTAL RS 3000',
    'CGST 2.5% RS 75',
    'SGST 2.5% RS 75',
    'TOTAL RS 3150',
    'MODE: UPI',
    'THANK YOU, VISIT AGAIN',
  ];

  // 1. Generate clean image
  const cleanPng = renderReceiptPng(receiptLines);
  const cleanPath = path.join(destDir, 'receipt-clean.png');
  fs.writeFileSync(cleanPath, PNG.sync.write(cleanPng));
  console.log(`[Generated] ${cleanPath}`);

  // 2. Generate blurry image
  const blurryPng = createBlurryPng(cleanPng);
  const blurryPath = path.join(destDir, 'receipt-blurry.png');
  fs.writeFileSync(blurryPath, PNG.sync.write(blurryPng));
  console.log(`[Generated] ${blurryPath}`);

  // 3. Run Node OCR using Tesseract.js
  const langPath = path.join(process.cwd(), 'node_modules', '@tesseract.js-data', 'eng', '4.0.0');
  const worker = await createWorker('eng', 1, {
    langPath,
    gzip: true,
  });

  await worker.setParameters({
    tessedit_pageseg_mode: '6' as any,
    preserve_interword_spaces: '1',
  });

  // OCR Clean Receipt
  console.log('\n--- Running OCR on receipt-clean.png ---');
  const cleanResult = await worker.recognize(cleanPath);
  const cleanParsed = parseReceipt(cleanResult.data.text);
  console.log('Clean OCR items found:', cleanParsed.items.length);
  cleanParsed.items.forEach((it) => {
    console.log(`  - ${it.name}: Rs ${(it.pricePaise / 100).toFixed(2)} (repaired: ${it.repaired})`);
  });
  console.log(`Subtotal: Rs ${((cleanParsed.subtotalPaise || 0) / 100).toFixed(2)} | Total: Rs ${((cleanParsed.totalPaise || 0) / 100).toFixed(2)} | Tax: Rs ${((cleanParsed.taxPaise || 0) / 100).toFixed(2)}`);

  // OCR Blurry Receipt
  console.log('\n--- Running OCR on receipt-blurry.png ---');
  const blurryResult = await worker.recognize(blurryPath);
  const blurryParsed = parseReceipt(blurryResult.data.text);
  console.log('Blurry OCR items found:', blurryParsed.items.length);
  console.log('Blurry Table found:', blurryParsed.tableFound);

  // Check test-fixtures/receipt.jpg
  const userFixturePath = path.join(process.cwd(), 'test-fixtures', 'receipt.jpg');
  if (fs.existsSync(userFixturePath)) {
    console.log('\n--- Running OCR on test-fixtures/receipt.jpg ---');
    const userResult = await worker.recognize(userFixturePath);
    console.log('Raw OCR lines:');
    console.log(userResult.data.text);
    const userParsed = parseReceipt(userResult.data.text);
    console.log('Parsed items:', userParsed.items);
  } else {
    console.log('\ntest-fixtures/receipt.jpg: Not present in repository.');
  }

  await worker.terminate();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
