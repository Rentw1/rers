import * as Clipboard from 'expo-clipboard';
import { memo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import type { Block, ToolResultBlock } from '@nexus/core';
import { PHONE_TOOLS } from '@/lib/phoneTools';
import { radius, useTheme } from '@/lib/theme';
import { useApprovals } from '@/store/approvals';
import { useChatRuntime, type LiveBlock } from '@/store/chat';
import { Markdown } from './Markdown';
import { Button, Icon, T, tap } from './ui';

export function toolLabel(name: string): { server: string; title: string } {
  const phone = PHONE_TOOLS.find((t) => t.name === name);
  if (phone) return { server: 'Телефон', title: phone.title };
  if (name.startsWith('pc_')) return { server: 'Компьютер', title: name.slice(3).replace(/_/g, ' ') };
  const i = name.indexOf('__');
  if (i > 0) return { server: name.slice(0, i).replace(/_/g, ' '), title: name.slice(i + 2).replace(/_/g, ' ') };
  return { server: 'MCP', title: name.replace(/_/g, ' ') };
}

export function Reasoning({ text, live }: { text: string; live?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginVertical: 4 }}>
      <Pressable
        onPress={() => (tap(), setOpen(!open))}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Свернуть размышления' : 'Показать размышления'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
      >
        <Icon name="bulb-outline" size={16} color={c.textMuted} />
        <T v="small">{live ? 'Размышляет…' : 'Размышления'}</T>
        {live ? <ActivityIndicator size="small" color={c.textMuted} /> : null}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={c.textMuted} />
      </Pressable>
      {open ? (
        <View style={{ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 12, marginLeft: 7, marginTop: 2 }}>
          <T v="small" selectable style={{ lineHeight: 20 }}>
            {text.trim() || '…'}
          </T>
        </View>
      ) : null}
    </View>
  );
}

function prettyArgs(input: unknown, argsText?: string): string {
  if (argsText !== undefined && (input === undefined || input === null)) return argsText;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function ToolCard({ id, name, input, argsText, result }: { id: string; name: string; input?: Record<string, unknown>; argsText?: string; result?: ToolResultBlock }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const state = useChatRuntime((s) => s.tools[id]);
  const pending = useApprovals((s) => s.pending[id]);
  const decide = useApprovals((s) => s.decide);
  const res = result ?? state?.result;
  const status = pending ? 'awaiting' : res ? (res.isError ? 'error' : 'done') : state?.status === 'running' ? 'running' : argsText !== undefined ? 'preparing' : 'done';
  const { server, title } = toolLabel(name);
  const statusText = { awaiting: 'Ожидает разрешения', running: 'Выполняется…', preparing: 'Готовит вызов…', done: '', error: res?.content === 'Пользователь отклонил вызов инструмента' ? 'Отклонено' : 'Ошибка' }[status];
  const tone = status === 'error' ? c.danger : status === 'awaiting' ? c.warning : c.textMuted;
  return (
    <View style={{ borderWidth: 1, borderColor: status === 'awaiting' ? c.warning : c.border, borderRadius: radius.md, marginVertical: 6, backgroundColor: c.card, overflow: 'hidden' }}>
      <Pressable onPress={() => (tap(), setOpen(!open))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }} accessibilityRole="button" accessibilityLabel={`Инструмент ${title}`}>
        <Icon name={server === 'Телефон' ? 'phone-portrait-outline' : server === 'Компьютер' ? 'desktop-outline' : 'construct-outline'} size={18} color={c.textMuted} />
        <View style={{ flex: 1 }}>
          <T numberOfLines={1} style={{ fontSize: 14, fontWeight: '600' }}>
            {title}
          </T>
          <T v="caption" numberOfLines={1}>
            {server}
            {statusText ? ` · ${statusText}` : ''}
          </T>
        </View>
        {status === 'running' || status === 'preparing' ? <ActivityIndicator size="small" color={c.accent} /> : <Icon name={status === 'error' ? 'alert-circle-outline' : status === 'awaiting' ? 'hand-left-outline' : 'checkmark-circle-outline'} size={18} color={tone} />}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={c.textFaint} />
      </Pressable>
      {pending ? (
        <View style={{ paddingHorizontal: 10, paddingBottom: 10, gap: 8 }}>
          <View style={{ backgroundColor: c.codeBg, borderRadius: 8, padding: 8 }}>
            <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: c.text }} numberOfLines={12}>
              {prettyArgs(pending.args)}
            </Text>
          </View>
          {pending.destructive ? <T v="caption" color={c.warning}>Инструмент может изменить данные или выполнить действие.</T> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button small title="Разрешить" icon="checkmark" onPress={() => decide(id, 'once')} />
            <Button small kind="secondary" title="Всегда" onPress={() => decide(id, 'always')} />
            <Button small kind="ghost" title="Отклонить" onPress={() => decide(id, 'deny')} />
          </View>
        </View>
      ) : null}
      {open && !pending ? (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border, padding: 10, gap: 8 }}>
          <T v="caption">Аргументы</T>
          <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: c.text }}>
            {prettyArgs(input, argsText)}
          </Text>
          {res ? (
            <>
              <T v="caption">Результат</T>
              <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: res.isError ? c.danger : c.text }} numberOfLines={60}>
                {res.content}
              </Text>
              {res.images?.map((img, i) => <Image key={i} source={{ uri: `data:${img.mediaType};base64,${img.data}` }} style={{ width: '100%', height: 200, borderRadius: 8 }} resizeMode="contain" />)}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function AssistantBlocksImpl({ blocks, results, showReasoning }: { blocks: Block[]; results: Map<string, ToolResultBlock>; showReasoning: boolean }) {
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.type === 'reasoning') return showReasoning ? <Reasoning key={i} text={b.text} /> : null;
        if (b.type === 'text') return <Markdown key={i} text={b.text} />;
        if (b.type === 'tool_call') return <ToolCard key={b.id} id={b.id} name={b.name} input={b.input} result={results.get(b.id)} />;
        return null;
      })}
    </View>
  );
}
export const AssistantBlocks = memo(AssistantBlocksImpl);

export function LiveBlocks({ blocks, showReasoning }: { blocks: LiveBlock[]; showReasoning: boolean }) {
  const { c } = useTheme();
  if (!blocks.length) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <ActivityIndicator size="small" color={c.accent} />
        <T v="small">Думает…</T>
      </View>
    );
  }
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.type === 'reasoning') return showReasoning ? <Reasoning key={i} text={b.text} live={i === blocks.length - 1} /> : i === blocks.length - 1 ? <T key={i} v="small">Размышляет…</T> : null;
        if (b.type === 'text') return <Markdown key={i} text={b.text + (i === blocks.length - 1 ? ' ▍' : '')} />;
        return <ToolCard key={b.id} id={b.id} name={b.name} argsText={b.argsText} />;
      })}
    </View>
  );
}

export function UserBubble({ blocks, onLongPress }: { blocks: Block[]; onLongPress?: () => void }) {
  const { c } = useTheme();
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n');
  const files = [...text.matchAll(/<file name="([^"]+)">/g)].map((m) => m[1]);
  const visible = text.replace(/<file name="[^"]+">[\s\S]*?<\/file>\s*/g, '').trim();
  const images = blocks.filter((b): b is Extract<Block, { type: 'image' }> => b.type === 'image');
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={300} style={{ alignSelf: 'flex-end', maxWidth: '88%', marginVertical: 6 }}>
      {images.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
          {images.map((img, i) => (
            <Image key={i} source={{ uri: `data:${img.mediaType};base64,${img.data}` }} style={{ width: 120, height: 120, borderRadius: radius.md }} />
          ))}
        </View>
      ) : null}
      {files.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
          {files.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Icon name="document-text-outline" size={14} color={c.textMuted} />
              <T v="caption" color={c.text}>
                {f}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      {visible ? (
        <View style={{ backgroundColor: c.userBubble, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text selectable style={{ color: c.text, fontSize: 16, lineHeight: 23 }}>
            {visible}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
