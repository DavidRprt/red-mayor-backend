import { sincronizarStock } from '../../../services/stock-sync';

export default {
  /**
   * POST /contabilium-sync/run
   * Dispara manualmente la misma sincronización de stock que corre el cron diario.
   * La ruta tiene auth:false porque valida la sesión de admin a mano (mismo
   * patrón que /permisos/check para el JWT público).
   */
  async run(ctx: any) {
    const authHeader = ctx.request.header.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const { isValid } = token
      ? strapi.service('admin::token').decodeJwtToken(token)
      : { isValid: false };

    if (!isValid) {
      return ctx.unauthorized('Se requiere sesión de administrador.');
    }

    try {
      const resultado = await sincronizarStock(strapi);
      return ctx.send({ data: resultado });
    } catch (err: any) {
      strapi.log.error(`[Stock Sync] Error al correr manualmente: ${err}`);
      return ctx.internalServerError('Error al sincronizar stock con Contabilium.');
    }
  },
};
