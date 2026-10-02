# 05 — Arquitectura técnica

## Decisión de plataforma (y por qué)
Web 3D (TypeScript + Babylon.js) como PWA, y más tarde empaquetado Android con Capacitor.
- Guillem no programa: no hay que instalar Unity/Godot, SDKs de Android ni editores. Se prueba abriendo un enlace en el Pixel.
- Claude Code puede compilar, ejecutar tests y hacer capturas con Playwright en su entorno, sin editor gráfico.
- El mismo código sirve para móvil, PC y, más adelante, APK/Play Store.
- Coste: algo menos de rendimiento que nativo; se compensa con presupuestos estrictos (docs/04).

## Stack
- TypeScript (strict), Vite, Babylon.js (core, loaders, GUI si conviene), vite-plugin-pwa.
- Sin motor de físicas para el juego: simulación propia (más control del "feel", determinista para repeticiones y online).
- Estado de UI/menús: ligero (sin framework pesado; si hace falta, Preact).
- Persistencia local: IndexedDB (ligas, carrera, ajustes) con exportar/importar partida.
- Tests: Vitest + Playwright. CI: GitHub Actions (build, test, deploy a GitHub Pages).
- Online (F7): servidor autoritativo en Node con Colyseus, mismo código de simulación compartido.

## Estructura de carpetas
```
src/
  sim/          simulación pura y determinista (jugadores, bola, reglas, árbitro, IA)
    rules/      reglamento WSE (faltas, tarjetas, directas, reloj, antijuego)
    ai/         IA de equipo, jugador y portero
  render/       Babylon: escena, pabellón, jugadores, animación, cámara, efectos
  input/        joystick, botones, gestos, teclado, mando → comandos abstractos
  audio/        Web Audio, mezcla dinámica
  ui/           menús, marcador, HUD, ajustes
  game/         bucle principal, modos (entrenamiento, partido, liga, copa, carrera)
  data/         equipos, jugadores, nombres generados (JSON)
  i18n/         ca.json, es.json, en.json
  config/       tuning.ts, quality presets
  net/          (F7) cliente online
server/         (F7) servidor Colyseus
tests/          unit (sim) + e2e (Playwright)
public/assets/  modelos, texturas, audio (con CREDITS.md)
docs/
```

## Principios
1. Separación estricta sim / render: la simulación produce un estado; el render lo interpola y lo dibuja. La IA y los humanos producen los mismos "comandos" de entrada.
2. Determinismo: paso fijo 1/60 s, RNG con semilla propio, sin dependencias de tiempo real dentro de sim. Permite repeticiones (guardar inputs) y online.
3. Datos sobre código: equipos, atributos, tuning y textos en archivos de datos.
4. Debug primero: panel de debug (fps, frame time, estado de IA, hitboxes, tuning en vivo), activable con ?debug=1.
5. Calidad adaptable: autodetección de preset, escalado de resolución dinámico.

## Rendimiento
- Medir siempre en modo "móvil" (Playwright con emulación + throttling de CPU) y reportar frame time medio y p95.
- Evitar asignaciones por frame en el bucle (pools de vectores), congelar matrices de objetos estáticos, instancing para público y elementos repetidos.

## Tests mínimos
- Unit: física de bola (rebotes), reglas (10ª falta → directa, azul → 2 min completos aunque haya gol, regla 5 s), determinismo (misma semilla + inputs = mismo resultado).
- E2E: carga en viewport de móvil horizontal, entrar a partido, 10 s de juego sin errores en consola, captura.

## Despliegue
- GitHub Pages desde GitHub Actions en cada push a main. URL: https://<usuario>.github.io/<repo>/
- Rama main siempre jugable. Trabajo en ramas por fase si conviene, merge al cerrar sub-paso.
- Versión visible en ajustes (v0.F.N) para saber qué build está probando Guillem.

## Android (fase opcional)
- Capacitor para generar APK firmado mediante GitHub Actions (sin instalar nada en local).
- Play Store requiere cuenta de desarrollador de Google (pago único) y ficha de la tienda; se prepara al final.
