/** Alimentos cadastrados por você (rótulos, receitas, suplementos, importados): buscar, editar e excluir. */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { searchFoods } from '../domain/foodSearch';
import { useStore } from '../state/AppProvider';
import { useAllFoods } from '../state/hooks';
import { Button, Card, EmptyState, Field, Row, Screen, T } from '../ui/components';
import { confirmAction } from '../ui/confirm';
import { FoodRow } from '../ui/FoodRow';

export default function MyFoods() {
  const router = useRouter();
  const store = useStore();
  const { userFoods } = useAllFoods();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const own = userFoods.filter((f) => !f.id.startsWith('recipe:'));
    return q.trim().length >= 2 ? searchFoods(own, q, 200).map((h) => h.food) : [...own].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [userFoods, q]);

  return (
    <Screen>
      <Row wrap>
        <Button small icon="add" title="Cadastrar alimento" onPress={() => router.push('/alimento/novo')} />
        <Button small variant="secondary" icon="book-outline" title="Receitas" onPress={() => router.push('/receitas')} />
        <Button small variant="secondary" icon="bookmark-outline" title="Refeições salvas" onPress={() => router.push('/refeicoes')} />
      </Row>
      <Field label="Buscar nos meus alimentos" value={q} onChangeText={setQ} placeholder="Nome, marca ou tag" />
      {userFoods.length === 0 ? (
        <EmptyState icon="nutrition-outline" title="Nenhum alimento cadastrado" message="Cadastre rótulos, suplementos e preparações caseiras para encontrá-los na busca." />
      ) : (
        <Card>
          <T variant="tiny">{`${list.length} alimento(s). Toque para ver; use Editar para corrigir valores, porção ou tags.`}</T>
          {list.map((f) => (
            <React.Fragment key={f.id}>
              <FoodRow food={f} onPress={() => router.push({ pathname: '/alimento/[id]', params: { id: f.id } })} />
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button small variant="secondary" icon="create-outline" title="Editar" onPress={() => router.push({ pathname: '/alimento/novo', params: { edit: f.id } })} />
                <Button small variant="ghost" icon="trash-outline" title="Excluir" onPress={() => confirmAction('Excluir alimento', `Remover "${f.name}" dos seus alimentos? Registros antigos no diário não mudam.`, () => store.remove('foods', f.id))} />
              </Row>
            </React.Fragment>
          ))}
        </Card>
      )}
    </Screen>
  );
}
