import type { StrapiApp } from "@strapi/strapi/admin"

export default {
  config: {
    locales: ["es"],
  },
  translations: {
    es: {
      "Auth.form.welcome.subtitle": "Inicie sesión",
    },
    en: {
      "Auth.form.welcome.subtitle": "Log in to your account",
    },
  },
  bootstrap(app: StrapiApp) {
    console.log(app)
  },
}
