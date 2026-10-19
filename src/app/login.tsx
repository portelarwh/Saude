import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { supabase } from '../services/supabase';
import { Button, Card, Field, Notice, Screen, T } from '../ui/components';
import { spacing, useTheme } from '../ui/theme';

export default function Login() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Informe um e-mail válido.');
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: e } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
        if (e) setError(e.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : e.message);
      } else {
        const { data, error: e } = await supabase().auth.signUp({ email: email.trim(), password });
        if (e) setError(e.message);
        else if (!data.session) setInfo('Enviamos um e-mail de confirmação. Confirme e depois entre com sua senha.');
      }
    } catch {
      setError('Sem conexão com o servidor. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Digite seu e-mail para recuperar a senha.');
    const { error: e } = await supabase().auth.resetPasswordForEmail(email.trim());
    if (e) setError(e.message);
    else setInfo('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: 48, gap: spacing.sm }}>
          <T variant="h1">Meu Equilíbrio</T>
          <T variant="small">Saúde e nutrição com IA — acompanhamento de composição corporal, proteína e hidratação.</T>
        </View>
        <Card>
          <T variant="h2">{mode === 'signin' ? 'Entrar' : 'Criar conta'}</T>
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signin' ? 'password' : 'new-password'} hint="Mínimo de 8 caracteres" />
          {error ? <Notice kind="error">{error}</Notice> : null}
          {info ? <Notice kind="success">{info}</Notice> : null}
          <Button title={mode === 'signin' ? 'Entrar' : 'Criar conta'} onPress={submit} loading={busy} />
          <Button variant="ghost" title={mode === 'signin' ? 'Não tenho conta' : 'Já tenho conta'} onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} />
          {mode === 'signin' ? <Button variant="ghost" small title="Esqueci minha senha" onPress={reset} /> : null}
        </Card>
        <T variant="tiny">
          Seus dados de saúde são tratados como dados pessoais sensíveis (LGPD) e ficam isolados por usuário. Conexão sempre criptografada (HTTPS).
        </T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
