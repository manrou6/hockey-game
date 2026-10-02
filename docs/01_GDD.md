# 01 — Game Design Document

## Visión
Un partido de hockey patines que se siente como una retransmisión real de televisión: velocidad, contacto, bola que rebota en la valla, regates de stick y porteros que se estiran. Simulación con reglamento World Skate, pero con un control tan fluido que en 10 segundos ya estás regateando.

Nombre provisional: PATINS.

## Pilares (todo se decide contra estos 4)
1. Fluidez absoluta: respuesta al input inmediata, 60 fps, cero tirones. Si algo se siente "pesado", es un bug.
2. Frenético pero legible: ritmo alto, transiciones rápidas, pero siempre se entiende qué pasa (cámara, lectura de la bola, feedback).
3. Regate como protagonista: el 1 contra 1 y el duelo con el portero son el corazón del juego.
4. Autenticidad: reglas WSE reales (faltas de equipo, libres directos, azules), juego por detrás de la portería, valla viva.

## Plataforma
- Principal: móvil Android en horizontal (Pixel 8a como dispositivo de referencia). Secundaria: PC con teclado/mando.
- Formato: web app instalable (PWA). Más adelante, empaquetado Android (APK / Play Store) sin reescribir.

## Modos de juego
| Modo | Descripción | Fase |
|---|---|---|
| Entrenamiento | Pista libre + retos: conducción, regate de conos, tiro a zonas, directas | F1 |
| Partido rápido | Elegir 2 equipos, duración, dificultad, estadio | F2 |
| Directas y penaltis | Duelo jugador vs portero, modo arcade por rondas y tanda de desempate | F3 |
| Liga | 12 equipos, ida y vuelta, clasificación, estadísticas, calendario | F5 |
| Copa / torneo | Eliminatorias o fase de grupos + KO, final a partido único | F5 |
| Modo carrera | Creas tu jugador, empiezas en un club modesto, progresas, ofertas de clubes, selección | F5 |
| Online | 1 vs 1 por código de sala, después emparejamiento | F7 |

## Duración de partido (configurable)
Real: 2 partes de 25 min a reloj parado. En el juego: 2 partes de 3 / 5 / 8 / 12 min de reloj de juego (por defecto 5). El reloj se para como en la realidad (faltas, goles, fuera).

## Equipos (sin marcas reales)
- Inspirados en ciudades con tradición de hockey patines. Se puede usar el nombre de la ciudad; nombre del club, escudo, colores exactos y patrocinadores deben ser inventados.
- Liga base de 12: Vic, Reus, Igualada, Lloret, Calafell, Sant Sadurní, Voltregà, Barcelona, Lleida, Girona, A Coruña, Alcobendas.
- Copa internacional (más adelante): ciudades de Portugal, Italia, Francia, Argentina, Suiza, Alemania.
- Cada equipo: nombre inventado, apodo, 2 colores, escudo generado (vectorial, simple), estilo táctico, 10 jugadores (8 de pista + 2 porteros) con nombres inventados.

## Atributos de jugador (0-99)
Patinaje (velocidad, aceleración, agilidad), Control de bola, Regate, Pase, Tiro (potencia, precisión), Defensa (marcaje, robo), Físico, Resistencia, Visión. Porteros: Reflejos, Posición, Estirada, Salida, Juego con stick.

## Experiencia de partido (presentación TV)
- Previa: plano general del pabellón, alineaciones, saludo.
- Durante: marcador estilo TV (equipos, resultado, reloj, faltas de equipo, sancionados), indicador de posesión 45 s.
- Goles: celebración breve, repetición automática con 2-3 cámaras, saltable.
- Descanso y final: estadísticas (tiros, posesión, faltas, directas).

## Dificultad
Fácil / Normal / Difícil / Leyenda. Afecta a IA táctica, reacción del portero y asistencia al pase/tiro, nunca "trampas" de velocidad.

## Idiomas
Catalán (por defecto), español, inglés.

## Fuera de alcance (por ahora)
Comentarista con voz, editor de equipos online, monetización, licencias reales.
