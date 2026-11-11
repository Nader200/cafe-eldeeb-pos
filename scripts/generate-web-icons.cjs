const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generate() {
  const b64Text = fs.readFileSync('src/assets/images/eldeeb_logo_base64.txt', 'utf8').trim();
  const cleanB64 = b64Text.replace(/^data:image\/[a-z]+;base64,/, '');
  const logoBuffer = Buffer.from(cleanB64, 'base64');

  console.log('Original Logo Buffer size:', logoBuffer.length);

  // 1. 512x512 regular
  const icon512 = await sharp(logoBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync('public/icon-512.png', icon512);
  console.log('Generated public/icon-512.png:', icon512.length, 'bytes');

  // 2. 192x192 regular
  const icon192 = await sharp(logoBuffer)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync('public/icon-192.png', icon192);
  console.log('Generated public/icon-192.png:', icon192.length, 'bytes');

  // 3. Apple Touch Icon 180x180 (with rich black background for iOS home screens)
  const appleTouch = await sharp(logoBuffer)
    .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: 10,
      bottom: 10,
      left: 10,
      right: 10,
      background: { r: 10, g: 10, b: 10, alpha: 1 }
    })
    .png()
    .toBuffer();
  fs.writeFileSync('public/apple-touch-icon.png', appleTouch);
  console.log('Generated public/apple-touch-icon.png:', appleTouch.length, 'bytes');

  // 4. Maskable 512x512 (with safe-zone 80% and dark background)
  const maskable512Inner = await sharp(logoBuffer)
    .resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const maskable512 = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 8, g: 8, b: 8, alpha: 1 }
    }
  })
    .composite([{ input: maskable512Inner, gravity: 'center' }])
    .png()
    .toBuffer();
  fs.writeFileSync('public/pwa-maskable-512.png', maskable512);
  console.log('Generated public/pwa-maskable-512.png:', maskable512.length, 'bytes');

  // 5. Maskable 192x192 (with safe-zone 80% and dark background)
  const maskable192Inner = await sharp(logoBuffer)
    .resize(154, 154, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const maskable192 = await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r: 8, g: 8, b: 8, alpha: 1 }
    }
  })
    .composite([{ input: maskable192Inner, gravity: 'center' }])
    .png()
    .toBuffer();
  fs.writeFileSync('public/pwa-maskable-192.png', maskable192);
  console.log('Generated public/pwa-maskable-192.png:', maskable192.length, 'bytes');

  // 6. Favicon 64x64 PNG
  const favicon64 = await sharp(logoBuffer)
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync('public/favicon.png', favicon64);
  fs.writeFileSync('public/favicon.ico', favicon64);
  console.log('Generated public/favicon.png and public/favicon.ico');

  // Also update Android icons
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  densities.forEach((density) => {
    const dir = path.join('android/app/src/main/res', `mipmap-${density}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), logoBuffer);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), logoBuffer);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), logoBuffer);
  });
  console.log('Updated Android launcher mipmaps.');

  console.log('ALL ICONS GENERATED SUCCESSFULLY!');
}

generate().catch(console.error);
