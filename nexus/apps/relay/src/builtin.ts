import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile, realpath } from 'node:fs/promises';
import { arch, cpus, freemem, homedir, hostname, platform, release, totalmem, uptime } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep, basename } from 'node:path';
import type { RelayConfig } from './config';
import type { ManagedTool, ToolCallResult } from './servers';

const MAX_READ = 2 * 1024 * 1024;
const text = (t: string, isError = false): ToolCallResult => ({ content: [{ type: 'text', text: t }], isError });

export class PathGuard {
  constructor(private readonly roots: string[]) {}

  /** Resolves a user path inside one of the allowed roots (symlinks resolved), or throws. */
  async resolve(p: string, mustExist = true): Promise<string> {
    if (!this.roots.length) throw new Error('Нет разрешённых папок (allowedDirs в config.json)');
    const first = this.roots[0]!;
    const abs = isAbsolute(p) ? resolve(p) : resolve(first, p);
    let real: string;
    try {
      real = await realpath(abs);
    } catch {
      if (mustExist) throw new Error(`Путь не найден: ${p}`);
      // Resolve the deepest existing ancestor so symlinked parents cannot escape the roots.
      let ancestor = dirname(abs);
      const rest = [basename(abs)];
      for (;;) {
        const r = await realpath(ancestor).catch(() => null);
        if (r) {
          real = join(r, ...rest.reverse());
          break;
        }
        const up = dirname(ancestor);
        if (up === ancestor) throw new Error(`Папка не найдена: ${dirname(p)}`);
        rest.push(basename(ancestor));
        ancestor = up;
      }
    }
    for (const root of this.roots) {
      const r = await realpath(root).catch(() => resolve(root));
      const rel = relative(r, real);
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return real;
    }
    throw new Error(`Доступ запрещён: ${p} вне разрешённых папок (${this.roots.join(', ')})`);
  }
}

function run(cmd: string, args: string[], input: string | undefined, timeoutMs: number, signal?: AbortSignal, cwd?: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd, shell: false, windowsHide: true });
    let out = '';
    let err = '';
    const cap = (s: string, add: string) => (s.length > 200_000 ? s : s + add);
    child.stdout.on('data', (d: Buffer) => (out = cap(out, d.toString())));
    child.stderr.on('data', (d: Buffer) => (err = cap(err, d.toString())));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => {
      clearTimeout(timer);
      rej(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      res({ code, out, err });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Splits a command line into argv honoring quotes; no shell expansion is performed. */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else cur += c;
  }
  if (q) throw new Error('Незакрытая кавычка в команде');
  if (has || cur) out.push(cur);
  return out;
}

export class BuiltinTools {
  private readonly guard: PathGuard;

  constructor(private readonly cfg: RelayConfig) {
    this.guard = new PathGuard(cfg.allowedDirs);
  }

  list(): ManagedTool[] {
    const tools: ManagedTool[] = [
      { name: 'pc_system_info', description: 'Информация о компьютере: ОС, CPU, память, аптайм, разрешённые папки.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
      {
        name: 'pc_list_dir',
        description: 'Список файлов и папок в разрешённой папке ПК.',
        inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Путь (относительно первой разрешённой папки или абсолютный)' } } },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'pc_read_file',
        description: 'Прочитать текстовый файл на ПК (до 2 МБ).',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'pc_write_file',
        description: 'Записать текстовый файл на ПК (создаёт папки при необходимости).',
        inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } }, required: ['path', 'content'] },
        annotations: { destructiveHint: true },
      },
      { name: 'pc_clipboard_get', description: 'Прочитать буфер обмена ПК.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
      { name: 'pc_clipboard_set', description: 'Записать текст в буфер обмена ПК.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
      { name: 'pc_open', description: 'Открыть ссылку или файл на ПК в программе по умолчанию.', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
    ];
    if (this.cfg.shell.enabled) {
      tools.push({
        name: 'pc_shell_exec',
        description: `Выполнить команду на ПК (без оболочки, без пайпов). ${this.cfg.shell.allow.length ? `Разрешены: ${this.cfg.shell.allow.join(', ')}.` : 'Разрешены любые команды.'}`,
        inputSchema: { type: 'object', properties: { command: { type: 'string', description: 'Команда с аргументами' }, cwd: { type: 'string', description: 'Рабочая папка (внутри разрешённых)' } }, required: ['command'] },
        annotations: { destructiveHint: true },
      });
    }
    return tools;
  }

  owns(name: string): boolean {
    return this.list().some((t) => t.name === name);
  }

  async call(name: string, a: Record<string, unknown>, signal?: AbortSignal): Promise<ToolCallResult> {
    try {
      switch (name) {
        case 'pc_system_info':
          return text(
            JSON.stringify(
              {
                hostname: hostname(),
                platform: `${platform()} ${release()} ${arch()}`,
                cpu: `${cpus()[0]?.model ?? '?'} × ${cpus().length}`,
                memory: `${(freemem() / 2 ** 30).toFixed(1)} / ${(totalmem() / 2 ** 30).toFixed(1)} ГБ свободно`,
                uptimeHours: +(uptime() / 3600).toFixed(1),
                home: homedir(),
                allowedDirs: this.cfg.allowedDirs,
                inbox: this.cfg.inboxDir,
                shell: this.cfg.shell.enabled,
              },
              null,
              2,
            ),
          );
        case 'pc_list_dir': {
          const dir = await this.guard.resolve(typeof a.path === 'string' && a.path ? a.path : this.cfg.allowedDirs[0]!);
          const entries = await readdir(dir, { withFileTypes: true });
          const rows = await Promise.all(
            entries.slice(0, 500).map(async (e) => {
              if (e.isDirectory()) return `📁 ${e.name}${sep}`;
              const s = await stat(join(dir, e.name)).catch(() => null);
              return `📄 ${e.name}${s ? ` (${s.size} Б, ${s.mtime.toISOString().slice(0, 16).replace('T', ' ')})` : ''}`;
            }),
          );
          return text(`${dir}\n${rows.join('\n') || '(пусто)'}${entries.length > 500 ? `\n…и ещё ${entries.length - 500}` : ''}`);
        }
        case 'pc_read_file': {
          const f = await this.guard.resolve(String(a.path));
          const s = await stat(f);
          if (!s.isFile()) return text('Это не файл', true);
          if (s.size > MAX_READ) return text(`Файл слишком большой (${s.size} Б, максимум ${MAX_READ})`, true);
          const buf = await readFile(f);
          if (buf.includes(0)) return text('Файл бинарный — чтение как текст невозможно', true);
          return text(buf.toString('utf8'));
        }
        case 'pc_write_file': {
          const f = await this.guard.resolve(String(a.path), false);
          await mkdir(dirname(f), { recursive: true });
          await writeFile(f, String(a.content ?? ''), { flag: a.append ? 'a' : 'w' });
          return text(`Записано: ${f}`);
        }
        case 'pc_clipboard_get': {
          const p = platform();
          const r = p === 'win32' ? await run('powershell', ['-NoProfile', '-Command', 'Get-Clipboard'], undefined, 10_000, signal) : p === 'darwin' ? await run('pbpaste', [], undefined, 10_000, signal) : await run('xclip', ['-selection', 'clipboard', '-o'], undefined, 10_000, signal).catch(() => run('wl-paste', [], undefined, 10_000, signal));
          return text(r.out || '(буфер пуст)');
        }
        case 'pc_clipboard_set': {
          const p = platform();
          const t = String(a.text ?? '');
          if (p === 'win32') await run('clip', [], t, 10_000, signal);
          else if (p === 'darwin') await run('pbcopy', [], t, 10_000, signal);
          else await run('xclip', ['-selection', 'clipboard'], t, 10_000, signal).catch(() => run('wl-copy', [], t, 10_000, signal));
          return text('Скопировано в буфер обмена ПК');
        }
        case 'pc_open': {
          const target = String(a.target);
          const isUrl = /^https?:\/\//i.test(target);
          const path = isUrl ? target : await this.guard.resolve(target);
          const p = platform();
          if (p === 'win32') await run('explorer.exe', [path], undefined, 10_000, signal);
          else await run(p === 'darwin' ? 'open' : 'xdg-open', [path], undefined, 10_000, signal);
          return text(`Открыто: ${path}`);
        }
        case 'pc_shell_exec': {
          if (!this.cfg.shell.enabled) return text('Выполнение команд отключено в config.json (shell.enabled)', true);
          const argv = splitArgs(String(a.command ?? ''));
          const cmd = argv[0];
          if (!cmd) return text('Пустая команда', true);
          const base = basename(cmd).replace(/\.(exe|cmd|bat)$/i, '');
          if (this.cfg.shell.allow.length && !this.cfg.shell.allow.includes(base)) return text(`Команда "${base}" не в списке разрешённых: ${this.cfg.shell.allow.join(', ')}`, true);
          const cwd = typeof a.cwd === 'string' && a.cwd ? await this.guard.resolve(a.cwd) : this.cfg.allowedDirs[0];
          const r = await run(cmd, argv.slice(1), undefined, this.cfg.shell.timeoutMs, signal, cwd);
          return text(`exit ${r.code}\n${r.out}${r.err ? `\n[stderr]\n${r.err}` : ''}`.slice(0, 100_000), r.code !== 0);
        }
        default:
          return text(`Неизвестный инструмент ${name}`, true);
      }
    } catch (e) {
      return text((e as Error).message, true);
    }
  }
}
