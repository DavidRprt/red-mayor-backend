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
      let totalDiscountedPrice = 0

      for (const item of items) {
        console.log("Procesando item:", item)

        // 1. Buscar primero en productos normales
        let producto = await strapi.db.query("api::product.product").findOne({
          where: { documentId: item.id },
          populate: ["descuentoPorMayor"],
        })

        let esCombo = false

        // 2. Si no existe producto, buscar en combos
        if (!producto) {
          const combo = await strapi.db.query("api::combo.combo").findOne({
            where: { documentId: item.id },
            populate: ["productos"],
          })

          if (combo) {
            esCombo = true
            console.log("Combo detectado:", combo)

            // Calcular precio del combo usando metadata.detalleCombo
            const detalleCombo = item.metadata?.detalleCombo || {}
            console.log("Detalle del combo:", detalleCombo)

            let precioCombo = 0
            for (const [prodId, cantidad] of Object.entries(detalleCombo)) {
              const prodInterno = await strapi.db
                .query("api::product.product")
                .findOne({
                  where: { id: parseInt(prodId) },
                })

              if (prodInterno) {
                console.log(
                  `Producto interno ${prodId}: precio ${prodInterno.precioBase}, cantidad ${cantidad}`
                )
                precioCombo += (prodInterno.precioBase || 0) * Number(cantidad)
              }
            }

            // Crear objeto simulado para el combo
            producto = {
              ...combo,
              precioBase: precioCombo,
              stock: 9999,
              nombre: combo.Nombre,
            }
          }
        }

        // 3. Si no encontró ni producto ni combo, continuar
        if (!producto) {
          console.log("Producto/Combo no encontrado para:", item.id)
          continue
        }

        // Stock disponible
        const stockDisponible = esCombo ? 9999 : producto.stock || 0
        const stockOrden = Math.min(item.quantity, stockDisponible)

        // Precio base
        const basePrice = producto.precioBase || 0

        // Descuento (solo para productos normales)
        let discountedPrice = basePrice
        if (
          !esCombo &&
          producto.descuentoPorMayor?.activo &&
          stockOrden >= producto.descuentoPorMayor.cantidadMinima
        ) {
          discountedPrice =
            basePrice *
            (1 - producto.descuentoPorMayor.porcentajeDescuento / 100)
        }

        // Acumular total
        totalDiscountedPrice += discountedPrice * stockOrden

        // --- GENERAR ID COMPUESTO SI ES COMBO ---
        let idCompuesto = producto.documentId
        if (esCombo) {
          const detalle = item.metadata?.detalleCombo || {}
          if (Object.keys(detalle).length > 0) {
            const detalleString = Object.entries(detalle)
              .map(([prodId, cant]) => `${prodId}:${cant}`)
              .join("|")
            idCompuesto = `combo-${producto.id}|${detalleString}`
          }
        }

        // Agregar producto validado al array
        productosValidados.push({
          id: esCombo ? idCompuesto : producto.documentId,
          documentId: producto.documentId,
          name: producto.nombre || producto.nombreProducto,
          requestedStock: item.quantity,
          stockInOrder: stockOrden,
          availableStock: stockDisponible,
          basePrice,
          discountedPrice,
        })
      }

      console.log("Productos validados:", productosValidados)
      console.log("Total con descuentos:", totalDiscountedPrice)

      const response = {
        message: "Verificación completada con éxito.",
        validatedProducts: productosValidados,
        totalDiscountedPrice,
      }

      return ctx.send(response, 200)
    },
  })
)
