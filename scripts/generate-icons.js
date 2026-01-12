#!/usr/bin/env node
/**
 * Simple icon generator script
 * Creates placeholder PNG icons for PWA
 *
 * Usage: node scripts/generate-icons.js
 *
 * Note: This creates very simple colored squares as placeholders.
 * Replace with proper icons before production deployment.
 */

const fs = require('fs');
const path = require('path');

// Create a minimal 1x1 green PNG (base64 encoded)
// This is a tiny green square that will be scaled by the browser
const createMinimalPNG = () => {
  // Minimal PNG: 1x1 green pixel (#22c55e)
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==',
    'base64'
  );
};

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate placeholder icons
const png = createMinimalPNG();

sizes.forEach(size => {
  const filename = size === 180
    ? 'apple-touch-icon.png'
    : `icon-${size}x${size}.png`;

  const filepath = path.join(iconsDir, filename);
  fs.writeFileSync(filepath, png);
  console.log(`✓ Created ${filename}`);
});

console.log('\n✅ Placeholder icons generated successfully!');
console.log('⚠️  Remember to replace with proper icons before production deployment.\n');
