const fs = require('fs');
const cp = require('child_process');
const path = require('path');

console.log('=== GENERATING ICONS FROM MASTER BASE64 LOGO ===');
const b64Path = path.join(__dirname, '../src/assets/images/eldeeb_logo_base64.txt');
if (!fs.existsSync(b64Path)) {
  console.error('Base64 logo file not found:', b64Path);
  process.exit(1);
}

const b64Text = fs.readFileSync(b64Path, 'utf8').trim();
const cleanB64 = b64Text.replace(/^data:image\/[a-z]+;base64,/, '');
const masterBuf = Buffer.from(cleanB64, 'base64');
const tmpMaster = '/tmp/eldeeb_master.png';
fs.writeFileSync(tmpMaster, masterBuf);

const densities = {
  'mipmap-mdpi': { icon: 48, fg: 108, fgLogo: 76, iconLogo: 42 },
  'mipmap-hdpi': { icon: 72, fg: 162, fgLogo: 114, iconLogo: 62 },
  'mipmap-xhdpi': { icon: 96, fg: 216, fgLogo: 152, iconLogo: 84 },
  'mipmap-xxhdpi': { icon: 144, fg: 324, fgLogo: 228, iconLogo: 124 },
  'mipmap-xxxhdpi': { icon: 192, fg: 432, fgLogo: 304, iconLogo: 168 }
};

for (const [dir, sz] of Object.entries(densities)) {
  const targetDir = path.join(__dirname, '../android/app/src/main/res', dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const fgPath = path.join(targetDir, 'ic_launcher_foreground.png');
  cp.execSync(`convert ${tmpMaster} -resize ${sz.fgLogo}x${sz.fgLogo} -background none -gravity center -extent ${sz.fg}x${sz.fg} png32:${fgPath}`);

  const iconPath = path.join(targetDir, 'ic_launcher.png');
  const roundPath = path.join(targetDir, 'ic_launcher_round.png');
  cp.execSync(`convert ${tmpMaster} -resize ${sz.iconLogo}x${sz.iconLogo} -background "#0D0A05" -gravity center -extent ${sz.icon}x${sz.icon} png32:${iconPath}`);
  cp.execSync(`cp "${iconPath}" "${roundPath}"`);
}

// Web / Resource icons
const pubDir = path.join(__dirname, '../public');
if (fs.existsSync(pubDir)) {
  cp.execSync(`convert ${tmpMaster} -resize 192x192 png32:${path.join(pubDir, 'icon-192.png')}`);
  cp.execSync(`convert ${tmpMaster} -resize 512x512 png32:${path.join(pubDir, 'icon-512.png')}`);
  cp.execSync(`convert ${tmpMaster} -resize 64x64 png32:${path.join(pubDir, 'favicon.png')}`);
  cp.execSync(`convert ${tmpMaster} -resize 512x512 png32:${path.join(pubDir, 'Logo.png')}`);
  cp.execSync(`convert ${tmpMaster} -resize 512x512 png32:${path.join(pubDir, 'Logo_transparent.png')}`);
  cp.execSync(`convert ${tmpMaster} -resize 180x180 png32:${path.join(pubDir, 'apple-touch-icon.png')}`);
}

const resDir = path.join(__dirname, '../resources');
if (fs.existsSync(resDir)) {
  cp.execSync(`convert ${tmpMaster} -resize 1024x1024 png32:${path.join(resDir, 'icon.png')}`);
  cp.execSync(`convert ${tmpMaster} -resize 2732x2732 -background "#0D0A05" -gravity center -extent 2732x2732 png32:${path.join(resDir, 'splash.png')}`);
}

if (fs.existsSync(tmpMaster)) {
  fs.unlinkSync(tmpMaster);
}

console.log('Successfully generated all icons for Android and Web from official Cafe Eldeeb logo.');
