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
      to: '/ordenes-panel',
      icon: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM14 2v5h5M9 13h6M9 17h6" />
        </svg>
      ),
      intlLabel: { id: 'ordenes-panel.plugin.name', defaultMessage: 'Órdenes' },
      Component: async () => {
        const { OrdenesPage } = await import('./extensions/OrdenesPage')
        return OrdenesPage
      },
      permissions: [],
    })

    app.addMenuLink({
      to: '/contabilium-sync',
      icon: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4v5h5M20 20v-5h-5M4.6 9a7.5 7.5 0 0 1 12.85-3.36L20 9M4 15l2.55 3.36A7.5 7.5 0 0 0 19.4 15" />
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
