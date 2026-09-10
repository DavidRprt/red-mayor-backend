export default {
  /**
   * GET /permisos/check?nombre=calculadora-remitos
   * Verifica si el usuario autenticado (via JWT) tiene el permiso indicado.
   * No expone el listado de usuarios ni depende de los permisos públicos
   * de Strapi: valida el JWT manualmente y consulta la relación de forma interna.
   */
  async check(ctx: any) {
    const { nombre } = ctx.query;
    if (!nombre || typeof nombre !== 'string') {
      return ctx.badRequest('Falta el parámetro "nombre".');
    }

    const authHeader = ctx.request.header.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return ctx.send({ allowed: false }, 401);
    }

    let payload: { id: number };
    try {
      payload = await strapi
        .plugin('users-permissions')
        .service('jwt')
        .verify(token);
    } catch {
      return ctx.send({ allowed: false }, 401);
    }

    const permisos = await strapi.db.query('api::permiso.permiso').findMany({
      where: {
        nombre,
        usuarios: { id: payload.id },
      },
    });

    return ctx.send({ allowed: permisos.length > 0 });
  },
};
