import type { Schema, Struct } from '@strapi/strapi';

export interface DescuentosDescuentoPorMayor extends Struct.ComponentSchema {
  collectionName: 'components_descuentos_descuento_por_mayors';
  info: {
    displayName: 'descuentoPorMayor';
  };
  attributes: {
    activo: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    cantidadMinima: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    porcentajeDescuento: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 99;
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'descuentos.descuento-por-mayor': DescuentosDescuentoPorMayor;
    }
  }
}
