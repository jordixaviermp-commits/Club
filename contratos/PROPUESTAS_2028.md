# Propuestas de mejora para el contrato 2028

Lista abierta. Cada punto indica qué cambia respecto al contrato 2027 y lo que queda por decidir.

## 1. Material incluido: solo lo básico; el resto, por pedido de club

- **Entra en el contrato:** maillot, culote, calcetines y maillot Hyder.
- **Todo lo demás** (chaleco, manguitos, camiseta interior, etc.) va por **pedido de club**, que se hace **2 veces al año: septiembre y marzo**.
- **Pendiente de decidir:**
  - Cuántas unidades de cada prenda entran en cada tipo de contrato. En 2027 son: nuevo, 2 maillots, 2 culotes, 1 Hyder y 1 par de calcetines; renovación, 1 maillot, 1 culote y 1 par de calcetines; sin licencia, nada.
  - Si la gorra y la camiseta de patrocinadores (gratis para los nuevos en 2027) siguen siendo gratis o pasan también al pedido de club.
  - Si el recargo por prendas compradas aparte se mantiene para lo que se pide en el pedido de club.

## 2. Bono: empieza en la carrera 13, con tramos de 5 en 5

- El mínimo sigue en **12 carreras**: por debajo hay penalización.
- Llegar a 12 carreras solo evita la penalización; **el bono empieza en la 13**.
- Tramos nuevos, de 5 en 5:

| Carreras | Nuevo y renovación | Renovación sin licencia |
|---|---|---|
| 13 | 50 € | ¿100 €? |
| 18 | 100 € | ¿150 €? |
| 23 | 150 € | ¿200 €? |

- **Pendiente de decidir:** si los importes de renovación sin licencia se mantienen (100/150/200 €).

## 3. Bonificación plus (+4 carreras): también por parejas

- Además de las clasificaciones individuales, la bonificación también se gana con:
  - clasificaciones **generales por parejas**, y
  - **podios por parejas en ligas**.
- **Pendiente de decidir:**
  - Si los dos miembros de la pareja reciben las +4 carreras cada uno.
  - Si la pareja tiene que ser de dos corredores del club, o si vale una pareja mixta con alguien de otro equipo.
  - Si se mantiene que solo cuenta la general final del torneo y no las pruebas de un solo día.

## Al aplicar estos cambios

- En la app, los nuevos tramos (13/18/23) se configuran en **Corredores → Bonos por carreras → Condiciones del bono 2028**, sin tocar el código. La app ya permite que el mínimo (12) y el primer tramo (13) sean distintos.
- Contratos: cambiar `contratos/generar.cjs` (temporada, tramos, material, precios) y regenerar los PDF y las imágenes de resumen.
