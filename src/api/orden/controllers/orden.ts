import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::orden.orden",
  ({ strapi }) => ({
    async createWithProducts(ctx) {
      const { metodoPago, direccion, productos, observaciones, cupon } =
        ctx.request.body || {}
      const usuario = ctx.state.user

      if (!usuario) return ctx.unauthorized("No autorizado.")

      if (!metodoPago || !direccion || !productos || productos.length === 0) {
        return ctx.badRequest("Faltan datos obligatorios.")
      }

      async function validarCupon(cupon) {
        if (!cupon) return null
        try {
          const cuponNormalizado = cupon.trim().toUpperCase()
          const cuponValido = await strapi.db
            .query("api::cupon.cupon")
            .findOne({ where: { codigo: cuponNormalizado, activo: true } })

          if (
            !cuponValido ||
            new Date(cuponValido.fechaExpiracion) < new Date()
          )
            return null

          return cuponValido.porcentajeDescuento
        } catch (err) {
          strapi.log.error("Error al validar el cupón:", err)
          return null
        }
      }

      try {
        const direccionValida = await strapi.db
          .query("api::direccion.direccion")
          .findOne({
            where: { id: direccion, users_permissions_user: usuario.id },
          })

        if (!direccionValida)
          return ctx.badRequest(
            "La dirección no pertenece al usuario autenticado."
          )

        const detallesUsuario = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({ where: { user: usuario.id } })

        // Crear la orden principal
        const nuevaOrden = await strapi.entityService.create(
          "api::orden.orden",
          {
            data: {
              user: usuario.id,
              estado: "Pendiente",
              direccion,
              metodoPago,
              observaciones,
            },
          }
        )

        const porcentajeDescuentoCupon = await validarCupon(cupon)

        const productosProcesados = []
        const detallesCombos = [] // para el mail admin

        for (const item of productos) {
          const esCombo = typeof item.id === "string" && item.id.includes("|")

          if (!esCombo) {
            let whereClause = {}

            if (!isNaN(Number(item.id))) {
              // Caso: ID numérico
              whereClause = { id: parseInt(item.id) }
            } else {
              // Caso: DocumentId string
              whereClause = { documentId: item.id }
            }

            const producto = await strapi.db
              .query("api::product.product")
              .findOne({
                where: whereClause,
                populate: ["descuentoPorMayor"],
              })

            if (!producto || !producto.activo) {
              return ctx.badRequest(
                `El producto con ID ${item.id} no está disponible.`
              )
            }

            const cantidadSolicitada = item.cantidad
            const cantidadFinal = Math.min(cantidadSolicitada, producto.stock)

            if (cantidadFinal === 0) {
              return ctx.badRequest(
                `El producto ${producto.nombreProducto} no tiene stock disponible.`
              )
            }

            // Descuento
            let precioConDescuento = producto.precioBase
            if (
              producto.descuentoPorMayor?.activo &&
              cantidadFinal >= producto.descuentoPorMayor.cantidadMinima
            ) {
              precioConDescuento =
                producto.precioBase *
                (1 - producto.descuentoPorMayor.porcentajeDescuento / 100)
            }

            if (
              porcentajeDescuentoCupon &&
              precioConDescuento === producto.precioBase
            ) {
              precioConDescuento =
                producto.precioBase * (1 - porcentajeDescuentoCupon / 100)
            }

            // Actualizar stock
            await strapi.db.query("api::product.product").update({
              where: { id: producto.id },
              data: { stock: producto.stock - cantidadFinal },
            })

            // Crear orden-producto
            await strapi.entityService.create(
              "api::orden-producto.orden-producto",
              {
                data: {
                  orden: nuevaOrden.id,
                  producto: producto.documentId,
                  cantidad: cantidadFinal,
                  precioUnidad: producto.precioBase,
                  precioConDescuento,
                },
              }
            )

            productosProcesados.push({
              slug: producto.slug,
              nombreProducto: producto.nombreProducto,
              cantidadFinal,
              precioUnidad: producto.precioBase,
              precioConDescuento,
            })
          } else {
            // === Combo ===
            const partes = item.id.split("|")
            const comboSlug = partes[0] // ej: combo-1
            const detalleString = partes.slice(1).join("|")

            const detalleCombo: Record<string, number> = {}
            detalleString.split("|").forEach((p) => {
              const [idStr, cantStr] = p.split(":")
              detalleCombo[idStr] = parseInt(cantStr)
            })

            const combo = await strapi.db.query("api::combo.combo").findOne({
              where: { documentId: item.documentId },
            })

            if (!combo) {
              return ctx.badRequest(
                `Combo con documentId ${item.documentId} no encontrado.`
              )
            }

            // Calcular precio total combo
            let precioCombo = 0
            const productosInternos = []

            for (const [prodId, cantidadStr] of Object.entries(detalleCombo)) {
              const cantidad = Number(cantidadStr)

              const prod = await strapi.db
                .query("api::product.product")
                .findOne({ where: { id: parseInt(prodId) } })

              if (prod) {
                precioCombo += prod.precioBase * cantidad

                // Actualizar stock de cada producto interno
                await strapi.db.query("api::product.product").update({
                  where: { id: prod.id },
                  data: { stock: prod.stock - cantidad },
                })

                productosInternos.push({
                  nombre: prod.nombreProducto,
                  slug: prod.slug,
                  cantidad,
                  precioUnidad: prod.precioBase,
                })
              }
            }

            // Guardar orden-producto como combo
            await strapi.entityService.create(
              "api::orden-producto.orden-producto",
              {
                data: {
                  orden: nuevaOrden.id,
                  producto: combo.documentId,
                  cantidad: item.cantidad,
                  precioUnidad: precioCombo,
                  precioConDescuento: precioCombo,
                },
              }
            )

            detallesCombos.push({
              comboNombre: combo.Nombre,
              comboSlug,
              cantidadCombo: item.cantidad,
              productosInternos,
            })

            productosProcesados.push({
              slug: comboSlug,
              nombreProducto: combo.Nombre,
              cantidadFinal: item.cantidad,
              precioUnidad: precioCombo,
              precioConDescuento: precioCombo,
            })
          }
        }

        // Fecha
        const fecha = new Date()
        const fechaFormateada = `${fecha.getDate().toString().padStart(2, "0")}/${(
          fecha.getMonth() + 1
        )
          .toString()
          .padStart(2, "0")}/${fecha.getFullYear()}`

        // HTML combos para admin
        const combosDetalleHTML = detallesCombos
          .map(
            (combo) => `
              <h3>${combo.comboNombre} (${combo.comboSlug}) - Cantidad: ${combo.cantidadCombo}</h3>
              <ul>
                ${combo.productosInternos
                  .map(
                    (prod) =>
                      `<li>${prod.nombre} (${prod.slug}) - Cantidad: ${prod.cantidad}</li>`
                  )
                  .join("")}
              </ul>`
          )
          .join("<hr>")

        // === Mail al ADMIN ===
        await strapi.plugins["email"].services.email.send({
          to: ["contacto@redxmayor.com", "davirapo@gmail.com"],
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "Nueva venta registrada en RedXMayor",
          html: `
            <h1>Nueva venta registrada</h1>
            <p>Fecha: ${fechaFormateada}</p>
            <p><strong>Cliente:</strong> ${usuario.username} - ${usuario.email}</p>
            <p><strong>Dirección:</strong> ${direccionValida.direccion}, ${direccionValida.ciudad}</p>
            <h2>Productos</h2>
            <ul>
              ${productosProcesados
                .map(
                  (item) =>
                    `<li>${item.nombreProducto} - Cantidad: ${item.cantidadFinal} - Precio: $${item.precioConDescuento.toFixed(
                      2
                    )}</li>`
                )
                .join("")}
            </ul>
            <hr>
            <h2>Detalle de combos</h2>
            ${combosDetalleHTML || "<p>No hay combos en esta orden.</p>"}
          `,
        })

        // === Mail al CLIENTE ===
        await strapi.plugins["email"].services.email.send({
          to: usuario.email,
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "¡Gracias por tu compra en RedXMayor!",
          html: `
<table style="width:100%; background-color:#f9f9f9; padding:20px; font-family:Arial,sans-serif;">
  <tr>
    <td>
      <!-- Contenedor principal -->
      <table style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background-color:#1a1a1a; padding:20px; text-align:center;">
            <h1 style="color:#00b0f0; margin:0; font-size:24px;">¡Gracias por tu compra, ${usuario.username}!</h1>
          </td>
        </tr>
        <!-- Contenido -->
        <tr>
          <td style="padding:20px; color:#333333;">
            <p style="font-size:16px; margin:0 0 10px 0;">Fecha de la compra: <strong>${fechaFormateada}</strong></p>
            <p style="font-size:16px; margin:0 0 20px 0;">Hemos recibido tu pedido y lo estamos procesando. Pronto nos pondremos en contacto contigo.</p>
            
            <h2 style="font-size:20px; margin:0 0 10px 0; color:#1a1a1a;">Resumen de tu pedido:</h2>
            <ul style="padding-left:20px; margin:0 0 20px 0; font-size:16px; color:#444;">
              ${productosProcesados
                .map(
                  (item) => `
                    <li style="margin-bottom:8px;">
                      <strong>${item.nombreProducto}</strong><br>
                      Cantidad: ${item.cantidadFinal} - 
                      Precio: <span style="color:#00b0f0; font-weight:bold;">$${item.precioConDescuento.toFixed(2)}</span>
                    </li>`
                )
                .join("")}
            </ul>

            <p style="font-size:16px; margin:20px 0 0 0;">¡Gracias por confiar en nosotros!</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f1f1f1; padding:15px; text-align:center; font-size:14px; color:#666;">
            <p style="margin:0;">Si tienes alguna duda, responde a este correo o contáctanos por WhatsApp.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`,
        })

        return ctx.send({
          message: "Orden creada con éxito",
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
