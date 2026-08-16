const fs = require('fs');
const path = require('path');

// 1. Load the authentic high-resolution Eldeeb Logo PNG buffer from base64
const b64Text = fs.readFileSync('src/assets/images/eldeeb_logo_base64.txt', 'utf8').trim();
const cleanB64 = b64Text.replace(/^data:image\/[a-z]+;base64,/, '');
const logoBuffer = Buffer.from(cleanB64, 'base64');

console.log('Authentic Logo PNG size:', logoBuffer.length, 'bytes');
console.log('PNG Header check:', logoBuffer.subarray(0, 8));

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

densities.forEach((density) => {
  const dir = path.join('android/app/src/main/res', `mipmap-${density}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write authentic binary PNGs directly
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), logoBuffer);
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), logoBuffer);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), logoBuffer);
  console.log(`Updated mipmap-${density} with authentic Eldeeb Logo.`);
});

console.log('All launcher icons updated with valid binary PNGs!');
