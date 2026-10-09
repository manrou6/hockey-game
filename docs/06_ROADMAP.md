# 06 — Roadmap por fases

Regla: no se empieza una fase sin cerrar la anterior (criterios cumplidos + Guillem ha probado en el Pixel). Cada fase se divide en sub-pasos que caben en una sesión de Claude Code.

## F0 — Cimientos
Objetivo: repo listo, despliegue automático, pista 3D con cámara TV y un jugador que patina.
- Proyecto Vite + TS + Babylon, PWA, horizontal, pantalla completa, icono provisional.
- GitHub Actions: build + tests + deploy a GitHub Pages.
- Bucle con simulación a paso fijo e interpolación. Panel de debug (?debug=1).
- Pista con medidas del reglamento, vallas, porterías, iluminación base.
- Un jugador cápsula controlable con joystick virtual y teclado.
- i18n base (ca/es/en) y pantalla de ajustes mínima con número de versión.
Aceptación: el enlace abre en el Pixel, se instala como app, 60 fps estables, el jugador patina con inercia.

## F1 — Game feel: patinaje, bola, controles (Entrenamiento)
- Física completa de patinaje y bola (docs/03 §1-2), conducción, pase, tiro con carga, rebote en valla.
- Ambos esquemas de control + editor de posición de botones + vibración.
- Regates de docs/03 §4 (al menos 5) con placeholder de animación.
- Remate en el aire / volea (**F1.5d**, justo después de F1.5c) y **aixecar** + combo **aixecar + picar** (**F1.6**, con los regates): decisiones de Guillem del 2026-10-08 en docs/03 §3-§4 y DECISIONS.md. Ningún botón nuevo (aixecar dentro de REGATE, picar dentro de Xut); una sola regla de remate en el aire (mismo Xut, misma ventana); altura máxima 1,50 m (reglamento 2026, art. 6.3, verificado por Guillem el 2026-10-09; antes 1,05 m provisional; las faltas son de F3).
- **F1.5e** (v0.1.28, tras la prueba de Guillem de la v0.1.27): la volea de verdad: el alto fuerte llega por el aire a una altura cómoda (0,3-1,0 m, pico ≤ 1,40 m), remate en el aire solo de 0,15 a 1,50 m (reglamento, art. 6.3), recepción de la bola alta y cámara lenta de la ventana. El cierre de F1.5 se aplaza hasta que la volea le guste a Guillem. El gesto de arrastre hacia la portería (volea y picada) se decide en el plan de F1.6.
- Modo Entrenamiento: pista libre + 3 retos (conos, tiro a zonas, regatear a un defensa estático).
- Portero IA básico.
Aceptación: Guillem dice que conducir y regatear "se siente bien" tras una ronda de ajustes; marcar gol al portero básico es posible pero no trivial.

## F2 — Partido 5 vs 5
- 2 equipos completos, IA de equipo/jugador/portero (docs/03 §5 y §7), cambio de jugador.
- Reglas base: saque inicial, gol, reinicios, faltas leves, libre indirecto, reloj a reloj parado, 2 partes.
- Marcador TV básico. Modo Partido rápido (equipos placeholder).
Aceptación: un partido completo de 2 × 5 min sin bloqueos; la IA ataca, defiende y marca de forma creíble.

## F3 — Reglamento WSE completo
- Faltas de equipo (10ª, 15ª...), libre directo, penalti dinámico, amarilla/azul/roja con inferioridad completa, antijuego, regla de 5 s, ventaja, banquillo.
- Árbitros visibles con gestos. Cámara especial de directas. Control del portero en directas.
- Modo Directas y penaltis + tanda de desempate.
Aceptación: tests unitarios de todas las reglas de docs/02 en verde; un partido "sucio" de prueba aplica bien sanciones.

## F4 — Presentación TV y arte
- Jugadores **low-poly heroicos facetados** (proporciones atléticas algo exageradas, colores lisos sin texturas, stick a dos manos) con equipamiento, animación procedural de patinaje + tren superior, LOD (docs/04).
- Pabellones (3) facetados, público de pocos polígonos instanciado, iluminación limpia mate con contraluz suave, marcador final, repeticiones de gol, celebraciones.
- **Suelo seleccionable** por el jugador en Configuració (azul mate / parquet claro / crema; por pabellón en el futuro) y **modo noche NEÓN desbloqueable** (cómo se desbloquea se decide más adelante; la opción queda prevista): **forman parte del alcance de F4**. El arte se diseña para que cambiar de suelo o de modo sea **solo cambiar colores, materiales y luz, sin modelos distintos** (un «tema» de pabellón como datos). El suelo por defecto lo decide Guillem con la imagen 01 de `docs/ASSETS_SPEC.md`.
- Audio completo (docs/04). Menús definitivos.
- 12 equipos ficticios con escudos (SVG planos), colores y plantillas generadas.
Aceptación: capturas comparables a un juego deportivo móvil comercial modesto y coherentes con `docs/concept/style/`; 60 fps en preset Medio en el Pixel; los tres suelos y el tema neón se cambian en vivo sin recargar y con el mismo número de mallas (test).

## F5 — Modos
- Liga (12 equipos, ida/vuelta, clasificación, estadísticas), Copa (grupos + KO), Modo carrera (creación de jugador, progresión, ofertas, selección), guardado local con exportar/importar.
Aceptación: se puede jugar una temporada completa simulando partidos no jugados.

## F6 — Pulido y rendimiento
- Tutorial interactivo, dificultad equilibrada, accesibilidad (tamaño de botones, daltonismo de equipaciones), presets de calidad, carga rápida, sin errores en consola.
Aceptación: sesión de 30 min sin tirones ni calentamiento excesivo del móvil; lista de bugs de Guillem cerrada.

## F7 — Online
- Servidor autoritativo Colyseus con la misma simulación, predicción en cliente y reconciliación, 1 vs 1 por código de sala.
- Despliegue del servidor en un hosting de Node (elegir y documentar coste antes de contratar nada; preguntar a Guillem).
Aceptación: partido online entre el Pixel y un PC en redes distintas, jugable con ~80 ms de ping.

## F8 (opcional) — Android / Play Store
- Capacitor, APK firmado por GitHub Actions, ficha de tienda, política de privacidad.
