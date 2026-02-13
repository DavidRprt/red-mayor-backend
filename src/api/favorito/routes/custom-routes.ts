export default {
  routes: [
    {
      method: "POST",
      path: "/favoritos/toggle",
      handler: "favorito.toggle",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
