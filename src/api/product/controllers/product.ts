import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::product.product",
  ({ strapi }) => ({
    async validateAndCheck(ctx) {
      const { items } = ctx.request.body || {}

      console.log("Items recibidos en la solicitud:", items)
      if (!items || !Array.isArray(items) || items.length === 0) {
        return ctx.badRequest(
          "El cuerpo de la solicitud debe incluir un arreglo 'items' con productos."
        )
      }

      const productosValidados = []
      let totalDiscountedPrice = 0 // Precio total con descuentos aplicados

      for (const item of items) {
        const producto = await strapi.db.query("api::product.product").findOne({
          where: { id: item.id },
          populate: ["descuentoPorMayor"],
        })

        console.log("Producto encontrado con descuento:", producto)

        if (!producto) {
          continue
        }

        const stockDisponible = producto.stock - producto.stockReservado
        const stockOrden = Math.min(item.quantity, stockDisponible)

        console.log(
          `Stock disponible para ${producto.nombre}:`,
          stockDisponible
        )
        console.log(
          `Stock solicitado: ${item.quantity}, Stock ajustado: ${stockOrden}`
        )

        // Calcular precios
        const basePrice = producto.precioBase // Precio sin descuento
        let discountedPrice = basePrice // Por defecto, igual al precio base

        // Verificar y calcular el descuento por mayor
        const descuento = producto.descuentoPorMayor

        if (descuento?.activo && stockOrden >= descuento.cantidadMinima) {
          discountedPrice =
            basePrice * (1 - descuento.porcentajeDescuento / 100)

          console.log(
            `Descuento aplicado. Precio base: ${basePrice}, Precio con descuento: ${discountedPrice}`
          )
        } else {
          console.log(
            `No aplica descuento. Precio base: ${basePrice}, Precio final: ${discountedPrice}`
          )
        }

        // Sumar al total con descuento
        totalDiscountedPrice += discountedPrice * stockOrden
        console.log(
          `Precio total acumulado con descuento: ${totalDiscountedPrice}`
        )

        // Agregar producto validado
        productosValidados.push({
          id: producto.id,
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
