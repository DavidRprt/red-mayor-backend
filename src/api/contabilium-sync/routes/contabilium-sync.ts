export default {
  routes: [
    {
      method: 'POST',
      path: '/contabilium-sync/run',
      handler: 'contabilium-sync.run',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/contabilium-sync/progreso',
      handler: 'contabilium-sync.progreso',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
