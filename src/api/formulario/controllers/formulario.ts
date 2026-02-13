/**
 * formulario controller
 */

import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::formulario.formulario",
  ({ strapi }) => ({
    async create(ctx) {
      const { name, email, message, phone, negocio, tipoFormulario } =
        ctx.request.body || {}

      // Validar que los datos obligatorios están presentes
      if (!name || !email) {
        return ctx.badRequest(
          "Faltan datos obligatorios: nombre y correo electrónico.",
        )
      }

      try {
        // Guardar los datos en la base de datos
        const formularioGuardado = await strapi.entityService.create(
          "api::formulario.formulario",
          {
            data: {
              name,
              email,
              message,
              phone,
              negocio,
              tipoFormulario: tipoFormulario || "contacto",
            },
          },
        )

        const adminEmail = "contacto@redxmayor.com"

        // Enviar correo al administrador
        await strapi.plugins["email"].services.email.send({
          to: adminEmail,
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: `Nuevo contacto - ${tipoFormulario === "vender" ? "Quiere vender" : "Consulta"}`,
          html: `
<table style="width:100%; background-color:#f4f4f8; padding:20px; font-family:Arial,sans-serif;">
  <tr>
    <td>
      <table style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#8f9fd1; padding:20px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px;">Nuevo contacto recibido</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px; color:#1a1a36;">
            <p style="font-size:16px; margin:0 0 8px 0;"><strong>Tipo:</strong> ${tipoFormulario === "vender" ? "Quiere vender en la plataforma" : "Consulta general"}</p>
            <p style="font-size:16px; margin:0 0 8px 0;"><strong>Nombre:</strong> ${name}</p>
            <p style="font-size:16px; margin:0 0 8px 0;"><strong>Email:</strong> ${email}</p>
            <p style="font-size:16px; margin:0 0 8px 0;"><strong>Teléfono:</strong> ${phone || "No especificado"}</p>
            <p style="font-size:16px; margin:0 0 8px 0;"><strong>Negocio:</strong> ${negocio || "No especificado"}</p>
            <p style="font-size:16px; margin:12px 0 8px 0;"><strong>Mensaje:</strong></p>
            <p style="font-size:16px; margin:0; padding:12px; background:#f4f4f8; border-radius:6px; border-left:4px solid #8f9fd1;">${message || "No especificado"}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#1a1a36; padding:15px; text-align:center; font-size:14px; color:#8f9fd1;">
            <p style="margin:0;">RedXMayor - Panel de administración</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
          `,
        })

        // Enviar correo al usuario que completó el formulario
        await strapi.plugins["email"].services.email.send({
          to: email,
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "Ya recibimos tu mensaje",
          html: `
<table style="width:100%; background-color:#f4f4f8; padding:20px; font-family:Arial,sans-serif;">
  <tr>
    <td>
      <table style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#8f9fd1; padding:20px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px;">¡Gracias por contactarnos!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px; color:#1a1a36;">
            <p style="font-size:16px; margin:0 0 12px 0;">Hola <strong>${name}</strong>,</p>
            <p style="font-size:16px; margin:0 0 16px 0;">${
              tipoFormulario === "vender"
                ? "Hemos recibido tu solicitud para vender en nuestra plataforma y nuestro equipo se pondrá en contacto contigo pronto."
                : "Hemos recibido tu consulta y nuestro equipo se pondrá en contacto contigo pronto."
            }</p>
            ${message ? `<p style="font-size:16px; margin:0 0 8px 0;">Tu mensaje:</p><p style="font-size:16px; margin:0; padding:12px; background:#f4f4f8; border-radius:6px; border-left:4px solid #8f9fd1;">${message}</p>` : ""}
            <p style="font-size:16px; margin:16px 0 0 0;">¡Gracias por confiar en nosotros!</p>
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

        // Retornar respuesta exitosa
        return ctx.send({
          message: "Formulario enviado correctamente.",
          data: formularioGuardado,
        })
      } catch (error) {
        strapi.log.error("Error al procesar el formulario:", error)
        return ctx.internalServerError(
          "Hubo un problema al procesar el formulario.",
        )
      }
    },
  }),
)
