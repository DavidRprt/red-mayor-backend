export default {
  routes: [
    {
      method: 'PUT',
      path: '/direcciones/:id/eliminar',
      handler: 'direccion.eliminar',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/direcciones/:id/actualizar',
      handler: 'direccion.actualizar',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
}
