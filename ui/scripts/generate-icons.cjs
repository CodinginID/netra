/**
 * Generate favicon and PWA icons from SVG logo.
 * Uses a simple approach: render SVG to canvas via node-canvas or output base64 PNG.
 * 
 * Since we may not have node-canvas installed, this script generates
 * a simple ICO file header + bitmap data directly.
 */

const fs = require('fs');
const path = require('path');

// SVG source
const svgPath = path.join(__dirname, '../src/assets/netra-logo.svg');
// The ICO below is drawn from scratch; we only assert the source logo exists so
// the script still fails fast when the asset is missing or moved.
fs.accessSync(svgPath);

// Output directory
const publicDir = path.join(__dirname, '../public');

console.log('SVG Logo loaded from:', svgPath);
console.log('Output directory:', publicDir);

// For ICO file generation, we need a simpler approach.
// Let's generate a 32x32 PNG using a minimal PNG encoder.
// Actually, let's just output the SVG as a data URI reference in HTML
// and generate a simple fallback ICO.

// Simple 32x32 favicon.ico (minimal 16x16 BMP embedded in ICO format)
// This is a teal (#0d9488) square with a white dot in center

// _color/_centerX/_centerY/_radius are kept in the signature to document the
// intended call shape; the current implementation hardcodes the teal square.
function createMinimalICO(size, _color, _centerX, _centerY, _radius) {
  // Create raw BMP bitmap data (32x32, 32-bit with alpha)
  const w = size;
  const h = size;
  const bitmapSize = w * h * 4; // RGBA
  const bitmap = Buffer.alloc(bitmapSize);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      
      // Rounded rect check
      const cornerRadius = size * 0.15;
      const dx = x < cornerRadius ? cornerRadius - 1 - x : 
                 x >= w - cornerRadius ? x - (w - cornerRadius) : 0;
      const dy = y < cornerRadius ? cornerRadius - 1 - y : 
                 y >= h - cornerRadius ? y - (h - cornerRadius) : 0;
      
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dx > 0 && dy > 0 && dist > cornerRadius) {
        // Outside rounded corner - transparent
        bitmap[idx] = 0;
        bitmap[idx + 1] = 0;
        bitmap[idx + 2] = 0;
        bitmap[idx + 3] = 0;
        continue;
      }
      
      // Background color: teal gradient
      const gradientT = (x + y) / (w + h);
      const r = Math.round(13 + (0 - 13) * gradientT);
      const g = Math.round(148 + (99 - 148) * gradientT);
      const b = Math.round(136 + (135 - 136) * gradientT);
      
      bitmap[idx] = r;
      bitmap[idx + 1] = g;
      bitmap[idx + 2] = b;
      bitmap[idx + 3] = 255;
      
      // Eye shape (simplified) - white outline + pupil
      const eyeCX = w / 2;
      const eyeCY = h / 2;
      const eyeRX = w * 0.35;
      const eyeRY = h * 0.25;
      
      // Ellipse distance for eye outline
      const eyeDist = Math.sqrt(
        Math.pow((x - eyeCX) / eyeRX, 2) + 
        Math.pow((y - eyeCY) / eyeRY, 2)
      );
      
      // Pupil
      const pupilDist = Math.sqrt(Math.pow(x - eyeCX, 2) + Math.pow(y - eyeCY, 2));
      const pupilR = size * 0.1;
      
      if (pupilDist < pupilR) {
        // Pupil - darker teal
        bitmap[idx] = Math.round(r * 0.4);
        bitmap[idx + 1] = Math.round(g * 0.4);
        bitmap[idx + 2] = Math.round(b * 0.4);
      } else if (Math.abs(eyeDist - 1) < 0.12) {
        // Eye outline - white
        bitmap[idx] = 255;
        bitmap[idx + 1] = 255;
        bitmap[idx + 2] = 255;
      } else if (eyeDist < 0.85) {
        // Inside eye - slightly lighter
        bitmap[idx] = Math.min(255, r + 30);
        bitmap[idx + 1] = Math.min(255, g + 30);
        bitmap[idx + 2] = Math.min(255, b + 30);
      }
    }
  }
  
  // ICO file format: header + entry + BMP (XOR bitmap only for 32-bit)
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);  // Reserved
  icoHeader.writeUInt16LE(1, 2);  // Type: 1 = ICO
  icoHeader.writeUInt16LE(1, 4);  // Count: 1 image
  
  // ICO directory entry (16 bytes)
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);  // Width
  entry.writeUInt8(size >= 256 ? 0 : size, 1);  // Height
  entry.writeUInt8(0, 2);  // Color palette
  entry.writeUInt8(0, 3);  // Reserved
  entry.writeUInt16LE(1, 4);  // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  
  // BMP header (BITMAPINFOHEADER) - for ICO, we need height = 2*actual (XOR+AND masks)
  const bmpHeaderSize = 40;
  const bmpSize = bmpHeaderSize + bitmapSize;
  entry.writeUInt32LE(bmpSize, 8);  // Size of image data
  entry.writeUInt32LE(icoHeader.length + entry.length, 12); // Offset to image data
  
  // BMP header
  const bmpHeader = Buffer.alloc(bmpHeaderSize);
  bmpHeader.writeUInt32LE(40, 0);  // Header size
  bmpHeader.writeInt32LE(w, 4);    // Width
  bmpHeader.writeInt32LE(h * 2, 8); // Height (doubled for XOR+AND)
  bmpHeader.writeUInt16LE(1, 12);  // Planes
  bmpHeader.writeUInt16LE(32, 14); // Bits per pixel
  bmpHeader.writeUInt32LE(0, 16);  // Compression (none)
  bmpHeader.writeUInt32LE(bitmapSize, 20); // Image size
  bmpHeader.writeInt32LE(0, 24);   // X pixels per meter
  bmpHeader.writeInt32LE(0, 28);   // Y pixels per meter
  bmpHeader.writeUInt32LE(0, 32);  // Colors used
  bmpHeader.writeUInt32LE(0, 36);  // Important colors
  
  // AND mask (transparent, all zeros for 32-bit alpha icons)
  const andMaskSize = w * Math.ceil(h / 8);
  const andMask = Buffer.alloc(andMaskSize, 0);
  
  // Combine
  const icoFile = Buffer.concat([
    icoHeader,
    entry,
    bmpHeader,
    bitmap,
    andMask
  ]);
  
  return icoFile;
}

// Generate 32x32 favicon.ico
const favicon32 = createMinimalICO(32, [13, 148, 136], 16, 16, 4);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), favicon32);
console.log('✓ Generated favicon.ico (32x32)');

// Generate simple PNG icons using raw bitmap + minimal PNG
// For proper PNG we'd need a library, so let's at least generate the SVG for reference
console.log('\nFor PNG icons, open the SVG in a browser and screenshot at each size, or use:');
console.log('  npx svg2png src/assets/netra-logo.svg -o public/favicon-32x32.png -w 32 -h 32');
console.log('\nAlternatively, the SVG can be used directly as favicon in modern browsers.');

console.log('\nDone!');
