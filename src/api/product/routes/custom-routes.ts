module.exports = {
  routes: [
    {
      method: "POST",
      path: "/products/validate-check",
      handler: "product.validateAndCheck",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
