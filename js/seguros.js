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
    adjuntar: ['declaración amistosa', 'informes médicos', 'presupuesto de reparación de la bicicleta y alta/baja laboral', 'fotografías de los daños materiales'],
  },
  info: 'https://www.ciclisme.cat/contingut/en-cas-daccident',
};
