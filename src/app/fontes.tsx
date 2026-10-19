import React from 'react';
import { Linking } from 'react-native';
import { TACO_CITATION, TACO_META } from '../data/reference';
import { Badge, Button, Card, Row, Screen, T } from '../ui/components';

const SOURCES = [
  {
    name: 'TACO — Tabela Brasileira de Composição de Alimentos (NEPA/UNICAMP)',
    status: 'integrada',
    tone: 'primary' as const,
    text: `${TACO_CITATION} 597 alimentos importados da planilha oficial em ${TACO_META.imported_at}. Valores "NA" e "*" ficam como não informados; "Tr" (traços) aparece como traços. ${TACO_META.license}`,
    url: 'https://www.nepa.unicamp.br/taco/',
  },
  {
    name: 'Open Food Facts',
    status: 'integrada (consulta por código de barras)',
    tone: 'primary' as const,
    text: 'Base colaborativa de produtos industrializados, licença Open Database License (ODbL). Os dados são marcados como "informado" e passam por conferência antes de serem salvos.',
    url: 'https://world.openfoodfacts.org',
  },
  {
    name: 'USDA FoodData Central',
    status: 'requer chave no servidor',
    tone: 'warning' as const,
    text: 'Dados públicos do Departamento de Agricultura dos EUA, usados como fonte complementar via função do servidor (USDA_API_KEY). Nomes em inglês.',
    url: 'https://fdc.nal.usda.gov',
  },
  {
    name: 'TBCA — Tabela Brasileira de Composição de Alimentos (USP/FoRC)',
    status: 'não integrada',
    tone: 'neutral' as const,
    text: 'A TBCA não oferece API pública e seus termos exigem autorização para reprodução em bases de dados. A integração depende dessa autorização; até lá, consulte o site e cadastre manualmente.',
    url: 'https://www.tbca.net.br',
  },
  {
    name: 'Rótulos dos fabricantes',
    status: 'por foto ou digitação',
    tone: 'primary' as const,
    text: 'Para produtos industrializados e suplementos, o rótulo atual do produto tem prioridade. Cada sabor e versão é cadastrado separadamente.',
    url: null,
  },
  {
    name: 'Compendium of Physical Activities',
    status: 'referência de MET',
    tone: 'primary' as const,
    text: 'Ainsworth BE et al. Valores aproximados de MET por atividade e intensidade, usados para estimar o gasto energético (±25%).',
    url: 'https://pacompendium.com',
  },
];

export default function Sources() {
  return (
    <Screen>
      <T variant="small">Cada alimento mostra a fonte e o status: verificado (conferido na fonte oficial ou rótulo), informado (vindo da fonte, não conferido individualmente) ou estimado (cálculo ou porção aproximada).</T>
      {SOURCES.map((s) => (
        <Card key={s.name}>
          <T variant="h3">{s.name}</T>
          <Row><Badge label={s.status} tone={s.tone} /></Row>
          <T variant="small">{s.text}</T>
          {s.url ? <Button small variant="ghost" title="Abrir site" onPress={() => Linking.openURL(s.url!)} /> : null}
        </Card>
      ))}
      <Card>
        <T variant="h3">Equações e referências</T>
        <T variant="small">• Taxa metabólica basal: Mifflin MD, St Jeor ST et al. (1990); Katch–McArdle quando há massa livre de gordura medida.</T>
        <T variant="small">• Fatores de atividade: 1,2 a 1,9 (FAO/OMS e literatura clássica).</T>
        <T variant="small">• Proteína: 1,2–2,2 g/kg conforme objetivo e treino de força, usando peso de referência (IMC 25) em obesidade.</T>
        <T variant="small">• Fibras: 14 g/1.000 kcal (Institute of Medicine), mínimo de 25 g.</T>
        <T variant="small">• Líquidos: referência configurável em ml/kg/dia (padrão 35), com ajustes por atividade e clima.</T>
        <T variant="small">• Atividade física: recomendações da OMS (2020).</T>
      </Card>
    </Screen>
  );
}
