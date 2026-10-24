/** Placeholder da aba central: o botão "+" abre o menu de registro sem navegar. */
import { Redirect } from 'expo-router';
import React from 'react';

export default function Registrar() {
  return <Redirect href="/" />;
}
