// Genera las imágenes resumen «En caso de accidente» (una por federación) a partir de js/seguros.js.
// Salida: img/accidente-<federación>.png (1080 px de ancho, pensadas para verlas en el móvil, imprimirlas o mandarlas por WhatsApp).
// Se usa desde la pantalla «Accidente» de la app. Si cambian teléfonos, pólizas o correos: edita js/seguros.js y vuelve a ejecutar
//   node scripts/imagenes-seguros.mjs
// Necesita Playwright (npm i -g playwright) con Chromium. Los textos cortos de cada paso están en este archivo.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEDERACIONES, ORDEN_FEDERACIONES } from '../js/seguros.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Contenido corto de la imagen de cada federación (los números salen de js/seguros.js). */
function contenido(id) {
  const f = FEDERACIONES[id], a = f.accidente, rc = f.rc;
  const tel = a.pasos[0].tel.numero;
  const gero = a.pasos.flatMap((p) => [].concat(p.correo || [])).find((c) => c.para.includes('gerosalud'))?.para;
  const base = { titulo: f.nombre, tel, polizaAcc: `${a.aseguradora} ${a.poliza}`, polizaRc: `${rc.aseguradora} ${rc.poliza}` };
  if (id === 'fcc') {
    return { ...base, etiqueta: 'Licencia de la Federació Catalana (FCC)',
      pasos: [
        { t: 'Llama a Gerosalud ANTES de ir al médico', s: 'Ten a mano tu licencia en vigor (no vale la del año pasado) y el DNI. Te dirán a qué centro ir.', tel },
        { t: 'Parte de accidente, en 7 días', s: `Firmado y sellado por el club o la federación. Envíalo a ${gero} (la web de la federación pide copia a assegurances@ciclisme.cat).` },
        { t: 'Pruebas, operación o rehabilitación', s: `Pide autorización previa por correo a ${gero}, con el parte, la licencia, el DNI y el informe médico.` },
      ],
      ojo: ['No vayas a centros no concertados ni a urgencias de la Seguridad Social: los gastos los pagas tú.', 'Una rotura de hueso, una luxación o una brecha NO son urgencia vital: llama antes.', 'Pasados 7 días, la aseguradora rechaza el accidente.'],
      rc: `Daños a un tercero: avisa a la policía y envía la declaración de siniestros a ${rc.correo.para}.` };
  }
  return { ...base, etiqueta: 'Licencia de la Federación Aragonesa (FAC)',
    pasos: [
      { t: 'Llama a Gerosalud ANTES de ir al médico', s: 'Lunes a viernes de 8 a 22 h; sábados, domingos y festivos de 9 a 23 h. Te dan tu número de expediente.', tel },
      { t: 'En 48 horas, escribe a la federación', s: `${a.pasos[1].correo.para}: fecha, lugar, daños físicos, informe médico y número de expediente. Ellos preparan el parte.` },
      { t: 'En 48 horas, reenvía el parte firmado', s: `Con copia del DNI y los informes médicos a ${gero}. Sin esto, se corta la asistencia.` },
      { t: 'Para más asistencia', s: `Pide siempre autorización previa en el ${tel}: consultas, pruebas, rehabilitación…` },
    ],
    ojo: ['No vayas a ningún centro sin autorización previa de la aseguradora: los gastos los pagas tú.', 'Solo clínicas concertadas de Gerosalud (no Seguridad Social).', 'No se tramita un parte pasados 7 días naturales.'],
    rc: `Daños a un tercero: llama a la Federación (${rc.tel.numero}, horario de oficina).` };
}

const CSS = `
*{box-sizing:border-box;margin:0}body{width:1080px;background:#eef3f6;font-family:Inter,"Helvetica Neue",Arial,sans-serif;color:#152a36}
.wrap{padding:44px 48px 40px}
header{display:flex;align-items:center;gap:26px;margin-bottom:22px}
header img{width:104px;height:104px;border-radius:22px}
header small{display:block;font-size:26px;font-weight:700;letter-spacing:.16em;color:#00769a}
header h1{font-size:68px;line-height:1.02;font-weight:900;color:#284556}
.fed{display:inline-block;background:#284556;color:#fff;font-size:30px;font-weight:700;padding:12px 26px;border-radius:999px;margin-bottom:22px}
.urg{display:flex;align-items:center;gap:26px;background:#b42318;color:#fff;border-radius:26px;padding:22px 32px;margin-bottom:22px}
.urg b{font-size:92px;font-weight:900;line-height:1}.urg span{font-size:34px;font-weight:700;line-height:1.2}
.step{display:flex;gap:26px;background:#fff;border-radius:26px;padding:28px 30px;margin-bottom:18px;box-shadow:0 2px 0 #d5e1e8}
.n{flex:none;width:68px;height:68px;border-radius:50%;background:#284556;color:#fff;font-size:40px;font-weight:900;display:flex;align-items:center;justify-content:center}
.step h2{font-size:40px;line-height:1.12;font-weight:800;color:#284556;margin-bottom:8px}
.step p{font-size:30px;line-height:1.3;color:#35505e}
.tel{margin-top:14px;display:inline-block;background:#284556;color:#fff;border-radius:20px;padding:14px 34px;font-size:78px;font-weight:900;letter-spacing:.02em}
.tel small{font-size:30px;font-weight:700;margin-left:14px;letter-spacing:0;color:#a9e6f7}
.ojo{border:5px solid #b42318;border-radius:26px;background:#fff;padding:24px 32px;margin:6px 0 18px}
.ojo h3{font-size:36px;font-weight:900;color:#b42318;margin-bottom:10px;letter-spacing:.04em}
.ojo li{list-style:none;position:relative;padding-left:46px;font-size:30px;line-height:1.28;font-weight:600;margin:10px 0}
.ojo li:before,.ojo li:after{content:"";position:absolute;left:8px;top:15px;width:26px;height:5px;background:#b42318;border-radius:3px;transform:rotate(45deg)}
.ojo li:after{transform:rotate(-45deg)}
.rc{background:#fff6e0;border:3px solid #f0c36d;border-radius:22px;padding:20px 28px;font-size:29px;line-height:1.3;font-weight:600;margin-bottom:18px}
footer{display:flex;justify-content:space-between;gap:24px;font-size:27px;line-height:1.35;color:#35505e;border-top:3px solid #cddbe3;padding-top:18px}
footer b{color:#152a36}.sello{font-size:24px;color:#6a808c;margin-top:12px}
`;

function html(id, logo) {
  const c = contenido(id);
  return `<!doctype html><html lang="es"><meta charset="utf-8"><style>${CSS}</style><body><div class="wrap">
<header><img src="${logo}" alt=""><div><small>CC MONZÓN</small><h1>En caso de accidente</h1></div></header>
<div class="fed">${esc(c.etiqueta)}</div>
<div class="urg"><b>112</b><span>Si peligra la vida,<br>llama primero al 112</span></div>
${c.pasos.map((p, i) => `<div class="step"><div class="n">${i + 1}</div><div><h2>${esc(p.t)}</h2><p>${esc(p.s)}</p>${p.tel ? `<div class="tel">${esc(p.tel)}<small>Gerosalud</small></div>` : ''}</div></div>`).join('')}
<div class="ojo"><h3>OJO</h3><ul>${c.ojo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
<div class="rc">${esc(c.rc)}</div>
<footer><div><b>Póliza de accidentes</b><br>${esc(c.polizaAcc)}</div><div><b>Responsabilidad civil</b><br>${esc(c.polizaRc)}</div></footer>
<p class="sello">Resumen · temporada 2026 · Más detalle, correos y PDF en la app (cruz roja junto a la campanita). Manda siempre el texto de la póliza.</p>
</div></body></html>`;
}

async function main() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const logo = 'data:image/png;base64,' + (await readFile(join(ROOT, 'icons', 'logo.png'))).toString('base64');
  await mkdir(join(ROOT, 'img'), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1200 }, deviceScaleFactor: 1 });
  for (const id of ORDEN_FEDERACIONES) {
    await page.setContent(html(id, logo), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const out = join(ROOT, FEDERACIONES[id].imagen);
    await page.screenshot({ path: out, fullPage: true });
    console.log('✔', FEDERACIONES[id].imagen);
  }
  await browser.close();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
