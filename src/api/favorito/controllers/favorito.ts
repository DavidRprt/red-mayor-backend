import { factories } from '@strapi/strapi'

export default factories.createCoreController(
  "api::favorito.favorito",
  ({ strapi }) => ({
    async toggle(ctx) {
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

        const { productId } = ctx.request.body

        if (!productId) {
          return ctx.badRequest("El ID del producto es requerido.")
        }

        // Buscar si ya existe el favorito
        const existing = await strapi.db
          .query("api::favorito.favorito")
          .findOne({
            where: {
              users_permissions_user: userId,
              producto: productId,
            },
          })

        if (existing) {
          // Eliminar favorito
          await strapi.db.query("api::favorito.favorito").delete({
            where: { id: existing.id },
          })

          return { data: { favorited: false, productId } }
        } else {
          // Crear favorito
          await strapi.db.query("api::favorito.favorito").create({
            data: {
              users_permissions_user: userId,
              producto: productId,
            },
          })

          return { data: { favorited: true, productId } }
        }
      } catch (error) {
        strapi.log.error("Error al togglear favorito:", error)
        return ctx.internalServerError("Error al procesar la solicitud.")
      }
    },
  })
)
