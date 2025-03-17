import { factories } from "@strapi/strapi"

export default factories.createCoreController(
  "api::product.product",
  ({ strapi }) => ({
    async asignarMarcaAutomatica(ctx) {
      try {
        // Definir marca a asignar (ajustar si quieres cambiarla)
        const nombreMarca = "energizer"
        const marcaId = 1 // Reemplaza con el ID real de la marca en la base de datos

        // Buscar productos que contienen el nombre de la marca (sin importar si tienen otra marca asignada)
        const productos = await strapi.entityService.findMany(
          "api::product.product",
          {
            filters: {
              nombreProducto: {
                $containsi: nombreMarca, // Búsqueda insensible a mayúsculas/minúsculas
              },
            },
          }
        )

        if (productos.length === 0) {
          return ctx.send(
            { message: "No se encontraron productos para actualizar." },
            200
          )
        }

        // Actualizar cada producto encontrado (sin importar su marca actual)
        for (const producto of productos) {
          await strapi.entityService.update(
            "api::product.product",
            producto.id,
            {
              data: { marca: marcaId },
            }
          )
        }

        return ctx.send(
          {
            message: `Marca "${nombreMarca}" asignada a ${productos.length} productos.`,
          },
          200
        )
      } catch (error) {
        strapi.log.error("❌ Error asignando marca:", error)
        return ctx.internalServerError("Ocurrió un error en el servidor.")
      }
    },
  })
)
