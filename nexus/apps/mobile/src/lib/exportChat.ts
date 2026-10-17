import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { messageText } from '@nexus/core';
import * as repo from './repo';
import { isToolResultMessage, pathTo } from './tree';

export async function chatToMarkdown(chatId: string): Promise<{ title: string; markdown: string }> {
  const chat = await repo.getChat(chatId);
  if (!chat) throw new Error('Чат не найден');
  const path = pathTo(await repo.listMessages(chatId), chat.activeLeafId);
  const lines = [`# ${chat.title}`, '', `_${new Date(chat.createdAt).toLocaleString('ru-RU')} · ${chat.providerId}/${chat.modelId}_`, ''];
  for (const m of path) {
    if (isToolResultMessage(m)) {
      for (const b of m.blocks) if (b.type === 'tool_result') lines.push(`> ↳ **${b.name}**: ${b.content.slice(0, 500).replace(/\n/g, ' ')}`, '');
      continue;
    }
    if (m.role === 'user') {
      lines.push('## Вы', '', messageText({ role: 'user', blocks: m.blocks }).replace(/<file name="([^"]+)">[\s\S]*?<\/file>/g, '📎 $1'), '');
    } else {
      lines.push(`## ${m.modelId ?? 'Ассистент'}`, '');
      for (const b of m.blocks) {
        if (b.type === 'text') lines.push(b.text, '');
        else if (b.type === 'tool_call') lines.push(`> 🔧 **${b.name}** \`${JSON.stringify(b.input).slice(0, 300)}\``, '');
      }
    }
  }
  return { title: chat.title, markdown: lines.join('\n') };
}

export async function shareChatMarkdown(chatId: string): Promise<void> {
  const { title, markdown } = await chatToMarkdown(chatId);
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 60) || 'chat';
  const f = new File(Paths.cache, `${safe}.md`);
  if (f.exists) f.delete();
  f.create();
  f.write(markdown);
  await Sharing.shareAsync(f.uri, { mimeType: 'text/markdown', dialogTitle: 'Экспорт чата' });
}
