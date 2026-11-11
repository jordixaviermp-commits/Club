// Genera los 3 contratos de corredor (nuevo, renovación, renovación sin licencia) en HTML y PDF.
// Uso: node contratos/generar.cjs        (necesita Playwright con Chromium)
// Las condiciones de cada tipo están en TIPOS; la temporada y el mínimo, en COMUN.
const fs = require('fs');
const path = require('path');

const COMUN = {
  temporada: 2027,
  minimo: 12, // por debajo de este número de carreras se aplica la penalización
};

const TIPOS = [
  {
    id: 'Nuevo', titulo: 'NUEVO',
    licencia: true,
    material: [['maillots CARRERA', 2], ['culotes', 2], ['maillot de manga larga HYDER', 1], ['par de calcetines aero', 1]],
    aportacion: 175, // al firmar; si no llega al mínimo, además 175 € de penalización
    tramos: [[12, 50], [17, 100], [22, 150]],
    penalizacion: 175,
  },
  {
    id: 'Renovacion', titulo: 'RENOVACIÓN',
    licencia: true,
    material: [['maillot CARRERA', 1], ['culote', 1], ['par de calcetines aero', 1]],
    aportacion: 65,
    tramos: [[12, 50], [17, 100], [22, 150]],
    penalizacion: 100,
  },
  {
    id: 'Renovacion_sin_licencia', titulo: 'RENOVACIÓN SIN LICENCIA',
    licencia: false,
    material: [],
    aportacion: 0,
    tramos: [[12, 100], [17, 150], [22, 200]],
    penalizacion: 0,
  },
];

// Precios del material del Club para la temporada (compras adicionales a lo incluido en el contrato)
// El primer par de calcetines solo es gratis en nuevo y renovación (van incluidos en el material).
const precios = (t) => [
  ['Maillot', '25 €'], ['Culote', '40 €'], ['Maillot manga larga HYDER', '45 €'],
  ['Calcetines aero (par)', t.licencia ? '1.º gratis · 2.º 15 €' : '15 €'], ['Chaleco', '35 €'], ['Manguitos', '15 €'],
  ['Camiseta interior', '20 €'], ['Gorra de patrocinadores', 'Gratis'], ['Camiseta de patrocinadores', 'Gratis'],
];

const ORD = ['', 'un', 'dos', 'tres', 'cuatro'];
const euros = (n) => `${n} €`;
const enLetras = { 100: 'CIEN EUROS', 175: 'CIENTO SETENTA Y CINCO EUROS' };
const blank = (w) => `<span class="blank" style="width:${w}px"></span>`;

function tercera(t, y) {
  const items = [];
  if (t.licencia) {
    items.push('El Club tramitará la licencia del deportista en un plazo máximo de 7 días después de la firma del contrato y entrega de documentación necesaria.');
    const mat = t.material.map(([q, n]) => `${n === 1 ? ORD[1] : n} ${q}`);
    items.push(`Se entregará al deportista el siguiente material: ${mat.slice(0, -1).join(', ')} y ${mat.at(-1)} (o equivalentes de la temporada).`);
    items.push(t.aportacion
      ? `El deportista aportará la cantidad de <b>${euros(t.aportacion)}</b> en concepto de licencia y equipaciones. El Club asume el resto del coste.`
      : `El Club asume el coste de la licencia y de las equipaciones. El deportista solo deberá aportar <b>${euros(t.penalizacion)}</b> en caso de no alcanzar el mínimo de participaciones establecido en la cláusula QUINTA.`);
    items.push(`Material adicional: el deportista podrá adquirir más prendas del Club a los precios de la temporada ${y} indicados a continuación.`);
  } else {
    items.push('El presente acuerdo no incluye la tramitación ni el pago de la licencia federativa por parte del Club, ni la entrega de equipaciones. El deportista deberá disponer de licencia federativa en vigor y competir con la indumentaria oficial del Club, cuyo coste correrá a su cargo.');
    items.push(`El deportista podrá adquirir las prendas del Club a los precios de la temporada ${y} indicados a continuación.`);
  }
  const tablaPrecios = `<table class="precios"><tr><th colspan="4">Precios ${y} del material del Club</th></tr>
${precios(t).reduce((rows, p, i) => (i % 2 ? rows[rows.length - 1].push(p) : rows.push([p]), rows), [])
  .map((r) => `<tr>${r.map(([n, e]) => `<td>${n}</td><td class="n">${e}</td>`).join('')}${r.length < 2 ? '<td></td><td></td>' : ''}</tr>`).join('\n')}
</table>`;
  items.push(`Se ayudará económicamente al corredor según el número de pruebas realizadas durante la temporada ${y}. Siendo la bonificación:`);
  return `<div>
<p><b>TERCERA.- Condiciones contractuales:</b></p>
<ul>${items.slice(0, -1).map((i) => `<li>${i}</li>`).join('\n')}</ul>
${tablaPrecios}
<ul><li>${items.at(-1)}</li></ul>
<table>
<tr><th>Objetivo de Temporada</th><th>Bonificación</th></tr>
${t.tramos.map(([c, e]) => `<tr><td>Participación en ${c} carreras</td><td class="n">${euros(e)}</td></tr>`).join('\n')}
</table>
</div>`;
}

function cuarta(t) {
  const consecuencia = t.licencia
    ? 'deberá abonar el coste íntegro de la licencia, así como la parte del coste de las equipaciones aportada por el Club'
    : 'perderá el derecho a las bonificaciones previstas en la cláusula TERCERA';
  return `<p class="clause"><b>CUARTA.-</b> El deportista suscribiente se compromete a participar en todas las competiciones o actividades deportivas representando al Club y usando siempre su indumentaria oficial. En caso de no hacerlo así, el deportista quedará relegado del equipo y ${consecuencia}.</p>`;
}

function quinta(t, y, min) {
  const cuentan = `Se consideran válidas las competiciones oficiales (según la definición de la cláusula SÉPTIMA) disputadas representando al Club y con su indumentaria oficial entre el 01 de Enero y el 31 de Diciembre de ${y}. Las pruebas de varios días o por etapas computarán como una participación por cada día de competición disputado.`;
  if (!t.penalizacion) {
    return `<p class="clause"><b>QUINTA.- Participación.</b> ${cuentan} En la presente modalidad de acuerdo no se establece un número mínimo de participaciones ni penalización alguna por no alcanzarlo; el número de participaciones únicamente determina la bonificación prevista en la cláusula TERCERA.</p>`;
  }
  return `<div class="clause">
<p><b>QUINTA.- Participación mínima y penalización.</b> El deportista se compromete a participar en un <b>mínimo de ${min} competiciones</b> durante la vigencia del presente acuerdo. ${cuentan}</p>
<p>En caso de que, a la finalización del presente acuerdo, el deportista no haya alcanzado dicho mínimo, deberá abonar al Club una <b>penalización de ${euros(t.penalizacion)} (${enLetras[t.penalizacion]})</b>, en concepto de compensación por la aportación económica realizada por el Club en la licencia y las equipaciones. Dicho importe deberá abonarse en un plazo máximo de 30 días desde la finalización de la temporada, pudiendo el Club compensarlo con cualquier cantidad que tuviera pendiente de abonar al deportista.</p>
<p>Quedará exento de esta penalización el deportista que no pueda alcanzar el mínimo a causa de una <b>lesión sufrida compitiendo en una prueba oficial representando al Club</b>, siempre que la acredite mediante informe médico y la comunique al Club en un plazo máximo de 7 días desde la prueba. Esta exención no se aplicará a lesiones o enfermedades producidas fuera de competición (entrenamientos, actividades particulares u otras causas).</p>
</div>`;
}

function sexta(t) {
  const ref = t.penalizacion
    ? 'dicha prueba se tendría en cuenta para el mínimo de participaciones de la cláusula QUINTA del presente acuerdo pero no contaría como prueba realizada en cuanto a la bonificación de participaciones en carreras incluida en la cláusula TERCERA'
    : 'dicha prueba no contaría como prueba realizada en cuanto a la bonificación de participaciones en carreras incluida en la cláusula TERCERA';
  return `<p class="clause"><b>SEXTA.-</b> En caso de que el deportista estuviera inscrito en una prueba y esta fuera suspendida, ${ref}.</p>`;
}

function html(t) {
  const y = COMUN.temporada;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Acuerdo Corredor (${t.titulo}) - Club Ciclista Monzón</title>
<style>
@page { size: A4; margin: 16mm 17mm 18mm 17mm; }
* { box-sizing: border-box; }
body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; font-size: 9.1pt; color: #222; line-height: 1.38; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 2px; letter-spacing: .3px; color: #111; }
.sub { color: #6b7a99; font-size: 10pt; margin: 0 0 10px; padding-bottom: 9px; border-bottom: 2.5px solid #d32f2f; }
h2 { font-size: 12pt; letter-spacing: .6px; margin: 11px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; color: #111; }
p { margin: 0 0 8px; text-align: justify; }
.date { text-align: right; font-style: italic; margin: 14px 0 6px; }
.blank { display: inline-block; border-bottom: 1px solid #222; height: 1em; vertical-align: baseline; }
ul { margin: 4px 0 8px; padding-left: 16px; }
li { margin-bottom: 5px; text-align: justify; }
table { border-collapse: collapse; width: 62%; margin: 6px 0 12px; font-size: 9.2pt; }
th, td { border: 1px solid #d6d9e0; padding: 5px 8px; }
th { background: #f1f3f7; text-align: left; }
td.n { text-align: right; font-weight: bold; }
table { page-break-inside: avoid; }
table.precios { width: 100%; font-size: 8.8pt; margin: 2px 0 8px; }
table.precios th { text-align: center; }
table.precios td { padding: 3px 8px; }
.clause { page-break-inside: avoid; }
.sign { display: flex; justify-content: space-between; margin-top: 34px; page-break-inside: avoid; }
.sign div { width: 44%; text-align: center; border-top: 1px solid #555; padding-top: 6px; }
.sign i { display: block; color: #555; font-size: 8.8pt; }
</style></head><body>

<h1>ACUERDO CORREDOR (${t.titulo})</h1>
<p class="sub">Equipo Ciclista – Club Ciclista Monzón</p>

<p class="date">En Monzón, a ${blank(34)} de ${blank(85)} de 20${blank(22)}</p>

<h2>REUNIDOS</h2>
<p><b>DE UNA PARTE</b>, D. IGNACIO REVENGA MARTINEZ, domiciliado en Monzón con D.N.I. y N.I.F. n° 18028717Y, en calidad de PRESIDENTE del <b>Club Ciclista Monzón</b>, domiciliado en Monzón, calle San Mateo nº 16 bajos, afiliado a la Real Federación Española de Ciclismo, con el nº de licencia G22388250, del año de la fecha.</p>
<p><b>Y DE OTRA</b>, D./Dª ${blank(200)}, de ${blank(38)} años de edad, de nacionalidad ${blank(85)}, con D.N.I. ${blank(95)}, con categoría de licencia ${blank(85)} y domiciliado en ${blank(190)}.</p>

<h2>DECLARAN</h2>
<p>Que estimando ambas partes reunir los requisitos y condiciones para ello establecidos, de común acuerdo, convienen en suscribir el presente documento, con arreglo a las siguientes;</p>

<h2>CLÁUSULAS</h2>
<p class="clause"><b>PRIMERA.-</b> El presente documento tiene por objeto regular la actividad deportiva del deportista abajo firmante en el ciclismo de competición. El deportista se obliga expresamente a realizar dicha actividad deportiva aplicando la diligencia específica que corresponde a sus personales condiciones físicas y técnicas, así como a su categoría, y de acuerdo a la legislación vigente, a la reglamentación técnica de la Real Federación Española de Ciclismo, así como a las instrucciones de los representantes del Club.</p>

<p class="clause"><b>SEGUNDA.-</b> El presente acuerdo tendrá una duración de 1 año, comenzando su vigencia el día 01 de Enero de ${y} y finalizando el día 31 de Diciembre de ${y}. Ambas partes, de común acuerdo, podrán prorrogar el mismo, por una duración determinada, mediante sucesivos acuerdos, antes o al vencimiento del término arriba pactado.</p>

${tercera(t, y)}

${cuarta(t)}

${quinta(t, y, COMUN.minimo)}

${sexta(t)}

<p class="clause"><b>SÉPTIMA.-</b> Se entiende por competición oficial toda aquella carrera que esté inscrita en un calendario de cualquier Federación de Ciclismo y en la cual haya una clasificación general y entrega de trofeos a los ganadores.</p>

<p class="clause"><b>OCTAVA.-</b> El deportista deberá informar la semana anterior a participar en una prueba al encargado de las redes sociales para poder hacer la publicación correspondiente. Asimismo, el corredor se compromete a enviar una pequeña crónica y una fotografía (donde sea claramente visible la indumentaria oficial del equipo y los patrocinadores) en un plazo <b>máximo de 48 horas tras la finalización de la prueba</b>, facilitando así la gestión digital.</p>

<div class="clause">
<p><b>NOVENA.-</b> El corredor que logre clasificar entre los tres primeros de la <b>clasificación general final de un circuito completo</b> (como, por ejemplo, la clasificación final resultante de todas las pruebas puntuables de la Copa Aragón de XCM u otros campeonatos similares), se le adjudicarán <b>4 participaciones adicionales</b> a las que se refiere la cláusula TERCERA.</p>
<p>Queda expresamente aclarado que esta bonificación solo es válida para la clasificación general definitiva de todo el torneo, y <b>no aplicará</b> a las clasificaciones generales de pruebas individuales o de un solo día. Este premio será válido tanto si el podio se logra en la clasificación absoluta (scratch) como en la específica de su categoría de licencia.</p>
</div>

<p class="clause"><b>DÉCIMA.-</b> El Club se reserva el derecho de rescindir unilateralmente o de no renovar el presente acuerdo si se observa una mala praxis en las redes sociales por parte del corredor o durante la práctica deportiva de una prueba que suponga una mala imagen tanto para el Club como para sus patrocinadores, o en caso de incurrir en conductas antideportivas o prácticas de dopaje sancionadas por la Real Federación Española de Ciclismo.</p>

<p class="clause"><b>UNDÉCIMA.- Protección de Datos y Derechos de Imagen.</b> De conformidad con el RGPD (UE) 2016/679 y la LOPDGDD 3/2018, el deportista consiente expresamente el tratamiento de sus datos personales para la gestión integral de este acuerdo${t.licencia ? ' y de su licencia federativa' : ''}. Igualmente, autoriza de forma gratuita la captación, reproducción y publicación de su imagen (fotografías y vídeos) obtenida durante las competiciones para su difusión en las redes sociales y medios de comunicación oficiales del Club, con fines exclusivamente deportivos y de promoción de los patrocinadores.</p>

<p style="margin-top:16px">Y en prueba de conformidad, firman el presente documento en el lugar y fecha indicado en el encabezamiento.</p>

<div class="sign">
<div><b>EL PRESIDENTE DEL CLUB</b><i>(Firma y sello)</i><br><br>D. IGNACIO REVENGA MARTINEZ</div>
<div><b>EL DEPORTISTA</b><i>(Firma)</i><br><br>D./Dª. ${blank(160)}</div>
</div>
</body></html>
`;
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const t of TIPOS) {
    const base = path.join(__dirname, `Acuerdo_Corredor_${t.id}_${COMUN.temporada}_CC_Monzon`);
    fs.writeFileSync(base + '.html', html(t));
    await page.goto('file://' + base + '.html');
    await page.pdf({
      path: base + '.pdf', format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-family:Arial;font-size:8px;color:#888;width:100%;margin:0 17mm;display:flex;justify-content:space-between"><span>Acuerdo Corredor - C.C. Monzón</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
      margin: { top: '16mm', bottom: '18mm', left: '17mm', right: '17mm' },
    });
    console.log(path.basename(base) + '.pdf');
  }
  await browser.close();
})();
