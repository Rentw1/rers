import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import MarkdownView, { type ASTNode, type RenderRules } from 'react-native-markdown-display';
import { radius, useTheme } from '@/lib/theme';
import { Icon, tap } from './ui';
import { setPreview } from '@/store/preview';

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  const previewable = /^(html|svg|xml)$/i.test(lang) || (/^\s*<(!doctype|html|svg)/i.test(code) && !lang);
  return (
    <View style={{ backgroundColor: c.codeBg, borderRadius: radius.md, marginVertical: 8, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border, gap: 12 }}>
        <Text style={{ flex: 1, color: c.textMuted, fontSize: 12, fontFamily: 'monospace' }}>{lang || 'code'}</Text>
        {previewable ? (
          <Pressable
            accessibilityLabel="Открыть превью"
            hitSlop={8}
            onPress={() => {
              tap();
              setPreview({ html: lang.toLowerCase() === 'svg' || /^\s*<svg/i.test(code) ? `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh">${code}</body>` : code, title: lang.toUpperCase() || 'HTML' });
              router.push('/preview');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Icon name="play-outline" size={15} color={c.accent} />
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>Превью</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Копировать код"
          hitSlop={8}
          onPress={async () => {
            tap();
            await Clipboard.setStringAsync(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Icon name={copied ? 'checkmark' : 'copy-outline'} size={15} color={c.textMuted} />
          <Text style={{ color: c.textMuted, fontSize: 12 }}>{copied ? 'Скопировано' : 'Копировать'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable style={{ color: c.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 19, padding: 12 }}>
          {code.replace(/\n$/, '')}
        </Text>
      </ScrollView>
    </View>
  );
}

function MarkdownImpl({ text, compact }: { text: string; compact?: boolean }) {
  const { c, serif } = useTheme();
  const body = serif && !compact ? 'serif' : undefined;
  const styles = useMemo(
    () => ({
      body: { color: c.text, fontSize: 16, lineHeight: 24, fontFamily: body },
      paragraph: { marginTop: 4, marginBottom: 8 },
      heading1: { fontSize: 22, fontWeight: '700' as const, marginTop: 10, marginBottom: 6, color: c.text },
      heading2: { fontSize: 19, fontWeight: '700' as const, marginTop: 10, marginBottom: 6, color: c.text },
      heading3: { fontSize: 17, fontWeight: '700' as const, marginTop: 8, marginBottom: 4, color: c.text },
      strong: { fontWeight: '700' as const },
      em: { fontStyle: 'italic' as const },
      link: { color: c.accent, textDecorationLine: 'underline' as const },
      blockquote: { backgroundColor: c.surfaceAlt, borderLeftColor: c.accent, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 6 },
      code_inline: { backgroundColor: c.codeBg, color: c.text, fontFamily: 'monospace', fontSize: 14, borderRadius: 4, paddingHorizontal: 4 },
      bullet_list: { marginVertical: 4 },
      ordered_list: { marginVertical: 4 },
      list_item: { marginVertical: 2 },
      hr: { backgroundColor: c.border, height: 1, marginVertical: 12 },
      table: { borderColor: c.border, borderWidth: 1, borderRadius: 6, marginVertical: 8 },
      thead: { backgroundColor: c.surfaceAlt },
      th: { padding: 6, borderColor: c.border },
      td: { padding: 6, borderColor: c.border },
      tr: { borderColor: c.border, borderBottomWidth: 1 },
    }),
    [c, body],
  );
  const rules: RenderRules = useMemo(
    () => ({
      fence: (node: ASTNode) => <CodeBlock key={node.key} code={node.content} lang={(node as ASTNode & { sourceInfo?: string }).sourceInfo?.trim().split(/\s+/)[0] ?? ''} />,
      code_block: (node: ASTNode) => <CodeBlock key={node.key} code={node.content} lang="" />,
      image: (node: ASTNode) => (
        <Text key={node.key} style={{ color: c.accent }} onPress={() => void WebBrowser.openBrowserAsync(String(node.attributes.src))}>
          🖼 {String(node.attributes.alt || node.attributes.src)}
        </Text>
      ),
      table: (node: ASTNode, children) => (
        <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator>
          <View style={styles.table}>{children}</View>
        </ScrollView>
      ),
    }),
    [c, styles.table],
  );
  return (
    <MarkdownView
      style={styles}
      rules={rules}
      onLinkPress={(url) => {
        if (/^https?:\/\//i.test(url)) void WebBrowser.openBrowserAsync(url);
        return false;
      }}
    >
      {text}
    </MarkdownView>
  );
}

export const Markdown = memo(MarkdownImpl);
