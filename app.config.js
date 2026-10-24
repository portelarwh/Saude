// Estende app.json. EXPO_BASE_URL define o subcaminho do build web
// (ex.: "/Saude" no GitHub Pages); vazio = raiz (desenvolvimento e testes).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments ?? {}),
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
