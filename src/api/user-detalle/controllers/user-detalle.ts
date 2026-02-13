// src/api/user-detalle/controllers/user-detalle.js
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
              foto: true,
            },
          })

        if (!userDetails) {
          return ctx.notFound("No se encontraron detalles para este usuario.")
        }

        const response = {
          id: userDetails.id,
          documentId: userDetails.user.documentId,
          razonSocial: userDetails.razonSocial,
          CUIT: userDetails.CUIT,
          tipoUsuario: userDetails.tipoUsuario,
          telefono: userDetails.telefono,
          username: userDetails.user.username,
          email: userDetails.user.email,
          direcciones: userDetails.user.direccions,
          foto: userDetails.foto?.url || null,
        }

        return { data: response }
      } catch (error) {
        console.log("Error capturado:", error)
        strapi.log.error("Error al obtener los detalles del usuario:", error)
        return ctx.internalServerError("Error al procesar la solicitud.")
      }
    },

    async updateByUser(ctx) {
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

        // Obtener datos del body
        const { razonSocial, telefono, tipoUsuario, username } =
          ctx.request.body

        // Validar campos requeridos
        if (!razonSocial || !telefono || !tipoUsuario) {
          return ctx.badRequest("Todos los campos son requeridos.")
        }

        // Buscar el UserDetalle existente
        const userDetails = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({
            where: { user: userId },
          })

        if (!userDetails) {
          return ctx.notFound("No se encontraron detalles para este usuario.")
        }

        // Actualizar UserDetalle
        const updatedDetails = await strapi.db
          .query("api::user-detalle.user-detalle")
          .update({
            where: { id: userDetails.id },
            data: {
              razonSocial,
              telefono,
              tipoUsuario,
            },
          })

        // Si se proporciona username, actualizar también el usuario
        if (username) {
          await strapi.db.query("plugin::users-permissions.user").update({
            where: { id: userId },
            data: {
              username,
            },
          })
        }

        return {
          data: updatedDetails,
          message: "Perfil actualizado correctamente",
        }
      } catch (error) {
        console.log("Error al actualizar:", error)
        strapi.log.error("Error al actualizar los detalles del usuario:", error)
        return ctx.internalServerError("Error al procesar la solicitud.")
      }
    },

    async uploadPhoto(ctx) {
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

        // Verificar que se envió un archivo
        const { files } = ctx.request

        if (!files || !files.photo) {
          return ctx.badRequest("No se envió ninguna imagen.")
        }

        const file = files.photo

        // Buscar user-detalle con foto actual
        const userDetails = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({
            where: { user: userId },
            populate: { foto: true },
          })

        if (!userDetails) {
          return ctx.notFound("No se encontraron detalles para este usuario.")
        }

        // Si ya tiene foto, borrarla de Cloudinary
        if (userDetails.foto) {
          try {
            await strapi.plugins.upload.services.upload.remove(userDetails.foto)
          } catch (removeErr) {
            strapi.log.warn("No se pudo borrar la foto anterior:", removeErr)
          }
        }

        // Subir la nueva imagen
        const uploadedFiles = await strapi.plugins.upload.services.upload.upload({
          data: {
            ref: "api::user-detalle.user-detalle",
            refId: userDetails.id,
            field: "foto",
          },
          files: file,
        })

        return {
          data: {
            foto: uploadedFiles[0]?.url || null,
          },
          message: "Foto de perfil actualizada correctamente",
        }
      } catch (error) {
        strapi.log.error("Error al subir foto de perfil:", error)
        return ctx.internalServerError("Error al subir la foto.")
      }
    },
  })
)
