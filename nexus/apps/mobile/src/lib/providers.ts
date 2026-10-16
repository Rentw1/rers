import { CATALOG, ProviderError, catalogEntry, createProvider, checkUrlSecurity, type LLMProvider, type ModelInfo, type ProviderConfig, type ProviderKind } from '@nexus/core';
import { appFetch } from './net';
import { refreshPriceBook } from './pricing';
import * as repo from './repo';
import { apiKeyName, getSecret, setSecret } from './secure';
import { uid } from './ids';

export async function bootstrapProviders(): Promise<void> {
  const existing = new Map((await repo.listProviders()).map((p) => [p.id, p]));
  for (const c of CATALOG) {
    if (existing.has(c.id)) continue;
    await repo.upsertProvider({
      id: c.id,
      name: c.name,
      kind: c.kind,
      baseUrl: c.baseUrl,
      enabled: false,
      isCustom: false,
      hasKey: false,
      streamUsage: c.streamUsage,
    });
    if (c.models.length) await repo.upsertModels(c.id, c.models, true);
  }
}

export async function providerConfig(id: string): Promise<ProviderConfig> {
  const p = await repo.getProvider(id);
  if (!p) throw new Error(`Провайдер «${id}» не найден`);
  const entry = catalogEntry(id);
  const apiKey = (await getSecret(apiKeyName(id))) ?? '';
  if (entry?.requiresKey !== false && !apiKey && !p.isCustom) throw new Error(`Не задан API-ключ для ${p.name}. Откройте Настройки → Провайдеры.`);
  const sec = checkUrlSecurity(p.baseUrl);
  if (sec) throw new Error(`${p.name}: ${sec}`);
  return { id: p.id, kind: p.kind, baseUrl: p.baseUrl, apiKey, headers: entry?.headers, streamUsage: p.streamUsage };
}

export async function getLLM(id: string): Promise<LLMProvider> {
  return createProvider(await providerConfig(id), appFetch);
}

export async function saveProviderSettings(id: string, patch: { apiKey?: string | null; baseUrl?: string; enabled?: boolean; name?: string; streamUsage?: boolean }): Promise<void> {
  const p = await repo.getProvider(id);
  if (!p) throw new Error('Провайдер не найден');
  if (patch.baseUrl !== undefined) {
    const sec = checkUrlSecurity(patch.baseUrl);
    if (sec) throw new Error(sec);
  }
  let hasKey = p.hasKey;
  if (patch.apiKey !== undefined) {
    await setSecret(apiKeyName(id), patch.apiKey?.trim() || null);
    hasKey = !!patch.apiKey?.trim();
  }
  const entry = catalogEntry(id);
  const needsKey = entry ? entry.requiresKey : false;
  await repo.upsertProvider({
    ...p,
    name: patch.name ?? p.name,
    baseUrl: patch.baseUrl?.trim().replace(/\/+$/, '') ?? p.baseUrl,
    hasKey,
    streamUsage: patch.streamUsage ?? p.streamUsage,
    enabled: patch.enabled ?? (needsKey ? hasKey : p.enabled),
  });
}

export async function addCustomProvider(name: string, baseUrl: string, kind: ProviderKind = 'openai'): Promise<string> {
  const sec = checkUrlSecurity(baseUrl);
  if (sec) throw new Error(sec);
  const id = `custom-${uid().slice(0, 8)}`;
  await repo.upsertProvider({ id, name: name.trim() || 'Свой провайдер', kind, baseUrl: baseUrl.trim().replace(/\/+$/, ''), enabled: true, isCustom: true, hasKey: false, streamUsage: true });
  return id;
}

/** Verifies credentials by listing models; returns the model count. */
export async function testProvider(id: string): Promise<number> {
  const llm = await getLLM(id);
  try {
    return (await llm.listModels()).length;
  } catch (e) {
    // Some providers (e.g. Perplexity) have no /models endpoint: fall back to a 1-token request.
    if (!(e instanceof ProviderError) || ![404, 405].includes(e.status)) throw e;
    const model = (await repo.listModels(id))[0]?.id;
    if (!model) throw e;
    for await (const ev of llm.chat({ model, messages: [{ role: 'user', blocks: [{ type: 'text', text: 'ping' }] }], maxOutputTokens: 1 })) {
      if (ev.type === 'done') break;
    }
    return (await repo.listModels(id)).length;
  }
}

export async function syncModels(id: string): Promise<ModelInfo[]> {
  const llm = await getLLM(id);
  let models: ModelInfo[];
  try {
    models = await llm.listModels();
  } catch (e) {
    if (e instanceof ProviderError && [404, 405].includes(e.status)) return catalogEntry(id)?.models ?? [];
    throw e;
  }
  const entry = catalogEntry(id);
  const seedIds = new Set(entry?.models.map((m) => m.id) ?? []);
  const big = models.length > 25;
  const existing = new Set((await repo.listModels(id)).map((m) => m.id));
  await repo.upsertModels(
    id,
    models.filter((m) => !existing.has(m.id) && (!big || seedIds.has(m.id))),
    true,
  );
  await repo.upsertModels(
    id,
    models.filter((m) => existing.has(m.id) || (big && !seedIds.has(m.id))),
    false,
  );
  const priced = models.filter((m) => m.pricing);
  if (priced.length) {
    const now = new Date().toISOString();
    await repo.savePrices(priced.map((m) => ({ providerId: id, modelId: m.id, ...m.pricing!, source: 'provider' as const, updatedAt: now })));
    await refreshPriceBook();
  }
  return models;
}

export interface PickerGroup {
  provider: repo.ProviderRow;
  models: repo.ModelRow[];
}

export async function pickerGroups(): Promise<PickerGroup[]> {
  const providers = (await repo.listProviders()).filter((p) => p.enabled);
  const all = await repo.listModels();
  return providers
    .map((p) => ({ provider: p, models: all.filter((m) => m.providerId === p.id && m.visible) }))
    .filter((g) => g.models.length > 0);
}

export async function hasAnyProvider(): Promise<boolean> {
  return (await repo.listProviders()).some((p) => p.enabled);
}

export async function resolveModel(providerId: string, modelId: string): Promise<repo.ModelRow> {
  const m = await repo.getModel(providerId, modelId);
  return m ?? { providerId, id: modelId, name: modelId, tools: true, visible: true, favorite: false };
}
