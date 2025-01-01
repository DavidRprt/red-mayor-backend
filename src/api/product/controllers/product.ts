import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::product.product",
  ({ strapi }) => ({
    async validateAndCheck(ctx) {
      const { items } = ctx.request.body || {}

      if (!items || !Array.isArray(items) || items.length === 0) {
        return ctx.badRequest(
          "El cuerpo de la solicitud debe incluir un arreglo 'items' con productos."
        )
      }

      const productosValidados = []
      let totalDiscountedPrice = 0 // Precio total con descuentos aplicados

      for (const item of items) {
        const producto = await strapi.db.query("api::product.product").findOne({
          where: { documentId: item.id },
          populate: ["descuentoPorMayor"],
        })

        if (!producto) {
          continue
        }

        // Asegúrate de que stock no sea null
        const stockDisponible = producto.stock || 0 // Si el stock es null, asignamos 0
        const stockOrden = Math.min(item.quantity, stockDisponible)

        // Calcular precios
        const basePrice = producto.precioBase // Precio sin descuento
        let discountedPrice = basePrice // Por defecto, igual al precio base

        // Verificar y calcular el descuento por mayor
        const descuento = producto.descuentoPorMayor

        if (descuento?.activo && stockOrden >= descuento.cantidadMinima) {
          discountedPrice =
            basePrice * (1 - descuento.porcentajeDescuento / 100)
        }

        // Sumar al total con descuento
        totalDiscountedPrice += discountedPrice * stockOrden

        // Agregar producto validado
        productosValidados.push({
          id: producto.id, // ID del producto
          documentId: producto.documentId, // Document ID del producto
          name: producto.nombre,
          requestedStock: item.quantity,
          stockInOrder: stockOrden,
          availableStock: stockDisponible,
          basePrice, // Precio sin descuento
          discountedPrice, // Precio con descuento aplicado
        })
      }

      const response = {
        message: "Verificación completada con éxito.",
        validatedProducts: productosValidados,
        totalDiscountedPrice, // Precio total con descuentos aplicados
      }

      return ctx.send(response, 200)
    },
  })
)
