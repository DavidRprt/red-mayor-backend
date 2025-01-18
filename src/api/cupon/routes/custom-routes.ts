module.exports = {
  routes: [
    {
      method: "POST",
      path: "/cupones/validate",
      handler: "cupon.validate",
      config: {
        policies: [],
        middlewares: [],
        auth: false, 
      },
    },
  ],
}
