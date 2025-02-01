import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::orden.orden",
  ({ strapi }) => ({
    async createWithProducts(ctx) {
      const { metodoPago, direccion, productos, observaciones, cupon } =
        ctx.request.body || {}

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

      async function validarCupon(cupon) {
        if (!cupon) return null

        try {
          // Convertir el cupón ingresado a mayúsculas
          const cuponNormalizado = cupon.trim().toUpperCase()

          const cuponValido = await strapi.db
            .query("api::cupon.cupon")
            .findOne({
              where: { codigo: cuponNormalizado, activo: true },
            })

          if (
            !cuponValido ||
            new Date(cuponValido.fechaExpiracion) < new Date()
          ) {
            console.log("CUPON NO VALIDO")
            return null // Cupón no válido o expirado
          }

          console.log("CUPON VALIDO")
          return cuponValido.porcentajeDescuento // Retorna el porcentaje de descuento
        } catch (error) {
          strapi.log.error("Error al validar el cupón:", error)
          return null
        }
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
              observaciones: observaciones,
            },
          }
        )

        const porcentajeDescuentoCupon = await validarCupon(cupon)

        const productosProcesados = []
        for (const item of productos) {
          const producto = await strapi.db
            .query("api::product.product")
            .findOne({
              where: { id: item.id },
              populate: ["descuentoPorMayor"],
            })

          if (!producto || !producto.activo) {
            return ctx.badRequest(
              `El producto con ID ${item.id} no está disponible.`
            )
          }

          const cantidadSolicitada = item.cantidad
          const stockDisponible = producto.stock
          const cantidadFinal = Math.min(cantidadSolicitada, stockDisponible)

          if (cantidadFinal === 0) {
            return ctx.badRequest(
              `El producto ${producto.nombreProducto} no tiene stock disponible.`
            )
          }

          let precioConDescuento = producto.precioBase

          // Verifica si el producto tiene descuento mayorista
          if (
            producto.descuentoPorMayor &&
            producto.descuentoPorMayor.activo &&
            cantidadFinal >= producto.descuentoPorMayor.cantidadMinima
          ) {
            const descuento =
              producto.descuentoPorMayor.porcentajeDescuento || 0
            precioConDescuento = producto.precioBase * (1 - descuento / 100)
          }

          // Aplica el descuento del cupón solo si no tiene otro descuento
          if (
            porcentajeDescuentoCupon &&
            precioConDescuento === producto.precioBase
          ) {
            precioConDescuento =
              producto.precioBase * (1 - porcentajeDescuentoCupon / 100)
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
          .padStart(2, "0")}/${fecha.getFullYear()}`

        // Enviar un email de agradecimiento al usuario
        try {
          await strapi.plugins["email"].services.email.send({
            to: usuario.email,
            from: strapi.config.get("plugin.email.settings.defaultFrom"),
            subject: "¡Gracias por tu compra en RedXMayor!",
            html: `
<table style="width: 100%; background-color: #ffffff; padding: 20px; font-family: Arial, sans-serif; color: #000000;">
  <tr>
    <td>
      <!-- Encabezado con logo -->
      <table style="max-width: 600px; margin: 0 auto; border-radius: 8px 8px 0 0; overflow: hidden; text-align: center;">
        <thead>
          <tr>
            <th style="padding: 20px; background-color: #1a1a1a; border-radius: 8px 8px 0 0;">
              <img src="https://res.cloudinary.com/dazyde0ys/image/upload/v1736794245/logo_dark_b20165d4a0.png" alt="RedXMayor" style="max-width: 200px; margin-bottom: 10px;">
              <h1 style="margin: 0; font-size: 24px; color: #00b0f0;">¡Gracias por tu compra, ${usuario.username}!</h1>
            </th>
          </tr>
        </thead>
      </table>

      <!-- Cuerpo del correo -->
      <table style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 0 0 8px 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
        <tbody>
          <tr>
            <td style="padding: 20px; color: #000000;">
              <p style="font-size: 16px;">Fecha de la compra: ${fechaFormateada}</p>
              <p style="font-size: 16px;">Hemos recibido tu pedido y lo estamos procesando. Pronto nos pondremos en contacto contigo.</p>
              <p style="font-size: 18px; font-weight: bold;">Resumen del Pedido:</p>
              <ul style="padding-left: 20px; font-size: 16px; color: #000000;">
                ${productosProcesados
                  .map(
                    (item) =>
                      `<li style="margin-bottom: 10px;">
                        <strong>${item.slug}</strong><br>
                        Cantidad: ${item.cantidadFinal} <br>
                        Precio: $${item.precioConDescuento.toFixed(2)}
                      </li>`
                  )
                  .join("")}
              </ul>
              <p style="font-size: 16px; margin-top: 20px;">¡Gracias por confiar en nosotros!</p>
              <hr style="border: none; border-top: 1px solid #cccccc; margin: 20px 0;">
              <p style="font-size: 16px; text-align: center;">¿Tienes dudas? Comunícate directamente con tu vendedor:</p>
              <p style="font-size: 18px; text-align: center; font-weight: bold;">
                <a href="https://wa.me/5493416712802" style="color: #0073e6; text-decoration: none;">📱 Enviar mensaje por WhatsApp</a>
              </p>
              <p style="text-align: center; color: #666666; font-size: 14px;">Nuestro equipo se comunicará contigo en breve para completar tu experiencia de compra.</p>
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
            to: "contacto@redxmayor.com",
            from: strapi.config.get("plugin.email.settings.defaultFrom"),
            subject: "Nueva venta registrada en RedXMayor",
            html: `
<table style="width: 100%; background-color: #ffffff; padding: 20px; font-family: Arial, sans-serif; color: #000000;">
  <tr>
    <td>
      <h1 style="color: #0073e6;">Nueva venta registrada</h1>
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
  <li>Observaciones: ${observaciones}</li>
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
      <table style="width: 100%; border-collapse: collapse; color: #000000;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 10px; border: 1px solid #cccccc;">Slug</th>
            <th style="padding: 10px; border: 1px solid #cccccc;">Cantidad</th>
            <th style="padding: 10px; border: 1px solid #cccccc;">Precio Unitario</th>
            <th style="padding: 10px; border: 1px solid #cccccc;">Precio con Descuento</th>
          </tr>
        </thead>
        <tbody>
          ${productosProcesados
            .map(
              (item) => `
            <tr>
              <td style="padding: 10px; border: 1px solid #cccccc;">${item.slug}</td>
              <td style="padding: 10px; border: 1px solid #cccccc;">${item.cantidadFinal}</td>
              <td style="padding: 10px; border: 1px solid #cccccc;">$${item.precioUnidad.toFixed(2)}</td>
              <td style="padding: 10px; border: 1px solid #cccccc;">$${item.precioConDescuento.toFixed(2)}</td>
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
