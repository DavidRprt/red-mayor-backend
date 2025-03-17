module.exports = {
  routes: [
    {
      method: "POST",
      path: "/marcas/asignar-marca-automatica",
      handler: "marca.asignarMarcaAutomatica",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
