const { createCoreController } = require("@strapi/strapi").factories

module.exports = createCoreController(
  "api::user-detalle.user-detalle",
  ({ strapi }) => ({
    async findByUser(ctx) {
      try {
        const authHeader = ctx.request.header.authorization

        if (!authHeader) {
          return ctx.unauthorized("Token no encontrado.")
        }

        const token = authHeader.split(" ")[1]

        if (!token) {
          return ctx.unauthorized("Token no válido.")
        }

        const decoded =
          await strapi.plugins["users-permissions"].services.jwt.verify(token)

        const userId = decoded.id

        if (!userId) {
          return ctx.badRequest("El token no contiene un ID de usuario válido.")
        }

        const userDetails = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({
            where: { user: userId },
            populate: {
              user: {
                populate: {
                  direccions: true, 
                },
              },
            },
          })

        if (!userDetails) {
          return ctx.notFound("No se encontraron detalles para este usuario.")
        }

        const response = {
          id: userDetails.id,
          razonSocial: userDetails.razonSocial,
          CUIT: userDetails.CUIT,
          tipoUsuario: userDetails.tipoUsuario,
          telefono: userDetails.telefono,
          username: userDetails.user.username,
          email: userDetails.user.email,
          direcciones: userDetails.user.direccions,
        }


        return { data: response }
      } catch (error) {
        console.log("Error capturado:", error)
        strapi.log.error("Error al obtener los detalles del usuario:", error)
        return ctx.internalServerError("Error al procesar la solicitud.")
      }
    },
  })
)
