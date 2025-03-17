import axios from "axios"
import { parse } from "csv-parse/sync"

export default {
  async afterCreate(event) {
    const { result } = event

    strapi.log.info("📌 Datos de CSV en el evento:")
    console.log(result.CSV)

    // Verificar si el CSV tiene una URL (Cloudinary)
    if (result.CSV && result.CSV.url) {
      try {
        const csvUrl = result.CSV.url

        // Descargar el archivo CSV desde Cloudinary
        strapi.log.info(`📥 Descargando CSV desde: ${csvUrl}`)
        const response = await axios.get(csvUrl, { responseType: "text" })
        const csvData = response.data

        // Procesar CSV
        const records = parse(csvData, {
          columns: true,
          skip_empty_lines: true,
        })

        strapi.log.info(
          `📌 CSV procesado correctamente. ${records.length} registros encontrados.`
        )

        // 🔥 Actualizar productos en la BD
        for (const record of records) {
          const { slug, precioBase, stock } = record

          // Buscar el producto en la BD
          const existingProduct = await strapi.entityService.findMany(
            "api::product.product",
            {
              filters: { slug },
            }
          )

          if (existingProduct.length > 0) {
            // Actualizar el producto
            await strapi.entityService.update(
              "api::product.product",
              existingProduct[0].id,
              {
                data: {
                  precioBase: parseFloat(precioBase),
                  stock: parseInt(stock, 10),
                },
              }
            )

            strapi.log.info(`✅ Producto actualizado: ${slug}`)
          } else {
            strapi.log.warn(`⚠️ Producto no encontrado: ${slug}`)
          }
        }

        strapi.log.info("🎯 Actualización masiva completada con éxito.")
      } catch (error) {
        strapi.log.error("❌ Error procesando el CSV:", error)
      }
    } else {
      strapi.log.error("❌ No se encontró un archivo CSV en el evento.")
    }
  },
}
