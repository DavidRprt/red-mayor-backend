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
  ],
};
