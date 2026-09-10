#!/usr/bin/env node
/**
 * Procesa UN remito (PDF) a la vez: extrae cantidad + código de cada línea,
 * cruza el código contra la columna `slug` de products y calcula el peso total.
 *
 * Uso:
 *   node scripts/procesar-remito.js "/ruta/al/remito.pdf"
 */
const { execFileSync } = require("child_process")
const { Client } = require("pg")

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error("Uso: node scripts/procesar-remito.js <ruta-al-pdf>")
  process.exit(1)
}

const client = new Client({
  host: "dpg-cstniuq3esus73d61oug-a.ohio-postgres.render.com",
  port: 5432,
  database: "red_mayor",
  user: "red_mayor_user",
  password: "aLTfRUSEMffMNoDdk28GngYGwH0bVKoW",
  ssl: { rejectUnauthorized: false },
})

function extraerItems(pdfPath) {
  const texto = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
  })
  const lineas = texto.split("\n")
  const items = []
  let totalImpreso = null

  for (const linea of lineas) {
    const matchTotal = linea.match(/Cantidad total:\s*(\d+)/i)
    if (matchTotal) totalImpreso = Number(matchTotal[1])

    // Ej: "   1   2133296          CONTIGO VASO TERMICO HURON..."
    const matchItem = linea.match(/^\s*(\d+)\s+([A-Za-z0-9.-]+)\s{2,}(.+?)\s*$/)
    if (matchItem) {
      const [, cantidad, codigo, descripcion] = matchItem
      items.push({
        cantidad: Number(cantidad),
        codigo: codigo.trim(),
        descripcion: descripcion.trim(),
      })
    }
  }

  return { items, totalImpreso }
}

async function main() {
  const { items, totalImpreso } = extraerItems(pdfPath)

  if (items.length === 0) {
    console.error("No se encontraron ítems en el PDF. Revisá el formato.")
    process.exit(1)
  }

  await client.connect()

  let pesoTotal = 0
  let cantidadTotal = 0
  const noEncontrados = []
  const sinPeso = []

  console.log(`\nRemito: ${pdfPath}\n`)
  console.log("Cant.  Código          Peso unit.   Subtotal   Producto")
  console.log("-".repeat(90))

  for (const { cantidad, codigo, descripcion } of items) {
    cantidadTotal += cantidad
    const res = await client.query(
      "SELECT nombre_producto, peso_gramos FROM products WHERE slug = $1",
      [codigo]
    )
    const row = res.rows[0]

    if (!row) {
      noEncontrados.push(codigo)
      console.log(
        `${String(cantidad).padEnd(6)} ${codigo.padEnd(15)} ${"—".padEnd(12)} ${"—".padEnd(10)} ${descripcion} (NO ENCONTRADO)`
      )
      continue
    }

    if (row.peso_gramos === null) {
      sinPeso.push(codigo)
      console.log(
        `${String(cantidad).padEnd(6)} ${codigo.padEnd(15)} ${"sin cargar".padEnd(12)} ${"—".padEnd(10)} ${row.nombre_producto}`
      )
      continue
    }

    const subtotal = cantidad * row.peso_gramos
    pesoTotal += subtotal
    console.log(
      `${String(cantidad).padEnd(6)} ${codigo.padEnd(15)} ${(row.peso_gramos + "g").padEnd(12)} ${(subtotal + "g").padEnd(10)} ${row.nombre_producto}`
    )
  }

  console.log("-".repeat(90))
  console.log(`Cantidad total (calculada): ${cantidadTotal}`)
  if (totalImpreso !== null) {
    console.log(
      `Cantidad total (impresa en el remito): ${totalImpreso}` +
        (totalImpreso === cantidadTotal ? "  ✓ coincide" : "  ⚠ NO coincide, revisar")
    )
  }
  console.log(`\nPeso total: ${pesoTotal} g = ${(pesoTotal / 1000).toFixed(2)} kg`)

  if (sinPeso.length > 0) {
    console.log(`\n⚠ Productos sin peso cargado (no se sumaron): ${sinPeso.join(", ")}`)
  }
  if (noEncontrados.length > 0) {
    console.log(`⚠ Códigos no encontrados en la base: ${noEncontrados.join(", ")}`)
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
