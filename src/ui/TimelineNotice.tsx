import React from 'react';
import type { TimelineAssessment } from '../domain/goals';
import { formatDateBR } from '../domain/dates';
import { Button, Notice, T } from './components';

/** Viabilidade do prazo com o prazo recomendado e um botão para usá-lo. */
export function TimelineNotice({ timeline, onUseSuggested }: { timeline: TimelineAssessment | null; onUseSuggested: (dateBR: string) => void }) {
  if (!timeline || !timeline.suggestedDate) return null;
  const date = formatDateBR(timeline.suggestedDate);
  const use = timeline.status !== 'ok' ? (
    <Button small variant="secondary" icon="calendar-outline" title={`Usar prazo recomendado (${date})`} onPress={() => onUseSuggested(date)} />
  ) : null;
  if (timeline.status === 'not_applicable') {
    return (
      <>
        <T variant="small">{timeline.message}</T>
        {use}
      </>
    );
  }
  return (
    <Notice kind={timeline.status === 'ok' ? 'success' : timeline.status === 'aggressive' ? 'warning' : 'error'} title="Viabilidade do prazo" action={use}>
      {timeline.message}
    </Notice>
  );
}
