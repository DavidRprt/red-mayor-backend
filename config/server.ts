import { sincronizarStock } from '../src/services/stock-sync';

export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: true,
    tasks: {
      sincronizarStockContabilium: {
        options: { rule: '0 0 * * *', tz: 'America/Argentina/Buenos_Aires' },
        task: async ({ strapi }: { strapi: any }) => {
          await sincronizarStock(strapi);
        },
      },
    },
  },
});
