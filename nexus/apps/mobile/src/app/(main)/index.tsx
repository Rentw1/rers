import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/ChatScreen';

export default function NewChat() {
  const { project, n } = useLocalSearchParams<{ project?: string; n?: string }>();
  return <ChatScreen key={`${project ?? 'none'}:${n ?? ''}`} chatId={null} projectId={project ?? null} />;
}
