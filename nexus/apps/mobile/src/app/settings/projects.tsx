import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, Empty, Row, Screen, Section } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { uid } from '@/lib/ids';
import * as repo from '@/lib/repo';

export default function Projects() {
  const [list, setList] = useState<repo.Project[]>([]);
  const load = useCallback(() => void repo.listProjects().then(setList), []);
  useFocusEffect(load);
  return (
    <Screen>
      {list.length === 0 ? (
        <Empty icon="folder-open-outline" title="Проектов нет" text="Проект — это инструкции, файлы-знания, модель и набор инструментов для группы чатов." />
      ) : (
        <Section>
          {list.map((p, i) => (
            <Row key={p.id} first={i === 0} icon="folder-outline" title={p.name} subtitle={`Изменён ${relativeTime(p.updatedAt)}`} chevron onPress={() => router.push(`/settings/project/${p.id}`)} />
          ))}
        </Section>
      )}
      <Button icon="add" title="Новый проект" onPress={() => router.push(`/settings/project/new-${uid()}`)} />
    </Screen>
  );
}
