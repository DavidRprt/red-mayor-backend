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

        const detallesUsuario = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({ where: { user: usuario.id } })

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
            cantidadSolicitada,
            cantidadFinal,
            precioUnidad: producto.precioBase,
            precioConDescuento,
          })
        }

        const fecha = new Date()
        const fechaFormateada = `${fecha.getDate().toString().padStart(2, "0")}/${(
          fecha.getMonth() + 1
        )
          .toString()
          .padStart(2, "0")}/${fecha.getFullYear()} ${fecha
          .getHours()
          .toString()
          .padStart(
            2,
            "0"
          )}:${fecha.getMinutes().toString().padStart(2, "0")}:${fecha
          .getSeconds()
          .toString()
          .padStart(2, "0")}`

        // Enviar un email de agradecimiento al usuario
        try {
          await strapi.plugins["email"].services.email.send({
            to: usuario.email,
            from: strapi.config.get("plugin.email.settings.defaultFrom"),
            subject: "¡Gracias por tu compra en RedXMayor!",
            html: `
<table style="width: 100%; background-color: #000000; padding: 20px; font-family: Arial, sans-serif; color: #ffffff;">
  <tr>
    <td>
      <table style="max-width: 600px; margin: 0 auto; background-color: #1a1a1a; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);">
        <thead>
          <tr>
            <th style="padding: 20px; text-align: center;">
              <img src="https://res.cloudinary.com/dazyde0ys/image/upload/v1736794245/logo_dark_b20165d4a0.png" alt="RedXMayor" style="max-width: 200px; margin-bottom: 15px;">
              <h1 style="margin: 0; font-size: 24px; color: #00b0f0;">¡Gracias por tu compra, ${usuario.username}!</h1>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 20px; color: #ffffff;">
              <p style="font-size: 16px;">Fecha de la compra: ${fechaFormateada}</p>
              <p style="font-size: 16px;">Hemos recibido tu pedido y lo estamos procesando.</p>
              <p style="font-size: 18px; font-weight: bold;">Resumen del Pedido:</p>
              <ul style="padding-left: 20px; font-size: 16px;">
                ${productosProcesados
                  .map(
                    (item) =>
                      `<li style="margin-bottom: 10px;">
                        <strong>${item.slug}</strong><br>
                        Cantidad: ${item.cantidadFinal} <br>
                        Precio por unidad: $${item.precioUnidad.toFixed(2)}<br>
                        Precio con descuento: $${item.precioConDescuento.toFixed(2)}
                      </li>`
                  )
                  .join("")}
              </ul>
              <p style="font-size: 16px;">¡Gracias por confiar en nosotros!</p>
            </td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>
</table>
            `,
          })

          // Enviar un email al administrador con los detalles de la venta
          await strapi.plugins["email"].services.email.send({
            to: "davirapo@gmail.com",
            from: strapi.config.get("plugin.email.settings.defaultFrom"),
            subject: "Nueva venta registrada en RedXMayor",
            html: `
<table style="width: 100%; background-color: #000000; padding: 20px; font-family: Arial, sans-serif; color: #ffffff;">
  <tr>
    <td>
      <h1 style="color: #00b0f0;">Nueva venta registrada</h1>
      <p>Fecha: ${fechaFormateada}</p>
      <p><strong>Datos del Cliente:</strong></p>
<ul>
  <li>Nombre del Negocio: ${usuario.username}</li>  
  <li>Email: ${usuario.email}</li>
  <li>Razón Social: ${detallesUsuario.razonSocial}</li>
  <li>CUIT: ${detallesUsuario.CUIT}</li>
  <li>Tipo de Usuario: ${detallesUsuario.tipoUsuario}</li>
  <li>Teléfono: ${detallesUsuario.telefono}</li>
  <li>Método de Pago: ${metodoPago}</li>
  <li style="margin-bottom: 10px;"><strong>Dirección:</strong>
    <ul style="list-style-type: none; padding-left: 15px;">
      <li>Calle: ${direccionValida.direccion}</li>
      <li>Ciudad: ${direccionValida.ciudad}</li>
      <li>Provincia: ${direccionValida.provincia}</li>
      <li>Código Postal: ${direccionValida.codigoPostal}</li>
      <li>Referencias: ${direccionValida.referencias || "N/A"}</li>
    </ul>
  </li>
</ul>
      <p><strong>Detalles de la Compra:</strong></p>
      <table style="width: 100%; border-collapse: collapse; color: #ffffff;">
        <thead>
          <tr style="background-color: #1a1a1a;">
            <th style="padding: 10px; border: 1px solid #ffffff;">Slug</th>
            <th style="padding: 10px; border: 1px solid #ffffff;">Cantidad</th>
            <th style="padding: 10px; border: 1px solid #ffffff;">Precio Unitario</th>
            <th style="padding: 10px; border: 1px solid #ffffff;">Precio con Descuento</th>
          </tr>
        </thead>
        <tbody>
          ${productosProcesados
            .map(
              (item) => `
            <tr>
              <td style="padding: 10px; border: 1px solid #ffffff;">${item.slug}</td>
              <td style="padding: 10px; border: 1px solid #ffffff;">${item.cantidadFinal}</td>
              <td style="padding: 10px; border: 1px solid #ffffff;">$${item.precioUnidad.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #ffffff;">$${item.precioConDescuento.toFixed(2)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </td>
  </tr>
</table>
            `,
          })

          strapi.log.info(`Email de agradecimiento enviado a ${usuario.email}`)
          strapi.log.info("Email de detalles enviado al administrador")
        } catch (emailError) {
          strapi.log.error(
            `Error al enviar los emails: ${emailError.message}`,
            emailError
          )
        }

        return ctx.send({
          message: "Orden creada con éxito. Se han enviado los correos.",
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
