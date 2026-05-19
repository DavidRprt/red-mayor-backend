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
    {
      method: "POST",
      path: "/ordenes/pagar-con-tarjeta",
      handler: "orden.pagarConTarjeta",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
