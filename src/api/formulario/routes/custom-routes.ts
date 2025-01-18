module.exports = {
  routes: [
    {
      method: "POST",
      path: "/formularios/submit",
      handler: "formulario.create", 
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
