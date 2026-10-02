# 03 — Jugabilidad: física, controles, regates, cámara e IA

Todos los números son valores iniciales para afinar. Viven en src/config/tuning.ts y se pueden tocar en vivo desde un panel de debug (solo en build de desarrollo).

## 1. Sensación de patinaje
- Simulación a 60 Hz con paso fijo; render interpolado.
- Jugador = cápsula en el plano de la pista con inercia real de patinador:
  - Velocidad máx. conduciendo: ~7,5 m/s. Sprint sin bola: ~9 m/s (~32 km/h).
  - Aceleración desde parado: ~0 → 7 m/s en ~1,8 s. Curva no lineal (arranca fuerte).
  - Giro: radio mínimo crece con la velocidad (a tope no se gira en seco). Giro cerrado = pérdida de velocidad.
  - Frenada "en T" o en cuña: animación + chispa de sonido, frena en ~0,6 s.
  - Deslizamiento: al soltar el joystick el jugador planea y desacelera suave, nunca se para de golpe.
  - Contacto: empujones hombro con hombro según Físico; nunca atravesar jugadores ni la valla.
- Resistencia: el sprint la gasta; baja → menor aceleración y peor control. Cambios recuperan.

## 2. Bola
- Física 3D propia: posición con altura (z), rodadura, fricción, giro.
- Rebote en valla con pérdida de energía (~0,7) y algo de aleatoriedad determinista. Rebote en postes y travesaño.
- La bola puede ir por el aire (pase elevado, vaselina, tiro alto) y botar.
- Conducción: la bola va "imantada" al stick con un margen; a más velocidad y peor Control, más se separa y más fácil es robarla. Nunca debe parecer pegada con pegamento.
- Tiro: potencia ~15-30 m/s según carga y atributo. Precisión con cono de error que se reduce con atributo y tiempo de preparación.

## 3. Controles (dos esquemas, seleccionables y combinables)
### A. Joystick + botones (por defecto)
- Joystick virtual flotante (aparece donde pones el pulgar izquierdo, mitad izquierda de la pantalla).
- Botones (derecha), grandes, semitransparentes, posiciones editables:
  - PASE: toque = pase raso al compañero en la dirección del joystick. Mantener = pase elevado/largo.
  - TIRO: toque = tiro rápido. Mantener = carga (barra) y soltar. Deslizar el dedo al soltar = dirección/efecto (arriba = tiro alto).
  - REGATE: toque = finta/regate contextual según dirección. Mantener = sprint.
  - En defensa: PASE → cambiar jugador, TIRO → entrada/robo, REGATE (mantener) → presionar/sprint.
- Buffer de input de 150 ms (si pulsas un poco antes de recibir, la acción sale al recibir).
- Asistencia al pase y apuntado configurable (Desactivada / Ligera / Fuerte).

### B. Gestos
- Mano izquierda igual (joystick). Mano derecha: deslizar corto = pase en esa dirección, deslizar largo hacia portería = tiro (longitud = potencia), doble toque = regate, mantener = sprint.

### PC
- Teclado (WASD + J/K/L/Espacio) y mando (Gamepad API).

### Feedback
- Vibración háptica corta (Vibration API) en tiro, gol, choque y poste. Desactivable.

## 4. Regates (el corazón del juego)
Se ejecutan con REGATE + dirección relativa al defensor. Éxito según atributo Regate, velocidad, timing y posición del defensor.
| Regate | Input | Uso |
|---|---|---|
| Amago de tiro | Mantener TIRO y cancelar con REGATE | Tumbar al portero o al defensa |
| Cambio de lado (derecha ↔ revés) | REGATE + lateral | Superar en carrera |
| Ruleta 360° | REGATE + giro de joystick | Proteger la bola y salir |
| Bola entre patines/piernas del rival | REGATE + hacia el defensor (timing) | Alto riesgo, alto premio |
| Vaselina (bola por encima) | REGATE + hacia el defensor mantenido | Superar stick tumbado o portero adelantado |
| Pared con la valla | PASE contra la valla en la dirección | Autopase rodeando al defensor |
| Juego por detrás de la portería | Conducir por detrás + TIRO | Remate de "cuchara" o pase atrás |
- Encadenar 2 regates con buen timing da un pequeño impulso de velocidad (recompensa el estilo).
- Animaciones de regate de 0,3-0,6 s, cancelables tras su ventana activa para no sentirse lento.

## 5. Porteros
- Postura base de rodillas/agachado, desplazamiento lateral, estirada de piernas (protecciones grandes), parada con stick, guante y cuerpo; se tumba.
- IA de portero: posición según ángulo de la bola, anticipa pase atrás, sale en 1 vs 1, reacciona a amagos (puede picar).
- Control manual del portero opcional en libres directos/penaltis cuando defiende el jugador humano: deslizar para estirarse.

## 6. Cámara (retransmisión TV)
- Cámara lateral elevada desde la grada central, sigue la bola con anticipación (lookahead según velocidad), suavizado crítico (sin vibrar).
- Zoom dinámico: más abierto en transición, más cerrado en ataque posicional.
- Cámaras especiales: detrás del lanzador en directas/penaltis; repeticiones (detrás de portería, a ras de pista, cenital).
- Opciones: distancia de cámara (3 niveles).

## 7. IA de equipo
- Arquitectura: equipo (táctica) → roles → jugador (decisiones con utilidad + steering).
- Sistemas defensivos: zona en cuadrado, zona en rombo, individual, presión alta. Cada equipo tiene uno preferido y cambia según el marcador/tiempo.
- Ataque: ocupar espacios, pases de apoyo, desmarques al segundo palo, uso de la valla y de la zona tras portería, aprovechar superioridad numérica.
- Decisión del jugador IA con bola: tirar / pasar / regatear / proteger según ventaja, presión y atributos.
- Reacciona a inferioridad (más conservador) y a falta de equipo cercana a la 10ª/15ª (defiende con menos contacto).
- Dificultad cambia tiempo de reacción, calidad de decisión y agresividad, no velocidades.

## 8. Árbitro
- Detección de faltas por reglas: contacto desde atrás, golpe de stick al cuerpo, stick alto, obstrucción, zancadilla, retención.
- Gravedad según velocidad del impacto, posición y si cortaba ocasión manifiesta (último defensor, bola controlada, dirección a portería).
- Ley de la ventaja cuando el atacante sigue con la bola en ataque.

## 9. Medir que "se siente bien"
- Latencia input → movimiento visible ≤ 50 ms.
- Ningún frame > 33 ms en partido en Pixel 8a.
- Un jugador nuevo marca un gol en el modo entrenamiento en menos de 60 s.
- Sesiones de prueba: Guillem graba 30 s de pantalla y lista 3 cosas que se sienten mal; se ajusta tuning.ts.
