import type { ToolSpec } from './types';

export interface NamedTool<Ref> {
  spec: ToolSpec;
  ref: Ref;
}

/**
 * Exposes tools from several sources under provider-safe names (^[a-zA-Z0-9_-]{1,64}$),
 * unique across sources, and resolves model calls back to their source.
 */
export class ToolRegistry<Ref> {
  private readonly byName = new Map<string, NamedTool<Ref>>();

  static sanitize(name: string): string {
    const s = name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return (s || 'tool').slice(0, 64);
  }

  add(prefix: string, spec: ToolSpec, ref: Ref): string {
    const base = (prefix ? `${ToolRegistry.sanitize(prefix).slice(0, 20)}__${ToolRegistry.sanitize(spec.name)}` : ToolRegistry.sanitize(spec.name)).slice(0, 64);
    let name = base;
    for (let i = 2; this.byName.has(name); i++) {
      const suffix = `_${i}`;
      name = base.slice(0, 64 - suffix.length) + suffix;
    }
    this.byName.set(name, { spec: { ...spec, name, inputSchema: normalizeSchema(spec.inputSchema) }, ref });
    return name;
  }

  resolve(name: string): NamedTool<Ref> | undefined {
    return this.byName.get(name);
  }

  specs(): ToolSpec[] {
    return [...this.byName.values()].map((t) => t.spec);
  }

  get size(): number {
    return this.byName.size;
  }
}

export function normalizeSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const s = schema && typeof schema === 'object' ? { ...schema } : {};
  if (s.type !== 'object') s.type = 'object';
  if (!s.properties || typeof s.properties !== 'object') s.properties = {};
  return s;
}

/** Minimal JSON-Schema check (required + primitive types) used before running a tool with model-produced input. */
export function validateInput(schema: Record<string, unknown>, input: Record<string, unknown>): string | null {
  if ('__invalid_json' in input) return 'Аргументы не являются корректным JSON';
  if ('__truncated' in input) return 'Аргументы обрезаны лимитом токенов';
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const r of required) if (!(r in input) || input[r] === undefined) return `Отсутствует обязательный параметр "${r}"`;
  const props = (schema.properties ?? {}) as Record<string, { type?: string | string[]; enum?: unknown[] }>;
  for (const [k, v] of Object.entries(input)) {
    const p = props[k];
    if (!p?.type) continue;
    const types = Array.isArray(p.type) ? p.type : [p.type];
    const actual = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    const ok = types.some((t) => t === actual || (t === 'integer' && typeof v === 'number' && Number.isInteger(v)) || (t === 'number' && typeof v === 'number'));
    if (!ok) return `Параметр "${k}" должен быть типа ${types.join('|')}`;
    if (p.enum && !p.enum.includes(v)) return `Параметр "${k}" должен быть одним из: ${p.enum.join(', ')}`;
  }
  return null;
}
