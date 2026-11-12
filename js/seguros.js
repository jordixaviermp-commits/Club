// Datos del seguro federativo para el botón «🚑 Accidente». Edita aquí si cambian (cada temporada pueden cambiar las pólizas).
// Fuente: Federació Catalana de Ciclisme · https://www.ciclisme.cat/contingut/en-cas-daccident
// Está en un archivo de la app (no en la base de datos) para que se vea también SIN cobertura.
export const SEGUROS = {
  federacion: 'Federació Catalana de Ciclisme (FCC)',
  accidentes: {
    aseguradora: 'Allianz',
    poliza: '044822137',
    gestora: 'Gerosalud',
    telefono: '98 194 11 11',
    plazoDias: 7,
    email: 'assegurances@ciclisme.cat',
  },
  responsabilidadCivil: {
    aseguradora: 'Hiscox',
    poliza: 'HD IP6 2124609',
    franquicia: 120, // euros
    email: 'serveisjuridics@ciclisme.cat', // la declaración de responsabilidad civil va a otro correo que la de accidentes
    formulario: 'data/declaracio-sinistres-rc-2026.pdf', // «Declaració de sinistres – Responsabilitat civil» (versión 19/07/2026)
    polizaMenores: { aseguradora: 'Allianz', poliza: '055276264' }, // categorías Pre-benjamín a Cadete (el resto de licencias: Hiscox)
    protocolo: 'data/protocol-rc-llicencies-2026.pdf', // «Protocol Responsabilitat Civil Llicències & TB 2026» (versión 19/07/2026)
    // Qué documentación se entrega, de forma conjunta, a serveisjuridics@ciclisme.cat según quién tenga la responsabilidad
    casos: [
      { id: 'responsable', titulo: 'Si el responsable eres tú', antes: 'Llama a la policía para que deje constancia de las responsabilidades en un informe policial. Si no es posible, haced un comunicado amistoso entre las dos partes.',
        adjuntar: ['Declaración de siniestro (el PDF de abajo)', 'Fotocopia del DNI', 'Informe policial o comunicado amistoso entre las dos partes (recomendable)'] },
      { id: 'no-responsable', titulo: 'Si el responsable es el otro', antes: 'Llama a la policía para que deje constancia de las responsabilidades en un atestado policial.',
        adjuntar: ['Declaración de siniestro (el PDF de abajo)', 'Informe policial', 'Presupuesto de los daños materiales (si procede)', 'Fotografía de los daños materiales (si procede)', 'Informe(s) médico(s) (si procede)', 'Fotografías de los daños físicos (si procede)', 'Designa (formulario de la federación, en su web)', 'Fotocopia del DNI'] },
    ],
  },
  info: 'https://www.ciclisme.cat/contingut/en-cas-daccident',
};
