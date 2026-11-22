# Propuestas de mejora para el contrato 2028

Lista abierta. Cada punto indica qué cambia respecto al contrato 2027 y lo que queda por decidir.

## 1. Material incluido: solo lo básico; el resto, por pedido de club

- **Entra en el contrato:** maillot, culote, calcetines y maillot Hyder.
- **Todo lo demás** (chaleco, manguitos, camiseta interior, etc.) va por **pedido de club**, que se hace **2 veces al año: septiembre y marzo**.
- **Unidades: igual que en 2027.** Nuevo: 2 maillots, 2 culotes, 1 Hyder y 1 par de calcetines. Renovación: 1 maillot, 1 culote y 1 par de calcetines. Sin licencia: nada.
- **Gorra y camiseta de patrocinadores:** siguen gratis solo para los nuevos.
- **Liquidación a final de año:** el 31 de diciembre se hacen las cuentas de cada corredor. Se suman los bonos que haya ganado y se restan la penalización y los recargos de la ropa comprada (también la del pedido de club) si no ha llegado al mínimo. El resultado es lo que cobra o lo que paga.

## 2. Bono: empieza en la carrera 13, con tramos de 5 en 5

- El mínimo sigue en **12 carreras**: por debajo hay penalización.
- Llegar a 12 carreras solo evita la penalización; **el bono empieza en la 13**.
- Tramos nuevos, de 5 en 5:

| Carreras | Nuevo y renovación | Renovación sin licencia |
|---|---|---|
| 13 | 50 € | 100 € |
| 18 | 100 € | 150 € |
| 23 | 150 € | 200 € |

- **Renovación sin licencia:** mantiene los mismos importes que en 2027 (100/150/200 €), porque no recibe material y se paga su licencia. Solo cambian los tramos (13/18/23).

## 3. Bonificación plus (+4 carreras): también por parejas

- Además de las clasificaciones individuales, la bonificación también se gana con un **podio en una general final por parejas**:
  - la **general final de una carrera por parejas de varios días** (por ejemplo, una prueba de 2 días o una carrera mediterránea de 4 días), o
  - la **general final de una liga por parejas**.
- **Solo cuenta la general final.** No cuentan los podios de una etapa ni de una prueba suelta de la liga.
- Diferencia con la individual: en individual tiene que ser la general final de un Open, Critérium, Copa o Liga; en parejas, como es mucho más difícil, también vale la general final de una sola carrera de varios días.
- **La pareja tiene que ser del mismo equipo y correr con los mismos colores** (los dos del Club Ciclista Monzón, con la equipación oficial). Una pareja con alguien de otro equipo no cuenta.
- Igual que en la individual, la prueba tiene que estar anunciada en la web de una Federación y tener clasificación general y podio.
- **Pendiente de decidir:** si cada miembro de la pareja recibe las +4 carreras.

## Al aplicar estos cambios

- En la app, los nuevos tramos (13/18/23) se configuran en **Corredores → Bonos por carreras → Condiciones del bono 2028**, sin tocar el código. La app ya permite que el mínimo (12) y el primer tramo (13) sean distintos.
- Contratos: cambiar `contratos/generar.cjs` (temporada, tramos, material, precios) y regenerar los PDF y las imágenes de resumen.
