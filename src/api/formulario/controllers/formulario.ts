/**
 * formulario controller
 */

import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::formulario.formulario",
  ({ strapi }) => ({
    async create(ctx) {
      const { name, email, message, phone } = ctx.request.body || {}

      // Validar que los datos obligatorios están presentes
      if (!name || !email || !message) {
        return ctx.badRequest(
          "Faltan datos obligatorios: nombre, correo electrónico o mensaje."
        )
      }

      try {
        // Guardar los datos en la base de datos si es necesario
        const formularioGuardado = await strapi.entityService.create(
          "api::formulario.formulario",
          {
            data: { name, email, message, phone },
          }
        )

        const adminEmail = "contacto@redxmayor.com"

        // Enviar correo al administrador
        await strapi.plugins["email"].services.email.send({
          to: adminEmail,
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "Se recibió un nuevo contacto",
          html: `
          <h1>Se recibió un nuevo contacto</h1>
          <p><strong>Nombre:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Teléfono:</strong> ${phone || "No especificado"}</p>
          <p><strong>Mensaje:</strong></p>
          <p>${message}</p>
          `,
        })

        // Enviar correo al usuario que completó el formulario
        await strapi.plugins["email"].services.email.send({
          to: email,
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "Ya recibimos tu consulta",
          html: `
          <h1>Gracias por contactarnos</h1>
          <p>Hola ${name},</p>
          <p>Hemos recibido tu consulta y nuestro equipo se pondrá en contacto contigo pronto.</p>
          <p>Tu mensaje:</p>
          <blockquote>${message}</blockquote>
          <p>¡Gracias por confiar en nosotros!</p>
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
          "Hubo un problema al procesar el formulario."
        )
      }
    },
  })
)
