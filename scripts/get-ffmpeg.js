// scripts/get-ffmpeg.js
import { createWriteStream } from 'node:fs';
import { chmodSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { request } from 'node:https';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'; // static Linux x64
const destDir = './bin';
mkdirSync(destDir, { recursive: true });

function fetch(url) {
  return new Promise((resolve, reject) => {
    request(url, res => {
      if (res.statusCode !== 200) reject(new Error('HTTP ' + res.statusCode));
      else resolve(res);
    }).on('error', reject).end();
  });
}

const tarPath = join(destDir, 'ffmpeg.tar.xz');
const out = createWriteStream(tarPath);
const res = await fetch(url);
await pipeline(res, out);

// Extract and place ./bin/ffmpeg
import { execSync } from 'node:child_process';
execSync(`tar -xJf ${tarPath} -C ${destDir} --strip-components=1`);
chmodSync(join(destDir, 'ffmpeg'), 0o755);
