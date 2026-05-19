/**
 * direccion controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::direccion.direccion', ({ strapi }) => ({

  async eliminar(ctx) {
    const authHeader = ctx.request.header.authorization
    if (!authHeader) return ctx.unauthorized('No autorizado.')

    const token = authHeader.split(' ')[1]
    const decoded = await strapi.plugins['users-permissions'].services.jwt.verify(token)
    const userId = decoded?.id
    if (!userId) return ctx.unauthorized('Token inválido.')

    const { id } = ctx.params

    const direccion = await strapi.db.query('api::direccion.direccion').findOne({
      where: { id },
      populate: { users_permissions_user: { fields: ['id'] } },
    })

    if (!direccion) {
      strapi.log.warn(`[Direccion] Eliminar: no encontrada | ID: ${id} | Usuario: ${userId}`)
      return ctx.notFound('Dirección no encontrada.')
    }
    if (direccion.users_permissions_user?.id !== userId) {
      strapi.log.warn(`[Direccion] Eliminar: intento no autorizado | ID: ${id} | Usuario: ${userId}`)
      return ctx.forbidden('No autorizado.')
    }

    await strapi.db.query('api::direccion.direccion').update({
      where: { id },
      data: { eliminado: true },
    })

    strapi.log.info(`[Direccion] Eliminada | ID: ${id} | Usuario: ${userId}`)
    return ctx.send({ success: true })
  },

  async actualizar(ctx) {
    const authHeader = ctx.request.header.authorization
    if (!authHeader) return ctx.unauthorized('No autorizado.')

    const token = authHeader.split(' ')[1]
    const decoded = await strapi.plugins['users-permissions'].services.jwt.verify(token)
    const userId = decoded?.id
    if (!userId) return ctx.unauthorized('Token inválido.')

    const { id } = ctx.params

    const direccion = await strapi.db.query('api::direccion.direccion').findOne({
      where: { id },
      populate: { users_permissions_user: { fields: ['id'] } },
    })

    if (!direccion) {
      strapi.log.warn(`[Direccion] Actualizar: no encontrada | ID: ${id} | Usuario: ${userId}`)
      return ctx.notFound('Dirección no encontrada.')
    }
    if (direccion.users_permissions_user?.id !== userId) {
      strapi.log.warn(`[Direccion] Actualizar: intento no autorizado | ID: ${id} | Usuario: ${userId}`)
      return ctx.forbidden('No autorizado.')
    }

    const { nombre, direccion: dir, ciudad, provincia, codigoPostal, referencias } = ctx.request.body

    await strapi.db.query('api::direccion.direccion').update({
      where: { id },
      data: { nombre, direccion: dir, ciudad, provincia, codigoPostal, referencias },
    })

    strapi.log.info(`[Direccion] Actualizada | ID: ${id} | Usuario: ${userId}`)
    return ctx.send({ success: true })
  },
}))
