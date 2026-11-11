const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  // 1. Load the authentic high-resolution Eldeeb Logo PNG buffer from base64
  const b64Text = fs.readFileSync('src/assets/images/eldeeb_logo_base64.txt', 'utf8').trim();
  const cleanB64 = b64Text.replace(/^data:image\/[a-z]+;base64,/, '');
  const logoBuffer = Buffer.from(cleanB64, 'base64');

  console.log('Authentic Logo PNG size:', logoBuffer.length, 'bytes');
  console.log('PNG Header check:', logoBuffer.subarray(0, 8));

  // Android mipmaps
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  densities.forEach((density) => {
    const dir = path.join('android/app/src/main/res', `mipmap-${density}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), logoBuffer);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), logoBuffer);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), logoBuffer);
    console.log(`Updated mipmap-${density} with authentic Eldeeb Logo.`);
  });

  // Web and PWA icons
  const icon512 = await sharp(logoBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync('public/icon-512.png', icon512);

  const icon192 = await sharp(logoBuffer)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync('public/icon-192.png', icon192);

  const appleTouch = await sharp(logoBuffer)
    .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 10, g: 10, b: 10, alpha: 1 } })
    .png()
    .toBuffer();
  fs.writeFileSync('public/apple-touch-icon.png', appleTouch);

  const maskable512Inner = await sharp(logoBuffer)
    .resize(410, 410, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const maskable512 = await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 8, g: 8, b: 8, alpha: 1 } }
  })
    .composite([{ input: maskable512Inner, gravity: 'center' }])
    .png()
    .toBuffer();
  fs.writeFileSync('public/pwa-maskable-512.png', maskable512);

  const maskable192Inner = await sharp(logoBuffer)
    .resize(154, 154, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const maskable192 = await sharp({
    create: { width: 192, height: 192, channels: 4, background: { r: 8, g: 8, b: 8, alpha: 1 } }
  })
    .composite([{ input: maskable192Inner, gravity: 'center' }])
    .png()
    .toBuffer();
  fs.writeFileSync('public/pwa-maskable-192.png', maskable192);

  const favicon64 = await sharp(logoBuffer)
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync('public/favicon.png', favicon64);
  fs.writeFileSync('public/favicon.ico', favicon64);

  console.log('All launcher, PWA, and Web icons updated with authentic Eldeeb Logo!');
}

main().catch(console.error);
