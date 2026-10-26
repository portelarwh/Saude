import React, { useState } from 'react';
import { CREATINE_GUIDE, CREATINE_SOURCE, creatineCaution } from '../domain/creatine';
import { ageOn } from '../domain/dates';
import { HYDRATION_SOURCE, hydrationTips } from '../domain/hydrationTips';
import type { Profile } from '../domain/types';
import { Button, Card, Notice, T } from './components';

/** Como usar creatina (educativo; suplemento é opcional). */
export function CreatineGuide({ profile }: { profile: Profile | null }) {
  const [loading, setLoading] = useState(false);
  const caution = creatineCaution(profile?.health_flags, profile?.birth_date ? ageOn(profile.birth_date) : null);
  return (
    <Card>
      <T variant="h3">Creatina: como usar</T>
      {caution ? (
        <Notice kind="warning">{caution}</Notice>
      ) : (
        <>
          <T variant="small">{`• ${CREATINE_GUIDE.dose}`}</T>
          <T variant="small">{`• ${CREATINE_GUIDE.weight}`}</T>
          <T variant="small">{`• ${CREATINE_GUIDE.water}`}</T>
          <T variant="small">{`• ${CREATINE_GUIDE.notProtein}`}</T>
          {loading ? <T variant="small">{`• ${CREATINE_GUIDE.loading}`}</T> : <Button small variant="ghost" title="Ver a fase de saturação (opcional)" onPress={() => setLoading(true)} />}
        </>
      )}
      <T variant="tiny">{`Suplemento opcional, não é obrigatório. Fonte: ${CREATINE_SOURCE}.`}</T>
    </Card>
  );
}

/** Dicas práticas de hidratação. */
export function HydrationGuide({ profile }: { profile: Profile | null }) {
  const [open, setOpen] = useState(false);
  const { tips, caution } = hydrationTips(profile?.health_flags);
  return (
    <Card>
      <T variant="h3">Dicas de hidratação</T>
      {caution ? <Notice kind="warning">{caution}</Notice> : null}
      {(open ? tips : tips.slice(0, 3)).map((t) => <T key={t} variant="small">{`• ${t}`}</T>)}
      {tips.length > 3 && !open ? <Button small variant="ghost" title="Ver todas as dicas" onPress={() => setOpen(true)} /> : null}
      <T variant="tiny">{`Fonte: ${HYDRATION_SOURCE}. Orientação geral, não substitui o seu médico.`}</T>
    </Card>
  );
}
