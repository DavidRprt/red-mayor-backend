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
          <h1>Se recibió un nuevo contacto</h1>
          <p><strong>Tipo:</strong> ${tipoFormulario === "vender" ? "Quiere vender en la plataforma" : "Consulta general"}</p>
          <p><strong>Nombre:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Teléfono:</strong> ${phone || "No especificado"}</p>
          <p><strong>Negocio:</strong> ${negocio || "No especificado"}</p>
          <p><strong>Mensaje:</strong></p>
          <p>${message || "No especificado"}</p>
          `,
        })

        // Enviar correo al usuario que completó el formulario
        await strapi.plugins["email"].services.email.send({
          to: email,
          from: strapi.config.get("plugin.email.settings.defaultFrom"),
          subject: "Ya recibimos tu mensaje",
          html: `
          <h1>Gracias por contactarnos</h1>
          <p>Hola ${name},</p>
          <p>${
            tipoFormulario === "vender"
              ? "Hemos recibido tu solicitud para vender en nuestra plataforma y nuestro equipo se pondrá en contacto contigo pronto."
              : "Hemos recibido tu consulta y nuestro equipo se pondrá en contacto contigo pronto."
          }</p>
          ${message ? `<p>Tu mensaje:</p><blockquote>${message}</blockquote>` : ""}
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
          "Hubo un problema al procesar el formulario.",
        )
      }
    },
  }),
)
