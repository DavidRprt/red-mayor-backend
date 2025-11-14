module.exports = {
  routes: [
    {
      method: "GET",
      path: "/user-detalle/by-user",
      handler: "user-detalle.findByUser",
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: "PUT",
      path: "/user-detalle/update-by-user",
      handler: "user-detalle.updateByUser",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
