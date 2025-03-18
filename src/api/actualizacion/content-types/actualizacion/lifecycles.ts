import axios from "axios"
import { parse } from "csv-parse/sync"

export default {
  async afterCreate(event) {
    const { result } = event

    strapi.log.info("📌 Datos de CSV en el evento:")
    console.log(result.CSV)

    if (result.CSV && result.CSV.url) {
      try {
        const csvUrl = result.CSV.url

        // Descargar CSV desde Cloudinary
        strapi.log.info(`📥 Descargando CSV desde: ${csvUrl}`)
        const response = await axios.get(csvUrl, { responseType: "text" })
        const csvData = response.data

        // Procesar CSV con separador correcto
        const records = parse(csvData, {
          columns: true,
          skip_empty_lines: true,
          delimiter: ";", // IMPORTANTE: Asegura que las columnas se separen correctamente
        })

        // Verificar la estructura real de los encabezados
        strapi.log.info(
          `📌 Encabezados detectados: ${Object.keys(records[0]).join(", ")}`
        )

        if (!records.length) {
          strapi.log.warn("⚠️ El CSV está vacío o mal formateado.")
          return
        }

        strapi.log.info(
          `📌 CSV procesado correctamente. ${records.length} registros encontrados.`
        )

        for (const record of records) {
          // Asegurar que las claves existen y no tienen espacios extra
          const codigo = record["Codigo"]?.trim()
          const precioFinal = record["Precio Final"]?.trim()?.replace(",", ".") // Reemplaza la coma decimal por un punto
          const stock = record["Stock"]?.trim()

          if (!codigo || !precioFinal || !stock) {
            strapi.log.warn(
              `⚠️ Datos incompletos en fila: ${JSON.stringify(record)}`
            )
            continue
          }

          // Buscar producto en la BD usando el código como slug
          const existingProduct = await strapi.entityService.findMany(
            "api::product.product",
            { filters: { slug: codigo } }
          )

          if (existingProduct.length > 0) {
            await strapi.entityService.update(
              "api::product.product",
              existingProduct[0].id,
              {
                data: {
                  precioBase: parseFloat(precioFinal), // Convertir precio a float
                  stock: parseInt(stock, 10), // Convertir stock a entero
                },
              }
            )

            strapi.log.info(`✅ Producto actualizado: ${codigo}`)
          } else {
            strapi.log.warn(`⚠️ Producto no encontrado: ${codigo}`)
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
