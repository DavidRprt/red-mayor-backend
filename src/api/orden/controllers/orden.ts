import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::orden.orden",
  ({ strapi }) => ({
    async createWithProducts(ctx) {
      const { metodoPago, direccion, productos } = ctx.request.body || {}

      // Obtener el usuario autenticado desde el token
      const usuario = ctx.state.user

      if (!usuario) {
        return ctx.unauthorized("No autorizado. El token es inválido o falta.")
      }

      // Validar datos obligatorios
      if (!metodoPago || !direccion || !productos || productos.length === 0) {
        return ctx.badRequest(
          "Faltan datos obligatorios: metodoPago, direccion o productos."
        )
      }

      try {
        // Validar que la dirección pertenece al usuario autenticado
        const direccionValida = await strapi.db
          .query("api::direccion.direccion")
          .findOne({
            where: {
              id: direccion,
              users_permissions_user: usuario.id,
            },
          })

        if (!direccionValida) {
          return ctx.badRequest(
            "La dirección no pertenece al usuario autenticado."
          )
        }

        // Crear la orden
        const nuevaOrden = await strapi.entityService.create(
          "api::orden.orden",
          {
            data: {
              user: usuario.id,
              estado: "Pendiente",
              direccion,
              metodoPago,
            },
          }
        )

        const productosProcesados = []
        for (const item of productos) {
          const producto = await strapi.db
            .query("api::product.product")
            .findOne({
              where: { id: item.id }, // Buscar por ID del producto
              populate: ["descuentoPorMayor"], // Aseguramos que el descuento se obtenga
            })

          if (!producto || !producto.activo) {
            return ctx.badRequest(
              `El producto con ID ${item.id} no está disponible.`
            )
          }

          const cantidadSolicitada = item.cantidad
          const stockDisponible = producto.stock

          // Ajustar la cantidad al stock disponible
          const cantidadFinal = Math.min(cantidadSolicitada, stockDisponible)

          if (cantidadFinal === 0) {
            return ctx.badRequest(
              `El producto ${producto.nombreProducto} no tiene stock disponible.`
            )
          }

          // Calcular el precio con descuento si aplica
          let precioConDescuento = producto.precioBase // Precio base por defecto
          if (
            producto.descuentoPorMayor &&
            producto.descuentoPorMayor.activo &&
            cantidadFinal >= producto.descuentoPorMayor.cantidadMinima
          ) {
            const descuento =
              producto.descuentoPorMayor.porcentajeDescuento || 0
            precioConDescuento = producto.precioBase * (1 - descuento / 100)
          }

          // Crear el registro de OrdenProducto
          const ordenProducto = await strapi.entityService.create(
            "api::orden-producto.orden-producto",
            {
              data: {
                orden: nuevaOrden.id,
                producto: producto.documentId, // Guardar el documentId en lugar del ID
                cantidad: cantidadFinal,
                precioUnidad: producto.precioBase,
                precioConDescuento,
              },
            }
          )

          // Actualizar el stock del producto
          await strapi.entityService.update(
            "api::product.product",
            producto.id,
            {
              data: {
                stock: stockDisponible - cantidadFinal,
              },
            }
          )

          productosProcesados.push({
            id: producto.documentId, // Guardar el documentId en los datos de respuesta
            nombre: producto.nombreProducto,
            cantidadSolicitada,
            cantidadFinal,
            precioUnidad: producto.precioBase,
            precioConDescuento,
          })
        }

        // Responder con la orden y los productos procesados
        return ctx.send({
          message: "Orden creada con éxito.",
          orden: nuevaOrden,
          productos: productosProcesados,
        })
      } catch (error) {
        console.error("Error al crear la orden:", error)
        return ctx.internalServerError("Ocurrió un error al procesar la orden.")
      }
    },
  })
)
