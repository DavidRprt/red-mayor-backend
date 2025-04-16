import axios from "axios"
import * as XLSX from "xlsx"

export default {
  async afterCreate(event) {
    const { result } = event

    strapi.log.info("📌 Datos del archivo en el evento:")
    console.log(result.CSV)

    if (result.CSV && result.CSV.url) {
      try {
        const fileUrl = result.CSV.url

        // Descargar Excel como array buffer
        strapi.log.info(`📥 Descargando Excel desde: ${fileUrl}`)
        const response = await axios.get(fileUrl, {
          responseType: "arraybuffer",
        })
        const workbook = XLSX.read(response.data, { type: "buffer" })

        // Leer hoja 1
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const records = XLSX.utils.sheet_to_json(sheet)

        if (!records.length) {
          strapi.log.warn("⚠️ El Excel está vacío o mal formateado.")
          return
        }

        strapi.log.info(
          `📌 Excel procesado correctamente. ${records.length} registros encontrados.`
        )

        for (const record of records) {
          const slug = record["SLUG"]?.toString()?.trim()
          const precio = parseFloat(record["precioBase"])
          const stock = parseInt(record["stock"], 10)

          if (!slug || isNaN(precio) || isNaN(stock)) {
            strapi.log.warn(
              `⚠️ Datos incompletos en fila: ${JSON.stringify(record)}`
            )
            continue
          }

          const existingProduct = await strapi.entityService.findMany(
            "api::product.product",
            { filters: { slug } }
          )

          if (existingProduct.length > 0) {
            await strapi.entityService.update(
              "api::product.product",
              existingProduct[0].id,
              {
                data: {
                  precioBase: precio,
                  stock: stock,
                },
              }
            )

            strapi.log.info(`✅ Producto actualizado: ${slug}`)
          } else {
            strapi.log.warn(`⚠️ Producto no encontrado: ${slug}`)
          }
        }

        strapi.log.info("🎯 Actualización masiva desde Excel completada.")
      } catch (error) {
        strapi.log.error("❌ Error procesando el archivo Excel:", error)
      }
    } else {
      strapi.log.error("❌ No se encontró un archivo válido en el evento.")
    }
  },
}
