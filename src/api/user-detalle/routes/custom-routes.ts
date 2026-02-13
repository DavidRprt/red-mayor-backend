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
    {
      method: "POST",
      path: "/user-detalle/upload-photo",
      handler: "user-detalle.uploadPhoto",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
}
