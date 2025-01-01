const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::user-detalle.user-detalle",
  ({ strapi }) => ({
    async findByUser(ctx) {
      try {
        const authHeader = ctx.request.header.authorization;
        console.log("Authorization header recibido:", authHeader);

        if (!authHeader) {
          console.log("Fallo: No se recibió el Authorization header");
          return ctx.unauthorized("Token no encontrado.");
        }

        const token = authHeader.split(" ")[1];
        console.log("Token extraído:", token);

        if (!token) {
          console.log("Fallo: Token no válido o no presente");
          return ctx.unauthorized("Token no válido.");
        }

        const decoded = await strapi.plugins["users-permissions"].services.jwt.verify(token);
        console.log("Token decodificado:", decoded);

        const userId = decoded.id;
        console.log("ID de usuario obtenido del token:", userId);

        if (!userId) {
          console.log("Fallo: El token no contiene un ID de usuario válido");
          return ctx.badRequest("El token no contiene un ID de usuario válido.");
        }

        const userDetails = await strapi.db
          .query("api::user-detalle.user-detalle")
          .findOne({
            where: { user: userId },
            populate: {
              user: {
                populate: {
                  direccions: true, // Asegúrate de que direccions esté bien poblada
                },
              },
            },
          });

        console.log("Detalles del usuario obtenidos:", userDetails);

        if (!userDetails) {
          console.log("Fallo: No se encontraron detalles para este usuario.");
          return ctx.notFound("No se encontraron detalles para este usuario.");
        }

        console.log("Direcciones originales:", userDetails.user.direccions);

        // Filtrar direcciones duplicadas por todos los campos que definen una dirección única
        const uniqueAddresses = userDetails.user.direccions
          .sort((a, b) => b.id - a.id) // Ordena las direcciones por ID de mayor a menor
          .filter(
            (value, index, self) =>
              index ===
              self.findIndex(
                (t) =>
                  t.direccion === value.direccion &&
                  t.ciudad === value.ciudad &&
                  t.provincia === value.provincia &&
                  t.codigoPostal === value.codigoPostal &&
                  t.referencias === value.referencias
              )
          );

        console.log("Direcciones después de eliminar duplicados:", uniqueAddresses);

        const response = {
          id: userDetails.id,
          razonSocial: userDetails.razonSocial,
          CUIT: userDetails.CUIT,
          tipoUsuario: userDetails.tipoUsuario,
          telefono: userDetails.telefono,
          username: userDetails.user.username,
          email: userDetails.user.email,
          direcciones: uniqueAddresses.map((direccion) => ({
            id: direccion.id,
            direccion: direccion.direccion,
            ciudad: direccion.ciudad,
            provincia: direccion.provincia,
            codigoPostal: direccion.codigoPostal,
            referencias: direccion.referencias,
          })),
        };

        console.log("Respuesta final construida:", response);

        return { data: response };
      } catch (error) {
        console.log("Error capturado:", error);
        strapi.log.error("Error al obtener los detalles del usuario:", error);
        return ctx.internalServerError("Error al procesar la solicitud.");
      }
    },
  })
);