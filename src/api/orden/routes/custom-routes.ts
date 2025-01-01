module.exports = {
  routes: [
    {
      method: "POST",
      path: "/ordenes/create-with-products",
      handler: "orden.createWithProducts",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
