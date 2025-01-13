module.exports = ({ env }) => ({
  // Configuración de Cloudinary
  upload: {
    config: {
      provider: "cloudinary",
      providerOptions: {
        cloud_name: env("CLOUDINARY_NAME"),
        api_key: env("CLOUDINARY_API_KEY"),
        api_secret: env("CLOUDINARY_API_SECRET"),
      },
      actionOptions: {
        upload: {},
        delete: {},
      },
    },
  },
  // Configuración de nodemailer para enviar correos
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: env("EMAIL_SMTP_HOST"), 
        port: env.int("EMAIL_SMTP_PORT"), 
        auth: {
          user: env("EMAIL_SMTP_USER"),
          pass: env("EMAIL_SMTP_PASS"),
        },
        secure: true, 
      },
      settings: {
        defaultFrom: env("EMAIL_ADDRESS_FROM"), 
        defaultReplyTo: env("EMAIL_ADDRESS_REPLY"),
      },
    },
  },
})
