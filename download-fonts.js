/**
 * download-fonts.js
 * Run once from your project root to fetch all required woff2 font files.
 * Usage:  node download-fonts.js
 * Requires: Node.js 18+ (uses built-in fetch)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'fonts');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FONTS = [
  { url: 'https://fonts.googleapis.com/css2?family=Syne:wght@400&display=swap',             out: 'Syne-Regular.woff2' },
  { url: 'https://fonts.googleapis.com/css2?family=Syne:wght@600&display=swap',             out: 'Syne-SemiBold.woff2' },
  { url: 'https://fonts.googleapis.com/css2?family=Syne:wght@700&display=swap',             out: 'Syne-Bold.woff2' },
  { url: 'https://fonts.googleapis.com/css2?family=Syne:wght@800&display=swap',             out: 'Syne-ExtraBold.woff2' },
  { url: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300&display=swap',   out: 'DMMono-Light.woff2' },
  { url: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400&display=swap',   out: 'DMMono-Regular.woff2' },
  { url: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@1,300&display=swap',   out: 'DMMono-LightItalic.woff2' },
];

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, headers));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

async function fetchWoff2Url(cssUrl) {
  const { body } = await get(cssUrl, { 'User-Agent': UA });
  const css = body.toString('utf8');
  const match = css.match(/url\((https:\/\/[^)]+\.woff2)\)/);
  if (!match) throw new Error(`No woff2 URL found in: ${cssUrl}`);
  return match[1];
}

async function downloadFont(cssUrl, filename) {
  const woff2Url = await fetchWoff2Url(cssUrl);
  const { status, body } = await get(woff2Url, { 'User-Agent': UA });
  if (status !== 200) throw new Error(`HTTP ${status} for ${woff2Url}`);
  const dest = path.join(FONTS_DIR, filename);
  fs.writeFileSync(dest, body);
  const kb = (body.length / 1024).toFixed(1);
  console.log(`  ✓ ${filename} (${kb} KB)`);
}

async function main() {
  console.log('NEURON — Local font downloader');
  console.log('================================\n');

  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
    console.log(`Created: ${FONTS_DIR}\n`);
  }

  let ok = 0;
  for (const { url, out } of FONTS) {
    try {
      await downloadFont(url, out);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${out}: ${err.message}`);
    }
  }

  console.log(`\n${ok}/${FONTS.length} fonts downloaded to: ${FONTS_DIR}`);
  if (ok === FONTS.length) {
    console.log('All done — you can delete this script if you like.');
  }
}

main();
