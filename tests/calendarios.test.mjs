// Pruebas del lector de calendarios con trozos de HTML con la misma estructura que las webs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFcc, parseFac, niceCase, mapModality } from '../scripts/calendarios.mjs';

const FCC_HTML = `<table><tbody>
<tr class="odd views-row-first">
  <td class="views-field views-field-nothing-2"><span property="dc:date" content="2026-11-14T15:00:00+01:00" class="date-display-single">14/11/2026</span></td>
  <td class="views-field views-field-php"><a href="/cursa/ciclocros/dark-cross-copa-espanya-c1">DARK CROSS COPA ESPANYA C1</a><ul><li><a href="/campionat/ciclocros/copa">Copa Catalana Ciclocròs</a></li>
</ul></td>
  <td class="views-field views-field-nothing">Franqueses del Vallès, Les<br/>
Barcelona</td>
  <td class="views-field views-field-nothing-1">Ciclocròs<br />CX</td>
  <td><span class="span-comp" title="Competició"> </span></td>
</tr>
<tr class="even">
  <td><span content="2026-11-15T09:00:00+01:00">15/11/2026</span></td>
  <td><a href="/cursa/trobades/gravel-x">GRAVEL X</a></td>
  <td>PÈRNES-LA-FONTAINE<br/>FRANÇA</td>
  <td>Trobades<br />Trobades Gravel</td>
  <td><span class="span-comp oci" title="Oci"> </span></td>
</tr>
</tbody></table>`;

const FAC_HTML = `<a href="https://aragonciclismo.com/index.php/smartweb/inscripciones/prueba/35887-V-TROFEO-CX">x</a>
<table><tbody>
<tr style="background-color:">
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario"><div style="display:none;">
      1795302000   </div><a href="#c">22<br>NOV</a></td>
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario">CicloCross</td>
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario">Cadete, Elit...</td>
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario">1.33.5</td>
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario">V TROFEO CX CASTEJON DE SOS</td>
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario">CASTEJON DE SOS (HUESCA)</td>
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario">VALLE DE BENASQUE A.C.</td>
  <td data-toggle="modal" data-target="#prueba35887" class="td-calendario">COPA ARAGONESA CX</td>
  <td class="td-calendario-sin-cursor"></td>
</tr></tbody></table>`;

test('lee el calendario de la Federació Catalana', () => {
  const [a, b] = parseFcc(FCC_HTML);
  assert.deepEqual(a, {
    source: 'FCC', date: '2026-11-14', name: 'Dark Cross Copa Espanya C1', place: 'Les Franqueses del Vallès',
    province: 'Barcelona', country: 'España', modality: 'Ciclocross', discipline: 'Ciclocròs · CX', kind: 'Competición',
    info: 'Copa Catalana Ciclocròs', url: 'https://www.ciclisme.cat/cursa/ciclocros/dark-cross-copa-espanya-c1',
  });
  assert.equal(b.country, 'Francia');
  assert.equal(b.province, '');
  assert.equal(b.place, 'Pèrnes-La-Fontaine');
  assert.equal(b.kind, 'Ocio');
  assert.equal(b.modality, 'Gravel');
});

test('lee el calendario de la Federación Aragonesa (fecha en hora de Madrid)', () => {
  const [r] = parseFac(FAC_HTML);
  assert.equal(r.date, '2026-11-22'); // 1795302000 = 21/11 23:00 UTC = 22/11 en Madrid
  assert.equal(r.name, 'V Trofeo CX Castejon de Sos');
  assert.equal(r.place, 'Castejon de Sos');
  assert.equal(r.province, 'Huesca');
  assert.equal(r.modality, 'Ciclocross');
  assert.equal(r.url, 'https://aragonciclismo.com/index.php/smartweb/inscripciones/prueba/35887-V-TROFEO-CX');
  assert.match(r.info, /COPA ARAGONESA CX/);
});

test('nombres y modalidades', () => {
  assert.equal(niceCase('SANT VICENÇ DELS HORTS'), 'Sant Vicenç dels Horts');
  assert.equal(niceCase('IV CICLOCROSS DE TARAZONA'), 'IV Ciclocross de Tarazona');
  assert.equal(niceCase('Open BTT CAMBRILS'), 'Open BTT CAMBRILS');
  assert.equal(mapModality('Carretera'), 'Carretera');
  assert.equal(mapModality('BMX'), 'Otra');
});
