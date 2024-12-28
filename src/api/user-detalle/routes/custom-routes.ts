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
  ],
}
