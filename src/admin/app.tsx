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
    app.addMenuLink({
      to: '/contabilium-sync',
      icon: () => (
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 4v5h5M20 20v-5h-5M4.6 9a7.5 7.5 0 0 1 12.85-3.36L20 9M4 15l2.55 3.36A7.5 7.5 0 0 0 19.4 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      intlLabel: { id: 'contabilium-sync.plugin.name', defaultMessage: 'Sync Contabilium' },
      Component: async () => {
        const { ContabiliumSyncPage } = await import('./extensions/ContabiliumSyncPage')
        return ContabiliumSyncPage
      },
      permissions: [],
    })
  },
}
