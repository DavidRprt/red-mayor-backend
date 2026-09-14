import { sincronizarStock, obtenerProgresoSync } from '../../../services/stock-sync';

function validarSesionAdmin(ctx: any): boolean {
  const authHeader = ctx.request.header.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { isValid } = token
    ? strapi.service('admin::token').decodeJwtToken(token)
    : { isValid: false };
  return isValid;
}

export default {
  /**
   * POST /contabilium-sync/run
   * Dispara la sincronización en segundo plano y responde al toque —
   * puede tardar bastante según la cantidad de productos, así que el admin
   * no se queda esperando una sola request colgada: consulta el avance con
   * GET /contabilium-sync/progreso (polling).
   * La ruta tiene auth:false porque valida la sesión de admin a mano (mismo
   * patrón que /permisos/check para el JWT público).
   */
  async run(ctx: any) {
    if (!validarSesionAdmin(ctx)) {
      return ctx.unauthorized('Se requiere sesión de administrador.');
    }

    if (obtenerProgresoSync().corriendo) {
      return ctx.send({ data: { iniciado: false, yaEnCurso: true } });
    }

    sincronizarStock(strapi).catch((err: any) => {
      strapi.log.error(`[Stock Sync] Error al correr manualmente: ${err}`);
    });

    return ctx.send({ data: { iniciado: true } });
  },

  async progreso(ctx: any) {
    if (!validarSesionAdmin(ctx)) {
      return ctx.unauthorized('Se requiere sesión de administrador.');
    }

    return ctx.send({ data: obtenerProgresoSync() });
  },
};
