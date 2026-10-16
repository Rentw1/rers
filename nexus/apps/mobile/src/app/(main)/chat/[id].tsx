import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/ChatScreen';

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen key={id} chatId={id} />;
}
