import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { fetchWithTimeout } from './net';

export interface UpdateInfo {
  version: string;
  tag: string;
  notes: string;
  assetName: string;
  assetUrl: string;
  size: number;
  sha256?: string;
  pageUrl: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { updateRepo?: string; releaseTagPrefix?: string };

export function currentVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^[^\d]*/, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^[^\d]*/, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function preferredAbi(): string {
  const archs = Device.supportedCpuArchitectures ?? [];
  if (archs.includes('arm64-v8a')) return 'arm64-v8a';
  if (archs.includes('armeabi-v7a')) return 'armeabi-v7a';
  return 'universal';
}

/** Looks for a newer `nexus-v*` GitHub release with an APK for this device's ABI. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const repo = extra.updateRepo;
  const prefix = extra.releaseTagPrefix ?? 'nexus-v';
  if (!repo) return null;
  const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}/releases?per_page=15`, { headers: { Accept: 'application/vnd.github+json' } }, 15_000);
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  const releases = (await res.json()) as { tag_name: string; draft: boolean; body?: string; html_url: string; assets: { name: string; browser_download_url: string; size: number }[] }[];
  const rel = releases.filter((r) => !r.draft && r.tag_name.startsWith(prefix)).sort((a, b) => compareVersions(b.tag_name.slice(prefix.length), a.tag_name.slice(prefix.length)))[0];
  if (!rel) return null;
  const version = rel.tag_name.slice(prefix.length);
  if (compareVersions(version, currentVersion()) <= 0) return null;
  const abi = preferredAbi();
  const apk = rel.assets.find((a) => a.name.endsWith('.apk') && a.name.includes(abi)) ?? rel.assets.find((a) => a.name.endsWith('.apk') && a.name.includes('universal'));
  if (!apk) return null;
  let sha256: string | undefined;
  const sums = rel.assets.find((a) => a.name === 'SHA256SUMS.txt');
  if (sums) {
    const r = await fetchWithTimeout(sums.browser_download_url, {}, 15_000).catch(() => null);
    const text = r?.ok ? await r.text() : '';
    sha256 = text
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .find((p) => p[1]?.replace(/^\*/, '') === apk.name)?.[0]
      ?.toLowerCase();
  }
  return { version, tag: rel.tag_name, notes: rel.body ?? '', assetName: apk.name, assetUrl: apk.browser_download_url, size: apk.size, sha256, pageUrl: rel.html_url };
}

export async function downloadAndInstall(u: UpdateInfo, onProgress: (fraction: number) => void): Promise<void> {
  const dest = new File(Paths.cache, u.assetName);
  if (dest.exists) dest.delete();
  const { DownloadTask } = await import('expo-file-system');
  const task = new DownloadTask(u.assetUrl, dest);
  const sub = task.addListener('progress', (p) => {
    const total = p.totalBytes > 0 ? p.totalBytes : u.size;
    if (total > 0) onProgress(Math.min(p.bytesWritten / total, 1));
  });
  let file: File | null;
  try {
    file = await task.downloadAsync();
  } finally {
    sub.remove();
    task.release();
  }
  if (!file) throw new Error('Загрузка прервана');
  if (u.sha256) {
    const digest = (await file.digest('SHA-256')).toLowerCase();
    if (digest !== u.sha256) {
      file.delete();
      throw new Error('Контрольная сумма APK не совпала — файл повреждён');
    }
  }
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
}
