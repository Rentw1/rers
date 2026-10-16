#!/usr/bin/env node
// Builds signed release APKs (arm64-v8a, armeabi-v7a, universal) into apps/mobile/dist.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = platform() === 'win32';
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = process.env.NEXUS_VERSION_NAME || pkg.version;

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function checkJava() {
  const r = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (r.error) fail('Не найдена Java. Установите JDK 17: https://adoptium.net/temurin/releases/?version=17');
  const out = `${r.stderr}${r.stdout}`;
  const m = /version "(\d+)/.exec(out);
  const major = m ? Number(m[1]) : 0;
  if (major < 17) fail(`Нужна JDK 17 или новее, найдена ${major || 'неизвестная версия'}. https://adoptium.net`);
}

function androidHome() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Android', 'Sdk'), join(homedir(), 'Library', 'Android', 'sdk'), join(homedir(), 'AppData', 'Local', 'Android', 'Sdk')].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) fail('Не найден Android SDK. Установите Android Studio или command-line tools: https://developer.android.com/studio#command-line-tools-only и задайте ANDROID_HOME.');
  return found;
}

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
}

checkJava();
const sdk = androidHome();
if (!process.env.NEXUS_KEYSTORE_PATH) {
  console.warn('⚠ NEXUS_KEYSTORE_PATH не задан — APK будет подписан общим ключом signing/nexus-shared.keystore. Для своей подписи: scripts/gen-keystore.sh');
}

run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], { cwd: root, env: { ...process.env, CI: '1' } });
writeFileSync(join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);
run(isWin ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--no-daemon', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'], { cwd: join(root, 'android') });

const outDir = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const sums = [];
for (const f of readdirSync(outDir).filter((n) => n.endsWith('.apk'))) {
  const abi = /app-(.+)-release\.apk/.exec(f)?.[1] ?? 'universal';
  const name = `nexus-${version}-${abi}.apk`;
  copyFileSync(join(outDir, f), join(dist, name));
  sums.push(`${createHash('sha256').update(readFileSync(join(dist, name))).digest('hex')}  ${name}`);
}
if (!sums.length) fail(`APK не найдены в ${outDir}`);
writeFileSync(join(dist, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
console.log(`\n✔ Готово:\n${sums.map((s) => `  ${join(dist, s.split('  ')[1])}`).join('\n')}\n`);
