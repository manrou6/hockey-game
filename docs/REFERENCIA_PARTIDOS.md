# Referencia: partidos reales de hockey patines (OK Liga)

> **Esto es referencia, NO diseño aprobado.** Es un análisis hecho con Gemini a partir de 3 vídeos de la OK Liga, pasado por Guillem el 2026-10-07. **Las marcas de tiempo pueden no ser exactas** y las medidas (por ejemplo la altura de la cámara) son **estimaciones**. No se cambia nada de `docs/01` a `docs/06` por lo que diga este documento sin preguntar antes a Guillem (CLAUDE.md). Se usa como brújula para afinar y para proponer.

Dónde se usa: la afinación del pase (v0.1.21) y el plan de F1.5 (el tiro): cuando lo proponga diré qué ideas de aquí incorporo y cuáles no.

## 1. Informe original (Gemini), sin cambios

### 1. CÁMARA TV
- Posición y ángulo: la cámara se sitúa en un lateral, elevada en la grada (unos 6-8 m de altura, estimación). Ángulo picado que da buena perspectiva de la profundidad de la pista.
- Campo visual: muestra siempre entre el 50 % y el 60 % de la pista a lo largo. En ataque estático, engloba a los 8 jugadores de pista.
- Seguimiento de la bola: paneo horizontal muy suave y continuo. Sin zooms bruscos con la bola viva, para no perder la disposición táctica. Sutil anticipación en los pases cruzados largos.
- Cambios de plano: con el juego vivo, siempre plano general lateral. Primeros planos de jugadores o entrenadores solo cuando el árbitro pita. Repeticiones de goles de 10-15 s, a menudo con una cámara detrás de la portería.

### 2. MOVIMIENTO DE LOS JUGADORES
- Patinaje cruzando los patines; aceleración muy explosiva en distancias cortas.
- Frenadas: principalmente freno en T.
- Cambios de dirección ("trencada"): usan los cantos de las ruedas para girar hasta 180° sin frenar del todo; vital en las esquinas y para despistar en ataque.
- Postura: centro de gravedad muy bajo, rodillas flexionadas, torso inclinado. Stick a dos manos; conducción con toques continuos y cortísimos de derecha a izquierda de la pala para proteger la bola.

### 3. PASES
- El raso tenso es el dominante absoluto. El picado o bombeado se usa sobre todo para saltar una muralla de sticks.
- Uso constante de las vallas redondeadas de detrás de la portería para autopases o para rebotar la bola al otro lado.
- La mayoría son pases cortos muy rápidos por el perímetro de la defensa; los cruzados rompen líneas pero tienen mucho riesgo de intercepción.
- En ataque estático, una jugada puede encadenar 10-15 pases antes del tiro.

### 4. TIROS Y REGATES
- Tiro fuerte desde lejos (levantando el stick), muy potente. En el área, tiros rápidos de muñeca y el tiro a la media vuelta (recibe de espaldas y gira de golpe para tirar).
- Regates basados en fintas de cuerpo y amagos de tiro más que en velocidad: pasarse la bola por debajo de los patines, amagar al portero hasta que cae y entonces levantar la bola.

### 5. TÁCTICA Y POSICIONAMIENTO
- Ataque: formación 2-2 (cuadrado) o 1-2-1 (rombo), con rotaciones constantes ("la rueda").
- Defensa: zonal, en "cuadro" muy cerrado sobre su área; no buscan robar agresivamente, sino bloquear con cuerpo y sticks los tiros exteriores.
- Transición: al perder la bola, repliegue instantáneo para montar el bloque.

### 6. PORTERO
- Parte agachado y, en el tiro, cae en "mariposa" (rodillas en el suelo, guardas juntas tapando abajo). En tiros altos es difícil distinguir con qué para.
- En falta directa o penalti, sale a achicar hasta el límite del área, aguanta de pie las fintas y se lanza en el último momento.

### 7. RITMO DEL PARTIDO
- Rachas rítmicas; pocas paradas con silbato; las pausas principales son el cobro de faltas.
- Posesión elástica: 5 s en un contragolpe o 30-40 s moviendo la bola de lado a lado.
- Máxima tensión en las transiciones tras un robo en el medio campo: de "ajedrez estático" a un 1 contra 1 vertiginoso en un segundo.

### 8. RECOMENDACIONES PARA EL VIDEOJUEGO (ordenadas por impacto)
1. Rebote en la valla como herramienta táctica central (pases y tiros detrás de la portería).
2. Defensa en "cuadro": defender es cerrar líneas de pase y tiro, no ir a robar a lo loco.
3. Conducción con toques automáticos de lado a lado de la pala.
4. Cámara de retransmisión lateral elevada, sin zoom dinámico sobre el que lleva la bola; ver el 50-60 % de la pista.
5. Tiro a la media vuelta como acción contextual al recibir de espaldas cerca del área.
6. Inercia de patinaje: nada de giros de 180° instantáneos; frenada o trencada visible al cambiar de sentido.
7. Portero en "mariposa" ante tiros desde el área; que cueste marcar raso y premie levantar la bola.
8. Pases y tiros picados con un modificador para superar la muralla de sticks.
9. Falta directa / penalti con cámara detrás del tirador y duelo de fintas contra el portero.
10. Premiar la paciencia moviendo la bola por el perímetro frente a jugar solo a esprintar y tirar.

## 2. Cómo encaja con lo que ya hay (nota de Claude Code, no del informe)

| Punto del informe | Estado actual del juego |
|---|---|
| El raso tenso domina; el picado salta la muralla de sticks | Ya es así: raso por defecto, alto fuerte y vaselina con el gesto diagonal (v0.1.19-v0.1.20). Sin rivales no se puede probar «saltar la muralla» (F2). |
| Rebote en la valla como herramienta central | Pared con la valla contra una valla **lateral** que vuelve al propio pasador (v0.1.20). Faltan: rebote hacia un **compañero**, las vallas redondeadas **detrás de la portería** y los tiros (ver «Ideas extra»). |
| Cadenas de 10-15 pases en ataque estático; pases cortos muy rápidos | Banco de pruebas de la v0.1.21: cadena de 5 pases en 1,7-2,9 s (ver `DECISIONS.md`). Para 10-15 pases hace falta la IA de equipo con movimientos de apoyo (F2). |
| Frenadas: principalmente **freno en T** | **Contradice una decisión de Guillem**: `docs/03` §1 pone la frenada de 4 ruedas (derrape) «en sustitución de la frenada en T de F0, petición de Guillem». **No se cambia sin preguntar.** Se puede plantear en F1.6 (regates). |
| Trencada: giros de hasta 180° sin frenar del todo | La trencada actual frena ~0,3 s antes de girar (pierde un 35 % de velocidad). Propuesta de acortar la frenada previa: ver `DECISIONS.md` (propuestas sin aplicar). |
| Cámara lateral elevada de 6-8 m, 50-60 % de la pista, sin zoom sobre el que lleva la bola | Nuestra cámara TV: 10 m de altura y 21 m de distancia (docs/03 §6) con un poco de zoom a velocidad. Medir qué fracción de la pista se ve y comparar: F4. |
| Conducción con toques automáticos de lado a lado de la pala | Ya hay un «ritmo de toques» de la bola pegada a la pala (docs/03 §2), pero **sin animación visible**: F1.6 / F4. |
| Portero en «mariposa», media vuelta, tiro desde lejos levantando el stick | F1.5 (tiro) y F1.8 (portero). |
| Defensa en «cuadro» | F2 (`docs/03` §7 ya lista zona en cuadrado y en rombo). |

## 3. Ideas extra (propuestas de Guillem, 2026-10-07; sin aplicar)

(a) **Dos tipos de tiro.**
   - **De pala, rápido, al primer toque:** se dispara casi al recibir, con poca preparación.
   - **De «arrastre»:** la bola se engancha a la pala un instante mientras se carga; sale **más potente y más precisa**, pero **se puede robar mientras carga** (riesgo/recompensa).
   - Encaja con F1.5 (el tiro) y con la carga del pase (mismo gesto de mantener). Decidir en el plan de F1.5.

(b) **Asistencia al pase contra la valla buscando el rebote hacia un compañero.**
   - Hoy la pared con la valla (v0.1.20) solo vuelve **al propio pasador**. La idea amplía la asistencia: si un compañero está en el cono «al otro lado» de la valla, el pase se calcula para que rebote y le llegue a él.
   - Reutiliza la ecuación del rebote de `src/sim/wallPass.ts` (punto de contacto por espejo + velocidad por bisección); lo nuevo es el objetivo (un compañero que se mueve) y la elección de receptor. También útil detrás de la portería (vallas redondeadas).

(c) **Bola pesada** que se **desliza y rebota de forma predecible** en la valla, no «como una pelota de tenis».
   - Estado actual: restitución de la valla 0,7 y de suelo 0,45, con un desvío aleatorio de ±3° en cada rebote (`ball.boardRestitution`, `ball.floorRestitution`, `ball.boardJitter`).
   - Una bola más «pesada» sería menos rebotona (menos restitución), con más deslizamiento tangencial a lo largo de la valla y menos desvío aleatorio. Es afinación de números **de la bola** (afecta a todo: pared, tiros, rebotes del portero): hay que probarlo con Guillem antes de tocarlo.

## 4. Qué aplicar en qué fase

| Fase | Qué se aplica de este informe | Estado |
|---|---|---|
| **Afinación del pase (ahora, v0.1.21)** | Pases cortos muy rápidos y cadenas largas (punto 3, recom. 10); rebote en la valla (recom. 1, ya la pared con la valla); inercia al cambiar de sentido (recom. 6): medir la trencada y proponer (sin aplicar) acortar la frenada previa | Hecho (medido y retocado) / propuestas en `DECISIONS.md` |
| **F1.5 Tiro** | Tiro fuerte desde lejos «levantando el stick» (punto 4), tiro de muñeca rápido en el área, **media vuelta** como acción contextual (recom. 5), tiro de pala al primer toque y tiro de «arrastre» (idea extra a), tiros picados con modificador (recom. 8), rebote de tiros en la valla detrás de la portería (recom. 1) | Plan de F1.5: diré cuáles incorporo |
| **F1.6 Regates** | Fintas de cuerpo y amagos de tiro (punto 4), pasarse la bola por debajo de los patines, conducción con toques de lado a lado de la pala (recom. 3), **freno en T vs derrape de 4 ruedas** (hay que preguntar a Guillem), giros de hasta 180° con trencada (recom. 6) | Pendiente |
| **F1.8 Portero** | «Mariposa» ante tiros desde el área; que cueste marcar raso y premie levantar la bola (recom. 7); en directas/penaltis sale a achicar y se lanza en el último momento (punto 6) | Pendiente |
| **F2 IA** | Defensa en «cuadro» y cerrar líneas de pase y tiro, no robar a lo loco (recom. 2); ataque 2-2 / 1-2-1 con rotaciones («la rueda»); repliegue instantáneo al perder la bola; premiar la paciencia por el perímetro (recom. 10); posesión elástica de 5 s a 40 s; compañeros que se ofrecen mejor para el pase | Pendiente |
| **F3 Faltas directas** | Falta directa / penalti con cámara detrás del tirador y duelo de fintas contra el portero (recom. 9); cobro de faltas como pausas principales (punto 7) | Pendiente |
| **F4 Cámara y arte** | Cámara lateral elevada (6-8 m, estimación) viendo el 50-60 % de la pista, sin zoom sobre el que lleva la bola (recom. 4); cambios de plano solo con silbato; repeticiones de 10-15 s con cámara tras la portería; postura baja y animación de patinaje (punto 2) | Pendiente |
