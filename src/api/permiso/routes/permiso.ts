export default {
  routes: [
    {
      method: 'GET',
      path: '/permisos/check',
      handler: 'permiso.check',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
