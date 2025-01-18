/**
 * cupon controller
 */

import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::cupon.cupon",
  ({ strapi }) => ({
    async validate(ctx) {
      const { codigo } = ctx.request.body

      // Validar que el código fue enviado
      if (!codigo || typeof codigo !== "string") {
        return ctx.badRequest("Debes enviar un código de cupón válido.")
      }

      // Eliminar espacios en blanco y convertir a mayúsculas
      const codigoNormalizado = codigo.trim().toUpperCase()

      try {
        // Buscar el cupón en la base de datos
        const cupon = await strapi.db.query("api::cupon.cupon").findOne({
          where: {
            codigo: codigoNormalizado,
            activo: true, // Verificar que el cupón esté activo
          },
        })

        // Validar si el cupón existe
        if (!cupon) {
          return ctx.badRequest(
            "El código ingresado no es válido o está inactivo."
          )
        }

        // Verificar si el cupón está expirado
        const fechaActual = new Date()
        if (
          cupon.fechaExpiracion &&
          new Date(cupon.fechaExpiracion) < fechaActual
        ) {
          return ctx.badRequest("El cupón ingresado ha expirado.")
        }

        // Retornar el porcentaje de descuento si todo está correcto
        return ctx.send({
          porcentajeDescuento: cupon.porcentajeDescuento,
        })
      } catch (error) {
        console.error("Error al validar el cupón:", error)
        return ctx.internalServerError("Hubo un problema al validar el cupón.")
      }
    },
  })
)
