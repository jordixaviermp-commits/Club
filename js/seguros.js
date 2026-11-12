// Datos de los seguros federativos para el botón «🚑 Accidente». Edita aquí si cambian (las pólizas cambian cada temporada).
// Está en un archivo de la app (no en la base de datos) para que se vea también SIN cobertura.
// Cada federación tiene: accidente (pasos a seguir) y rc (responsabilidad civil, si el daño es a un tercero).
//  · Catalana: https://www.ciclisme.cat/contingut/en-cas-daccident
//  · Aragonesa: protocolo de actuación en caso de accidente deportivo (federación) + pólizas 2026 (PDF en data/)
export const FEDERACIONES = {
  fcc: {
    id: 'fcc', corto: 'Catalana', nombre: 'Federació Catalana de Ciclisme (FCC)',
    info: 'https://www.ciclisme.cat/contingut/en-cas-daccident',
    imagen: 'img/accidente-fcc.png', // resumen en imagen; se genera con scripts/imagenes-seguros.mjs
    // Dónde ve cada federado su licencia digital (entra con su propia cuenta; la app no accede a ella). Enlace de «Llicències online» de ciclisme.cat.
    licencia: { etiqueta: 'Plataforma de licencias de la FCC', href: 'https://ciclisme.playoffinformatica.com/FormLogin.php' },
    accidente: {
      aseguradora: 'Allianz', poliza: '044822137',
      aviso: 'No vayas a un centro que no sea del cuadro médico (concertado) ni a urgencias de la Seguridad Social: si no, los gastos los pagas tú. Solo si peligra tu vida puedes ir a cualquier hospital; una rotura de hueso, una luxación o una brecha NO cuentan como urgencia vital.',
      pasos: [
        { titulo: 'Llama a Gerosalud ANTES de ir al médico', texto: 'Si no es urgente, te dan cita en un centro concertado; si es urgente, te dicen a cuál ir. Ten a mano tu licencia federativa en vigor (no vale la del año pasado) y el DNI. El accidente hay que comunicarlo dentro de los 7 días siguientes: pasado ese plazo, la aseguradora lo rechaza.',
          tel: { numero: '981 941 111', etiqueta: 'Gerosalud' },
          copia: { etiqueta: 'Póliza de accidentes Allianz', valor: '044822137', msg: 'Número de póliza copiado' } },
        { titulo: 'Rellena el parte de accidente (en 7 días)', texto: 'Cumpliméntalo y que lo firme y selle el club o la federación. Envíalo a Gerosalud dentro de los 7 días siguientes al accidente. En una visita no urgente, llévalo ya firmado y sellado, junto con la licencia y el DNI. La web de la federación pide mandarlo también a assegurances@ciclisme.cat.',
          correo: [{ para: 'siniestros@gerosalud.es', asunto: "Parte d'accident" }, { para: 'assegurances@ciclisme.cat', asunto: "Declaració d'accident" }],
          enlaces: [{ etiqueta: '📄 Parte de accidente (web de la federación)', href: 'https://www.ciclisme.cat/contingut/en-cas-daccident' }] },
        { titulo: 'Si necesitas más asistencia', texto: 'Pruebas (TAC, resonancia, ecografía…), artroscopias, operaciones, rehabilitación y material ortopédico necesitan autorización previa de Gerosalud. Pídela por correo con: copia del parte firmado y sellado, la licencia, el DNI, el informe médico de la primera asistencia y la prescripción del médico. Sin autorización, lo pagas tú (salvo urgencia vital objetiva).',
          correo: { para: 'siniestros@gerosalud.es', asunto: 'Solicitud de autorización de asistencia' } },
      ],
      // Resumen de la póliza Allianz Accidentes Colectivo (federados mayores de 16 años), temporada 2026. Manda siempre el texto de la póliza.
      resumen: [
        'Cubre la competición federada, los entrenos y las salidas del club (individuales o colectivas) y las actividades de la federación.',
        'Asistencia sanitaria en el cuadro médico, hasta 18 meses desde el accidente: ambulancia, curas, pruebas, operaciones y rehabilitación. El material ortopédico curativo se reembolsa al 70 % con permiso previo.',
        'Fallecimiento: 6.000 €. Incapacidad permanente: 12.000 € según baremo. Prótesis, gafas y ortopedia: 1.200 €. Búsqueda, salvamento y transporte del accidentado: 1.200 €.',
        'No cubre lesiones o enfermedades previas, dolencias crónicas o degenerativas (tendinitis crónica, artrosis, hernias…), odontología por encima de 250 €, ni centros no concertados.',
        'Mientras recibes asistencia por una lesión, no estás cubierto si te lesionas haciendo deporte.',
        'Con licencia temporal de carretera y pista: asistencia de libre elección hasta 3.000 €.',
      ],
      pdfs: [{ etiqueta: '📄 Póliza de accidentes 2026 (PDF, 32 páginas)', href: 'data/poliza-accidentes-fcc-2026.pdf' }],
    },
    rc: {
      aseguradora: 'Hiscox', poliza: 'HD IP6 2124609',
      datos: [
        'Franquicia: 120 € (lo que pagas tú de cada siniestro), según la federación.',
        'Categorías de Pre-benjamín a Cadete: Allianz 055276264.',
        'La póliza cubre la responsabilidad civil de la Federación (organización de pruebas y actividad habitual), hasta 1.200.000 € por siniestro y periodo, y considera a los federados con licencia terceros entre sí: se cubren las reclamaciones por daños personales entre ellos.',
      ],
      antes: 'Primero, avisa a la policía para que quede constancia de quién es el responsable. Después, la documentación depende del caso:',
      // Qué se entrega, de forma conjunta, según quién tenga la responsabilidad
      casos: [
        { titulo: 'Si el responsable eres tú', antes: 'Llama a la policía para que deje constancia de las responsabilidades en un informe policial. Si no es posible, haced un comunicado amistoso entre las dos partes.',
          adjuntar: ['Declaración de siniestro (el PDF de abajo)', 'Fotocopia del DNI', 'Informe policial o comunicado amistoso entre las dos partes (recomendable)'] },
        { titulo: 'Si el responsable es el otro', antes: 'Llama a la policía para que deje constancia de las responsabilidades en un atestado policial.',
          adjuntar: ['Declaración de siniestro (el PDF de abajo)', 'Informe policial', 'Presupuesto de los daños materiales (si procede)', 'Fotografía de los daños materiales (si procede)', 'Informe(s) médico(s) (si procede)', 'Fotografías de los daños físicos (si procede)', 'Designa (formulario de la federación, en su web)', 'Fotocopia del DNI'] },
      ],
      pdfs: [
        { etiqueta: '📄 Declaración de siniestros (PDF para rellenar)', href: 'data/declaracio-sinistres-rc-2026.pdf' }, // versión 19/07/2026
        { etiqueta: '📋 Protocolo de responsabilidad civil (PDF)', href: 'data/protocol-rc-llicencies-2026.pdf' }, // versión 19/07/2026
        { etiqueta: '🛡️ Póliza de responsabilidad civil 2026 (PDF, 48 páginas)', href: 'data/poliza-rc-fcc-2026.pdf' },
      ],
      correo: { para: 'serveisjuridics@ciclisme.cat', asunto: 'Declaració de sinistre - Responsabilitat civil' }, // otro correo distinto al de accidentes
    },
  },
  fac: {
    id: 'fac', corto: 'Aragonesa', nombre: 'Federación Aragonesa de Ciclismo (FAC)',
    info: 'https://aragonciclismo.com',
    imagen: 'img/accidente-fac.png', // resumen en imagen; se genera con scripts/imagenes-seguros.mjs
    // OJO: es la web de la federación (aragonciclismo.com redirige a yosoyciclista.com/aragon); sin confirmar que lleve directo a la licencia. Cambiar por el enlace exacto cuando se sepa.
    licencia: { etiqueta: 'Web de la Federación Aragonesa', href: 'https://aragonciclismo.com' },
    accidente: {
      aseguradora: 'Divina Seguros', poliza: '8626527',
      aviso: 'No acudas a ningún centro médico sin la autorización previa de la aseguradora: si no, los gastos los pagas tú.',
      pasos: [
        { titulo: 'Llama a Gerosalud ANTES de ir al médico', texto: 'Sin autorización previa de la aseguradora no se cubre la asistencia. En la llamada te dan tu número de expediente. Atienden de lunes a viernes de 8:00 a 22:00 y sábados, domingos y festivos de 9:00 a 23:00. Si te hospitalizan por una urgencia vital sin haber llamado antes, tienes que llamar tú o un familiar dentro de las primeras 24 horas.',
          tel: { numero: '981 941 111', etiqueta: 'Gerosalud' },
          copia: { etiqueta: 'Póliza de accidentes Divina Seguros', valor: '8626527', msg: 'Número de póliza copiado' } },
        { titulo: 'Escribe a la federación (en 48 horas)', texto: 'En las 48 horas siguientes al accidente, en horario de oficina, envía un correo con la fecha, el lugar, la descripción de los daños físicos, el informe médico de la asistencia y tu número de expediente: la federación prepara el parte. No se tramita un parte pasados 7 días naturales del accidente.',
          correo: { para: 'info@aragonciclismo.com', asunto: 'Parte de accidente deportivo' } },
        { titulo: 'Reenvía el parte firmado (en 48 horas)', texto: 'Con el parte que te envíe la federación, reenvíalo firmado, con copia de tu DNI y los informes médicos, a Gerosalud. Sin estos documentos no se puede seguir ofreciendo la asistencia.',
          correo: { para: 'siniestros@gerosalud.es', asunto: 'Parte de accidente - nº de expediente' } },
        { titulo: 'Si necesitas más asistencia', texto: 'Consultas, pruebas, intervenciones, rehabilitación…: pide siempre autorización previa llamando al 981 941 111. Lo que hagas sin autorización lo pagas tú. La asistencia es en las clínicas concertadas de Gerosalud: no se cubre la de la Seguridad Social ni la de centros no concertados (salvo urgencia vital, hasta que te estabilicen para trasladarte a uno concertado).',
          tel: { numero: '981 941 111', etiqueta: 'Gerosalud' } },
      ],
      avisoFinal: 'Usa el seguro solo cuando sea necesario: si lo usas mal, el seguro no se hará cargo de los gastos médicos y tendrás que pagarlos tú.',
      // Resumen de las condiciones generales de la póliza (Divina Seguros, 2026). Manda siempre el texto de la póliza.
      resumen: [
        'Vigencia: del 1/1/2026 al 31/12/2026.',
        'Cubre los accidentes en competiciones y actividades organizadas por la federación o por los clubes, en entrenamientos organizados por clubes bajo la dirección de un técnico, y en el trayecto de ida y vuelta a ellos.',
        'No cubre la práctica deportiva privada (salir por tu cuenta).',
        'Fallecimiento por accidente deportivo: 6.010,12 €. Incapacidad permanente: hasta 12.020,24 €, según baremo.',
        'La asistencia sanitaria se presta en los centros concertados.',
      ],
      pdfs: [{ etiqueta: '📄 Póliza de accidentes 2026 (PDF, 35 páginas)', href: 'data/poliza-accidentes-fac-2026.pdf' }],
    },
    rc: {
      aseguradora: 'Allianz', poliza: '058283376',
      antes: 'Si has causado daños a un tercero, llama a la Federación, en horario de oficina, para tramitar el siniestro.',
      tel: { numero: '976 730 248', etiqueta: 'Federación Aragonesa' },
      datos: [
        'Vigencia: del 27/1/2026 al 26/1/2027.',
        'Límite: 2.000.000 € por siniestro. Daños materiales a terceros: hasta 3.000 € por siniestro, con franquicia del 10 % (mínimo 100 €).',
        'No cubre la responsabilidad civil entre federados.',
        'Mediador de la póliza (BMS): 954 050 530.',
      ],
      pdfs: [{ etiqueta: '📄 Póliza de responsabilidad civil 2026 (PDF)', href: 'data/poliza-rc-fac-2026.pdf' }],
    },
  },
};
export const ORDEN_FEDERACIONES = ['fcc', 'fac'];
