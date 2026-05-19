import { factories } from "@strapi/strapi"
import { MercadoPagoConfig, Payment as MPPayment } from "mercadopago"
import { enviarVenta, facturarVenta } from "../../../services/contabilium"

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
})

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
            "La dirección no pertenece al usuario autenticado.",
          )

        const detallesUsuario = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({ where: { user: usuario.id } })

        strapi.log.info(`[Orden] Iniciando | Usuario: ${usuario.email} | Método: ${metodoPago} | Productos: ${productos.length}`)

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
          },
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
              })

            if (!producto || !producto.activo) {
              return ctx.badRequest(
                `El producto con ID ${item.id} no está disponible.`,
              )
            }

            const cantidadSolicitada = item.cantidad
            const cantidadFinal = Math.min(cantidadSolicitada, producto.stock)

            if (cantidadFinal === 0) {
              return ctx.badRequest(
                `El producto ${producto.nombreProducto} no tiene stock disponible.`,
              )
            }

            // Descuento
            let precioConDescuento = producto.precioBase
            if (producto.porcentajeDescuento > 0) {
              precioConDescuento =
                producto.precioBase *
                (1 - producto.porcentajeDescuento / 100)
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
              },
            )

            productosProcesados.push({
              slug: producto.slug,
              nombreProducto: producto.nombreProducto,
              subtitulo: producto.Subtitulo || null,
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
                `Combo con documentId ${item.documentId} no encontrado.`,
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
              },
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
                      `<li>${prod.nombre} (${prod.slug}) - Cantidad: ${prod.cantidad}</li>`,
                  )
                  .join("")}
              </ul>`,
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
                    `<li><strong>${item.slug}</strong> - ${item.nombreProducto}${item.subtitulo ? ` - ${item.subtitulo}` : ""} - Cantidad: ${item.cantidadFinal} - Precio: $${item.precioConDescuento.toFixed(2)}</li>`,
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
<table style="width:100%; background-color:#f4f4f8; padding:20px; font-family:Arial,sans-serif;">
  <tr>
    <td>
      <table style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#8f9fd1; padding:20px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px;">¡Gracias por tu compra, ${usuario.username}!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px; color:#1a1a36;">
            <p style="font-size:16px; margin:0 0 10px 0;">Fecha de la compra: <strong>${fechaFormateada}</strong></p>
            <p style="font-size:16px; margin:0 0 20px 0;">Hemos recibido tu pedido y lo estamos procesando. Pronto nos pondremos en contacto contigo.</p>

            <h2 style="font-size:20px; margin:0 0 10px 0; color:#1a1a36;">Resumen de tu pedido:</h2>
            <ul style="padding-left:20px; margin:0 0 20px 0; font-size:16px; color:#1a1a36;">
              ${productosProcesados
                .map(
                  (item) => `
                    <li style="margin-bottom:8px;">
                      <strong>${item.nombreProducto}</strong>${item.subtitulo ? `<br><span style="color:#666;">${item.subtitulo}</span>` : ""}<br>
                      Cantidad: ${item.cantidadFinal} -
                      Precio: <span style="color:#8f9fd1; font-weight:bold;">$${item.precioConDescuento.toFixed(2)}</span>
                    </li>`,
                )
                .join("")}
            </ul>

            <p style="font-size:16px; margin:20px 0 0 0;">¡Gracias por confiar en nosotros!</p>
          </td>
        </tr>
        <tr>
          <td style="background:#1a1a36; padding:15px; text-align:center; font-size:14px; color:#8f9fd1;">
            <p style="margin:0;">Si tienes alguna duda, responde a este correo o contáctanos por WhatsApp.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`,
        })

        strapi.log.info(`[Orden] Creada exitosamente | ID: ${nuevaOrden.id} | Usuario: ${usuario.email} | Productos: ${productosProcesados.length}`)

        // Contabilium: enviar venta (no-blocking — no corta el flujo si falla)
        ;(async () => {
          try {
            await enviarVenta({
              ordenId: nuevaOrden.id,
              metodoPago,
              usuario: { email: usuario.email, username: usuario.username },
              detallesUsuario,
              productos: productosProcesados.map((item) => ({
                nombre: item.nombreProducto,
                slug: item.slug,
                cantidad: item.cantidadFinal,
                precioConDescuento: item.precioConDescuento,
              })),
              observaciones: observaciones || "",
            })
            strapi.log.info(`[Contabilium] Venta enviada | Orden: RXM-${nuevaOrden.id}`)
          } catch (err) {
            strapi.log.error(`[Contabilium] Error al enviar venta | Orden: RXM-${nuevaOrden.id} | ${err}`)
          }
        })()

        return ctx.send({
          message: "Orden creada con éxito",
          orden: nuevaOrden,
          productos: productosProcesados,
        })
      } catch (error) {
        strapi.log.error(`[Orden] Error al crear | Usuario: ${usuario.email} | Error: ${error}`)
        return ctx.internalServerError("Ocurrió un error al procesar la orden.")
      }
    },

    async pagarConTarjeta(ctx) {
      const { mpFormData, direccion, productos, observaciones, cupon, totalFrontend } =
        ctx.request.body || {}
      const usuario = ctx.state.user

      if (!usuario) return ctx.unauthorized("No autorizado.")
      if (!mpFormData || !direccion || !productos || productos.length === 0)
        return ctx.badRequest("Faltan datos obligatorios.")

      try {
        // 1. Validar dirección
        const direccionValida = await strapi.db
          .query("api::direccion.direccion")
          .findOne({ where: { id: direccion, users_permissions_user: usuario.id } })

        if (!direccionValida)
          return ctx.badRequest("La dirección no pertenece al usuario autenticado.")

        // Obtener detalles del usuario para Contabilium
        const detallesUsuario = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({ where: { user: usuario.id } })

        // 2. Validar cupón
        let porcentajeDescuentoCupon = null
        if (cupon) {
          const cuponNormalizado = cupon.trim().toUpperCase()
          const cuponValido = await strapi.db
            .query("api::cupon.cupon")
            .findOne({ where: { codigo: cuponNormalizado, activo: true } })
          if (cuponValido && new Date(cuponValido.fechaExpiracion) >= new Date()) {
            porcentajeDescuentoCupon = cuponValido.porcentajeDescuento
          }
        }

        // 3. Calcular total real desde el backend
        let totalReal = 0
        const productosProcesados = []

        for (const item of productos) {
          const whereClause = !isNaN(Number(item.id))
            ? { id: parseInt(item.id) }
            : { documentId: item.id }

          const producto = await strapi.db
            .query("api::product.product")
            .findOne({ where: whereClause })

          if (!producto || !producto.activo)
            return ctx.badRequest(`Producto ${item.id} no disponible.`)

          const cantidadFinal = Math.min(item.cantidad, producto.stock)
          if (cantidadFinal === 0)
            return ctx.badRequest(`Sin stock: ${producto.nombreProducto}`)

          let precioConDescuento = producto.precioBase
          if (producto.porcentajeDescuento > 0) {
            precioConDescuento = producto.precioBase * (1 - producto.porcentajeDescuento / 100)
          } else if (porcentajeDescuentoCupon) {
            precioConDescuento = producto.precioBase * (1 - porcentajeDescuentoCupon / 100)
          }

          totalReal += precioConDescuento * cantidadFinal
          productosProcesados.push({ producto, cantidadFinal, precioConDescuento })
        }

        // 4. Validar que el total del frontend coincida con el recalculado
        if (totalFrontend !== undefined) {
          const diferencia = Math.abs(Math.round(totalReal) - Math.round(Number(totalFrontend)))
          if (diferencia > 0) {
            strapi.log.warn(`[MP] Discrepancia de precio | Frontend: $${totalFrontend} | Backend: $${totalReal} | Usuario: ${usuario.email}`)
            return ctx.badRequest("El precio de uno o más productos cambió desde que cargaste el checkout. Actualizá la página e intentá de nuevo.")
          }
        }

        // 5. Crear la orden en Strapi primero (para obtener el ID como referencia)
        const nuevaOrden = await strapi.entityService.create("api::orden.orden", {
          data: {
            user: usuario.id,
            estado: "Pendiente",
            direccion,
            metodoPago: "MercadoPago",
            observaciones,
          },
        })

        strapi.log.info(`[MP] Iniciando pago | Orden: RXM-${nuevaOrden.id} | Usuario: ${usuario.email} | Monto: $${Math.round(totalReal * 100) / 100} | Productos: ${productosProcesados.length}`)

        // 5. Cobrar con MercadoPago
        const mpPayment = new MPPayment(mpClient)
        const pagoMP = await mpPayment.create({
          body: {
            transaction_amount: Math.round(totalReal * 100) / 100,
            token: mpFormData.token,
            issuer_id: mpFormData.issuer_id,
            installments: mpFormData.installments,
            payment_method_id: mpFormData.payment_method_id,
            description: "Compra en RedXMayor",
            external_reference: `RXM-${nuevaOrden.id}`,
            binary_mode: true,
            payer: {
              email: usuario.email,
              identification: mpFormData.payer?.identification,
            },
          },
          requestOptions: {
            idempotencyKey: `orden-${nuevaOrden.id}`,
          },
        })

        strapi.log.info(`[MP] Respuesta | Orden: RXM-${nuevaOrden.id} | Status: ${pagoMP.status} | Detail: ${pagoMP.status_detail} | MP ID: ${pagoMP.id}`)

        if (pagoMP.status !== "approved") {
          // Marcar la orden como cancelada si el pago no fue aprobado
          await strapi.entityService.update("api::orden.orden", nuevaOrden.id, {
            data: { estado: "Cancelado" },
          })
          strapi.log.warn(`[MP] Pago rechazado | Orden: RXM-${nuevaOrden.id} | Status: ${pagoMP.status} | Detail: ${pagoMP.status_detail}`)
          return ctx.badRequest(`Pago no aprobado: ${pagoMP.status_detail}`)
        }

        // 6. Pago aprobado: descontar stock y crear orden-productos
        for (const { producto, cantidadFinal, precioConDescuento } of productosProcesados) {
          await strapi.db.query("api::product.product").update({
            where: { id: producto.id },
            data: { stock: producto.stock - cantidadFinal },
          })

          await strapi.entityService.create("api::orden-producto.orden-producto", {
            data: {
              orden: nuevaOrden.id,
              producto: producto.documentId,
              cantidad: cantidadFinal,
              precioUnidad: producto.precioBase,
              precioConDescuento,
            },
          })
        }

        // Actualizar orden a Pagado
        await strapi.entityService.update("api::orden.orden", nuevaOrden.id, {
          data: { estado: "Pagado" },
        })

        strapi.log.info(`[MP] Pago aprobado | Orden: RXM-${nuevaOrden.id} | MP ID: ${pagoMP.id} | Total: $${Math.round(totalReal * 100) / 100}`)

        // Contabilium: enviar venta + facturar (no-blocking — no corta el flujo si falla)
        ;(async () => {
          try {
            await enviarVenta({
              ordenId: nuevaOrden.id,
              metodoPago: "MercadoPago",
              usuario: { email: usuario.email, username: usuario.username },
              detallesUsuario,
              productos: productosProcesados.map(({ producto, cantidadFinal, precioConDescuento }) => ({
                nombre: producto.nombreProducto,
                slug: producto.slug,
                cantidad: cantidadFinal,
                precioConDescuento,
              })),
              observaciones: observaciones || "",
            })
            strapi.log.info(`[Contabilium] Venta enviada | Orden: RXM-${nuevaOrden.id}`)

            if (detallesUsuario?.CUIT) {
              const facturaData = await facturarVenta(nuevaOrden.id)
              if (facturaData) {
                await strapi.entityService.update("api::orden.orden", nuevaOrden.id, {
                  data: {
                    linkFactura: facturaData.linkFactura,
                    numeroFactura: facturaData.numeroFactura,
                    caeFactura: facturaData.caeFactura,
                  },
                })
                strapi.log.info(`[Contabilium] Factura emitida | Orden: RXM-${nuevaOrden.id} | Número: ${facturaData.numeroFactura} | CAE: ${facturaData.caeFactura}`)
              }
            } else {
              strapi.log.warn(`[Contabilium] Factura omitida | Orden: RXM-${nuevaOrden.id} | El usuario no tiene CUIT cargado`)
            }
          } catch (err) {
            strapi.log.error(`[Contabilium] Error | Orden: RXM-${nuevaOrden.id} | ${err}`)
          }
        })()

        // 7. Mails
        const fecha = new Date()
        const fechaFormateada = `${fecha.getDate().toString().padStart(2, "0")}/${(fecha.getMonth() + 1).toString().padStart(2, "0")}/${fecha.getFullYear()}`

        await strapi.plugins["email"].services.email.send({
          to: ["contacto@redxmayor.com", "davirapo@gmail.com"],
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "Nueva venta registrada en RedXMayor (Tarjeta)",
          html: `
            <h1>Nueva venta registrada</h1>
            <p>Fecha: ${fechaFormateada}</p>
            <p><strong>Cliente:</strong> ${usuario.username} - ${usuario.email}</p>
            <p><strong>Dirección:</strong> ${direccionValida.direccion}, ${direccionValida.ciudad}</p>
            <p><strong>Pago MP ID:</strong> ${pagoMP.id}</p>
            <p><strong>Referencia:</strong> RXM-${nuevaOrden.id}</p>
            <h2>Productos</h2>
            <ul>
              ${productosProcesados.map(({ producto, cantidadFinal, precioConDescuento }) =>
                `<li><strong>${producto.slug}</strong> - ${producto.nombreProducto}${producto.Subtitulo ? ` - ${producto.Subtitulo}` : ""} - Cantidad: ${cantidadFinal} - Precio: $${precioConDescuento.toFixed(2)}</li>`
              ).join("")}
            </ul>
          `,
        })

        await strapi.plugins["email"].services.email.send({
          to: usuario.email,
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "¡Gracias por tu compra en RedXMayor!",
          html: `
<table style="width:100%; background-color:#f4f4f8; padding:20px; font-family:Arial,sans-serif;">
  <tr><td>
    <table style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
      <tr><td style="background-color:#8f9fd1; padding:20px; text-align:center;">
        <h1 style="color:#ffffff; margin:0; font-size:24px;">¡Gracias por tu compra, ${usuario.username}!</h1>
      </td></tr>
      <tr><td style="padding:20px; color:#1a1a36;">
        <p style="font-size:16px; margin:0 0 10px 0;">Fecha: <strong>${fechaFormateada}</strong></p>
        <p style="font-size:16px; margin:0 0 20px 0;">Tu pago fue aprobado. Pronto nos pondremos en contacto.</p>
        <h2 style="font-size:20px; margin:0 0 10px 0;">Resumen:</h2>
        <ul style="padding-left:20px; margin:0 0 20px 0; font-size:16px;">
          ${productosProcesados.map(({ producto, cantidadFinal, precioConDescuento }) => `
            <li style="margin-bottom:8px;">
              <strong>${producto.nombreProducto}</strong>${producto.Subtitulo ? `<br><span style="color:#666;">${producto.Subtitulo}</span>` : ""}<br>
              Cantidad: ${cantidadFinal} - Precio: <span style="color:#8f9fd1; font-weight:bold;">$${precioConDescuento.toFixed(2)}</span>
            </li>`).join("")}
        </ul>
      </td></tr>
      <tr><td style="background:#1a1a36; padding:15px; text-align:center; font-size:14px; color:#8f9fd1;">
        <p style="margin:0;">Si tienes alguna duda, contáctanos por WhatsApp.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`,
        })

        return ctx.send({
          message: "Pago aprobado y orden creada",
          orden: nuevaOrden,
          mpPaymentId: pagoMP.id,
        })
      } catch (error: any) {
        // El SDK de MP puede lanzar error para pagos rechazados — capturamos el detalle
        const mpStatus = error?.cause?.[0]?.description || error?.message || String(error)
        const mpStatusDetail = error?.status_detail || error?.cause?.[0]?.code || "desconocido"
        strapi.log.warn(`[MP] Pago rechazado (excepción SDK) | Usuario: ${ctx.state.user?.email} | Status detail: ${mpStatusDetail} | Error: ${mpStatus}`)
        return ctx.badRequest(`Pago no aprobado: ${mpStatusDetail}`)
      }
    },
  }),
)
