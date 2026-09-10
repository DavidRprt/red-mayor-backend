import type { Schema, Struct } from '@strapi/strapi';

export interface BannerBannerSlide extends Struct.ComponentSchema {
  collectionName: 'components_banner_banner_slides';
  info: {
    displayName: 'Banner Slide';
    icon: 'images';
  };
  attributes: {
    activo: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    alt: Schema.Attribute.String & Schema.Attribute.Required;
    badge: Schema.Attribute.String;
    badgeColor: Schema.Attribute.String;
    cta: Schema.Attribute.String;
    ctaColor: Schema.Attribute.String;
    eyebrow: Schema.Attribute.String;
    fechaFin: Schema.Attribute.Date;
    fechaInicio: Schema.Attribute.Date;
    href: Schema.Attribute.String;
    imagen: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    subtitulo: Schema.Attribute.Text;
    titulo: Schema.Attribute.Text;
  };
}

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
      'banner.banner-slide': BannerBannerSlide;
      'descuentos.descuento-por-mayor': DescuentosDescuentoPorMayor;
    }
  }
}
