// scripts/get-ffmpeg.js
import { createWriteStream, chmodSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { request } from 'node:https';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const destDir = './bin';
mkdirSync(destDir, { recursive: true });

// Prefer a gzip archive so we don't need xz on the build image.
// Use a mirror that provides .tar.gz for Linux x64 static builds.
// (If your mirror only has .tar.xz, switch to Option 1 or 2 above.)
const url = process.env.FFMPEG_TARGZ_URL || 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg-6.1.1-amd64.tar.gz';

function fetch(url) {
  return new Promise((resolve, reject) => {
    request(url, res => {
      if (res.statusCode !== 200) reject(new Error('HTTP ' + res.statusCode));
      else resolve(res);
    }).on('error', reject).end();
  });
}

const tarPath = join(destDir, 'ffmpeg.tar.gz');
const out = createWriteStream(tarPath);
const res = await fetch(url);
await pipeline(res, out);

try {
  // Extract gzip (no xz dependency required)
  execSync(`tar -xzf ${tarPath} -C ${destDir} --strip-components=1`, { stdio: 'inherit' });
} catch (e) {
  console.error('Failed to extract ffmpeg .tar.gz:', e.message);
  process.exit(1);
}

// Make sure the binary is executable and in a known place
const bin = join(destDir, 'ffmpeg');
chmodSync(bin, 0o755);
console.log('ffmpeg ready at', bin);
