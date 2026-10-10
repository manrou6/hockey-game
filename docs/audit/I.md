## §I Actualización de la PWA

Auditoría sobre el código de la v0.1.29 (commit 00fc599). No cambia el juego: solo este documento y un experimento
Playwright que se salta por defecto (`tests/e2e/pwaUpdate.spec.ts`, se ejecuta solo con `PATINS_PWA=1`).

**Resumen.** Lo que se sospechaba es cierto y queda medido: **una app que vuelve de «recientes» sin recargarse no
busca nunca la versión nueva** (ni al volver a primer plano ni con el tiempo), así que la versión vieja sigue
mientras Android no cierre la app. Hay además un efecto secundario que también explica «a veces veo la vieja»: al
abrir la app tras un despliegue **los primeros segundos siempre son de la versión vieja** y después la página **se
recarga sola**, aunque estés en mitad de una jugada. La caché de GitHub Pages (`max-age=600`) **no** es la causa
cuando el service worker ya está instalado (medido). Propuesta recomendada (sin aplicar): **P-A**, aviso «Hi ha una
versió nova — toca per actualitzar» en el menú, búsqueda de versión al volver a la app y cada 30 min, y nunca
recargar en mitad de una jugada. Está probada con un prototipo.

### I.1 Configuración actual (evidencia)

| Pieza | Valor en la v0.1.29 | Dónde |
|---|---|---|
| Plugin | vite-plugin-pwa 1.3.0 (Workbox 7.4, `generateSW`) | `package.json`, `node_modules` |
| `registerType` | `'autoUpdate'` | `vite.config.ts` |
| `injectRegister` | `false`: registro manual con `registerSW({ immediate: true })` | `vite.config.ts`, `src/main.ts:25` |
| `skipWaiting` / `clientsClaim` | `true` / `true`: la versión nueva se activa y toma la página nada más instalarse | `vite.config.ts` → `dist/sw.js` (`self.skipWaiting(), s.clientsClaim()`) |
| Recarga al activarse | `registerSW` en modo autoUpdate: evento `activated` con `isUpdate` o `isExternal` → `window.location.reload()`, **sin mirar qué está haciendo el jugador** | `node_modules/vite-plugin-pwa/dist/client/build/register.js` |
| Navegación | `NavigationRoute(createHandlerBoundToURL("index.html"))`: **toda apertura de la app la contesta el service worker desde su caché**, nunca la red | `dist/sw.js` |
| Precaché | 73 archivos, 1,81 MB (0,49 MB gzip); `globPatterns` js, css, html, png, svg, json, webmanifest; `cleanupOutdatedCaches: true`; nombre de caché por defecto de Workbox (`workbox-precache-v2-…`) | build |
| Precaché de `index.html` | con revisión → se descarga con `cache: 'reload'` (se salta la caché HTTP) | `dist/workbox-9c191d2f.js` |
| `update()` periódico o al volver a primer plano | **No existe.** El único `visibilitychange` de `main.ts` pausa la partida | `src/main.ts:206` |
| Manifest | `id`/`start_url`/`scope` `/hockey-game/`, `display: fullscreen`, `orientation: landscape` | `dist/manifest.webmanifest` |
| Despliegue | push a `main` → build + Vitest + Playwright → `deploy-pages` (la web cambia al terminar todo el CI) | `.github/workflows/deploy.yml` |
| Cabeceras de GitHub Pages | `Cache-Control: max-age=600` en todos los archivos (dato del encargo; no se pudo comprobar en vivo: el proxy de este entorno bloquea el dominio de Pages) | — |

En la app instalada (`display: fullscreen`) **no hay botón de recargar ni «tirar para recargar»**: la única manera
de recargar es cerrar la app desde recientes y volver a abrirla.

### I.2 Qué pasa en el móvil cuando se despliega una versión nueva

Cuándo mira Chrome si hay service worker nuevo (descarga `sw.js` y lo compara byte a byte):
1. **Al abrir o recargar la página** (navegación). Medido: 1,8-2,0 s después del `load`, cuando la página deja de
   pedir archivos.
2. **Cuando el código llama a `registration.update()`**. Hoy nunca.
3. Regla de las 24 h: si la última comprobación tiene más de 24 h y el service worker atiende otro evento (una
   petición de archivo, push…). El juego lo carga todo al arrancar, así que en la práctica no ocurre.
4. **No** comprueba al volver a primer plano, ni con `visibilitychange`, ni cada cierto tiempo (medido, S2).

La caché HTTP de 10 min (`max-age=600`) **no retrasa** la detección: Chrome pide `sw.js` saltándose la caché
(cabecera medida en la petición: `Cache-Control: max-age=0`) y Workbox baja el `index.html` nuevo con
`cache: 'reload'` (medido: `no-cache`). Solo afectaría a una visita sin service worker (primera vez o tras borrar
los datos): ahí Chrome podría usar un `index.html` de hasta 10 min.

**Cronología (versión actual, autoUpdate)**

| Momento | Qué pasa | Versión que juega Guillem | Evidencia |
|---|---|---|---|
| Fusión en `main` | CI: build + tests + e2e; la web cambia al acabar `deploy-pages` (minutos) | vieja | `deploy.yml` |
| App abierta o en recientes, vuelve a primer plano | Nada: no hay navegación y el código no llama a `update()` | **vieja, indefinidamente** | S2: 0 peticiones de `sw.js` en 25 s tras ocultar/mostrar, congelar/reanudar |
| App cerrada (desde recientes, por Android o reinicio) y abierta de nuevo | El service worker viejo contesta la apertura desde su caché | **vieja** (primeros segundos) | S1 y S3: la versión al cargar es la vieja |
| ~2 s después de cargar | Chrome descarga `sw.js`, ve que cambió e instala: baja solo lo cambiado (11 archivos, 1,2 MB, ~300 KB gzip) | vieja | S1/S3: `sw.js` a +1,8-2,0 s del `load` |
| Instalada | `skipWaiting` + `clientsClaim`: se activa y toma la página | vieja | `dist/sw.js` |
| Activada | `registerSW` recarga la página **esté donde esté** | nueva | S1: 1 recarga sola; S2: con la partida en marcha (tick 385-453) → recarga → tick 0, menú |
| Total al abrir | Vieja durante 6,7-9 s tras el `load` en la prueba (CPU lenta: la carga sola tarda 6-8 s); estimado en el Pixel 8a: **3-8 s** | | S1, S3 |

**Peor caso:** sin límite mientras la app siga viva en recientes (horas o días: depende de cuándo Android la cierre
por memoria). Al reabrirla, unos segundos de versión vieja y una recarga automática. Si se cierra la app antes de que
termine la instalación, la instalación debería seguir en segundo plano (especificación; no medido) y la siguiente
apertura ya sale nueva; si no hay red, lo reintenta en la siguiente apertura.

### I.3 Causas, por probabilidad

1. **Principal: la app vuelve de recientes sin recargarse** y nadie busca la versión nueva (falta `update()` al volver
   a primer plano y cada cierto tiempo). Guillem prueba, cambia a WhatsApp o al chat, vuelve: sigue en la vieja.
2. **Secundaria: al reabrir, los primeros 3-8 s son de la versión vieja** y la recarga automática llega después. Si
   mira la versión en Configuració o se pone a jugar en esos segundos, ve la vieja; y la recarga le saca de la
   partida (vuelve al menú, se pierde la jugada). Puede parecer un fallo del juego.
3. **Menores:** abrir el enlace antes de que termine el CI y el despliegue (son minutos); propagación de la CDN de
   GitHub Pages tras desplegar (normalmente segundos, no comprobable desde aquí); la caché HTTP de 10 min solo sin
   service worker.

Lo que **no** es causa: la caché HTTP de `sw.js` o de `index.html` cuando el service worker existe (medido), ni el
nombre de las cachés (Workbox limpia las viejas al activarse).

### I.4 Experimento

`tests/e2e/pwaUpdate.spec.ts` (se salta sin `PATINS_PWA=1`; tarda ~3 min porque compila dos veces):
`PATINS_PWA=1 npx playwright test tests/e2e/pwaUpdate.spec.ts` (`PATINS_PWA_REUSE=1` reutiliza las compilaciones).
Compila el juego dos veces (A y B: mismo código, distinto identificador de commit; se lee en
`#version-label` «Versió v0.1.29 (aaaaaaa)» / «(bbbbbbb)»), las sirve en `/hockey-game/` con cabeceras como las de
GitHub Pages (`max-age=600`, ETag, Last-Modified), «despliega» B con una página de A abierta y anota cada petición.
Chromium de Playwright con el perfil del Pixel 8a (horizontal). Resultados en `test-results/pwa-update/timeline.json`.
Dos ejecuciones completas, 4/4 escenarios OK en ambas; rangos = las dos ejecuciones.

| Escenario | Resultado |
|---|---|
| S1 recargar (= reabrir) | Al cargar: **vieja**. `sw.js` pedido 1,8-2,0 s después del `load` con `max-age=0`; `index.html` con `no-cache`; 10 archivos (1,2 MB) + `sw.js`; recarga automática; **nueva 7,7-9,0 s después del `load`** |
| S2 volver a primer plano sin recargar (pestaña delante/detrás, congelar/reanudar, `visibilitychange`) y 20 s jugando | **0 comprobaciones, sigue la vieja.** Con `registration.update()`: `sw.js` pedido a los 10-12 ms, nueva en 7,5 s… **recargando con la partida en marcha** (tick 385-453 → 0, de vuelta al menú) |
| S3 página nueva (abrir la app instalada) | Primer pintado: **vieja**; `sw.js` 1,8-1,9 s después del `load`; nueva 6,7-8,5 s después del `load` |
| S4 app congelada en segundo plano + el enlace abierto en otra pestaña | La pestaña instala la nueva; la app se recarga sola y al reanudarla ya es la nueva (10-12 ms) |

Prototipo de la propuesta P-A (copia del proyecto en una carpeta temporal; no está en el repo; el código está en
I.6): **P1** vuelta de recientes en mitad de partida → comprobación a los 10 ms de volver, versión nueva lista a los
0,6 s, **la partida sigue 5 s sin recargar**, aviso en el menú de pausa, al tocarlo → nueva. **P2** antes del primer
«Jugar» → se aplica sola (una recarga, como hoy). **P3** versión nueva esperando + cerrar y reabrir → **la nueva desde
el primer fotograma, sin recarga**. Hallazgo del prototipo: en modo `prompt`, vite-plugin-pwa **no recarga** al
aceptar si la página no estaba controlada al arrancar (primera visita); el prototipo recarga él mismo en
`controllerchange`.

Límites: Chromium de escritorio con pantalla de móvil y WebGL por software (las cargas tardan 6 s); no es el Pixel.
«Volver de recientes» se emula; que Android no compruebe al reanudar se apoya en la especificación de Service
Workers (solo navegación, `update()` y la regla de 24 h) y en S2.

### I.5 Propuestas (sin aplicar), de mejor a peor

**P-A (recomendada) — modo `prompt` + búsqueda al volver y cada 30 min + aplicar solo en un momento seguro.**
- Qué hace: `registerType: 'prompt'` (sin `skipWaiting`); `registration.update()` al volver a primer plano y cada
  30 min con la app visible; cuando hay versión nueva instalada: si estás en el menú antes del primer «Jugar», se
  aplica sola (una recarga de 1-2 s); si ya jugaste, aparece un aviso en el menú (que es la pantalla de pausa);
  **nunca recarga en mitad de una jugada**. Si no tocas el aviso, la próxima vez que abras la app ya es la nueva
  desde el primer fotograma (P3).
- Pros: arregla la causa principal y la secundaria; no interrumpe partidas (importante en F2 con partidos de
  verdad); Guillem sabe cuándo hay versión nueva.
- Contras: ~50 líneas (módulo nuevo, un aviso en el menú, 2 textos); cambia la decisión del 2026-10-02 en
  DECISIONS.md («autoUpdate… para recibir siempre la última versión al reabrir»); hay que tocar el aviso.
- Riesgo: bajo. Si algo falla, el comportamiento por defecto del navegador sigue: versión nueva al cerrar todas las
  ventanas de la app y reabrir. Test: pasar los escenarios P1-P3 a `pwaUpdate.spec.ts`.
- Textos nuevos (i18n):

  | Clave | ca | es | en |
  |---|---|---|---|
  | `update.available` | Hi ha una versió nova. Toca per actualitzar. | Hay una versión nueva. Toca para actualizar. | A new version is available. Tap to update. |
  | `update.updating` | Actualitzant… | Actualizando… | Updating… |

- Qué vería Guillem: vuelve a la app desde recientes → está en pausa, como siempre → a los pocos segundos aparece
  la franja «Hi ha una versió nova. Toca per actualitzar.» → la toca → «Actualitzant…», 1-2 s en negro → menú con la
  versión nueva en Configuració. Si prefiere seguir jugando, toca «Continuar» y no pasa nada.

**P-B (mínima) — dejar autoUpdate y añadir solo `update()` al volver a primer plano (y cada 30 min en pausa).**
- Pros: ~10 líneas, sin textos ni cambios visibles. Arregla la causa principal.
- Contras: la recarga sigue siendo automática: al volver de recientes estás en pausa, pero si tocas «Continuar» en
  los 3-8 s que tarda la descarga, la página se recarga con la partida en marcha. No arregla la secundaria.
- Riesgo: medio (recargas por sorpresa). Textos: ninguno. Qué vería Guillem: al volver a la app, a veces un
  parpadeo y vuelta al menú unos segundos después.

**P-C — autoUpdate retrasando la recarga (`onNeedReload`) hasta un momento seguro.** No recomendada: el service
worker nuevo ya está activo y ha borrado de su caché los archivos viejos, mientras la página sigue con el código
viejo; si esa página carga entonces un trozo que se baja bajo demanda (el archivo principal tiene 8 `import()`;
en la prueba, 8 de los 11 archivos cambiados eran esos trozos de Babylon —cargadores de texturas y utilidades—,
que cambian de nombre en cada versión), GitHub Pages ya no lo tiene → error de carga.
Riesgo alto para lo que ahorra respecto a P-A.

**P-D (complemento opcional de P-A) — `version.json`.** El build escribe `version.json` con la versión; al volver a la
app se pide con `cache: 'no-store'` y, si es distinta, se llama a `update()` y el aviso dice el número
(«Versió nova v0.1.30…»). Pros: el aviso puede decir qué versión llega. Contras: un archivo y un paso de build más,
y es redundante con `update()`, que ya compara `sw.js`. Texto extra: `update.availableVersion` («Hi ha la versió
{version}. Toca per actualitzar.» / «Hay la versión {version}. Toca para actualizar.» / «Version {version} is
available. Tap to update.»).

### I.6 Parche propuesto para P-A (NO aplicado)

`vite.config.ts`:
```diff
-      registerType: 'autoUpdate',
+      registerType: 'prompt',
@@ workbox
         clientsClaim: true,
-        skipWaiting: true,
```

`src/pwa/updates.ts` (nuevo; es el del prototipo probado):
```ts
import { registerSW } from 'virtual:pwa-register';

/** Background check while the app is visible. Not game feel, so it is not in tuning.ts. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

export interface UpdateHooks {
  /** True when reloading now loses nothing (main menu before the first "Jugar"). */
  canApplyNow: () => boolean;
  /** A new version is installed and waiting: show the banner and call apply() on tap. */
  onReady: (apply: () => void) => void;
}

export function setupUpdates(hooks: UpdateHooks): void {
  if (!('serviceWorker' in navigator)) return;
  let reg: ServiceWorkerRegistration | undefined;
  let ready = false;
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW: (_url, r) => {
      reg = r;
    },
    onNeedRefresh: () => {
      if (ready) return; // workbox-window may report the same waiting worker twice
      ready = true;
      const apply = (): void => {
        // The plugin only reloads when the page was already controlled at start (not on a
        // first visit), so reload ourselves when the new version takes control.
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        void updateSW(true); // SKIP_WAITING → the waiting version activates → controllerchange
      };
      if (hooks.canApplyNow()) apply();
      else hooks.onReady(apply);
    },
  });
  const check = (): void => {
    if (!reg || ready || reg.installing || !navigator.onLine) return;
    reg.update().catch(() => undefined); // offline / server error: try again next time
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, CHECK_EVERY_MS);
}
```

`src/main.ts`: quitar `import { registerSW }` y `registerSW({ immediate: true })`, y después de crear el menú:
```ts
setupUpdates({
  canApplyNow: () => game.paused && !menu.hasStarted,
  onReady: (apply) => menu.showUpdateBanner(apply),
});
```
`src/ui/menu.ts`: `get hasStarted()` (devuelve `started`) y `showUpdateBanner(apply)`: un botón `#update-banner`
con `update.available` al final de `#main-menu`; al tocarlo cambia a `update.updating` y llama a `apply()`.
Más: los 2 textos en `ca/es/en.json`, el estilo de la franja en `styles.css`, entrada en DECISIONS.md, y
`pwaUpdate.spec.ts` con las aserciones de P1-P3 (con el código de hoy, S1-S4 describen el comportamiento viejo).

### I.7 Qué puede hacer Guillem HOY para forzar la versión nueva (Pixel 8a)

Antes: espera al aviso de que el despliegue ha terminado (la v0.1.29 quedó desplegada a las 12:37 UTC = 14:37 en
España). La versión que debes ver te la doy en el informe.

**A. Cerrar y reabrir (lo normal)**
1. Con PATINS abierta, desliza desde el borde inferior hacia arriba y mantén un momento (o toca el botón cuadrado si
   usas los 3 botones): se abren las apps recientes.
2. Busca la tarjeta de PATINS y deslízala hacia arriba para cerrarla.
3. Abre PATINS desde su icono.
4. Quédate en el menú **sin tocar «Jugar»** unos 15 segundos. Si hay versión nueva, la pantalla parpadeará una vez:
   es la versión nueva entrando.
5. Toca «Configuració» y mira la línea de abajo: «Versió v0.1.xx (…)». (También sale en la línea de diagnóstico
   del panel ⚙.)
6. Si aún es la vieja, repite los pasos 1-5 una vez más (la segunda vez entra directamente).

**B. Si sigue la vieja: abrir el enlace en Chrome**
1. Abre Chrome (el navegador, no la app) y entra en https://manrou6.github.io/hockey-game/
2. Espera 15 segundos en el menú (puede parpadear una vez) y comprueba la versión en «Configuració».
3. Cierra la app PATINS desde recientes (pasos A1-A2) y ábrela desde el icono: comparte los datos con Chrome y ya
   debería estar en la nueva.

**C. Último recurso: borrar los datos del juego** (se borran también los valores del panel ⚙ y la configuración)
1. En el juego, abre el panel ⚙ y toca «Copiar valors»; pégalo en el chat para no perderlos.
2. Chrome → menú ⋮ (arriba a la derecha) → «Configuración» → «Configuración de sitios» → «Todos los sitios».
3. Busca «manrou6.github.io» y tócalo.
4. Toca «Borrar y restablecer» (puede llamarse «Eliminar datos y restablecer permisos») y confirma.
5. Con internet, abre PATINS desde el icono: descarga la versión actual. Comprueba la versión en «Configuració».

### I.8 Decisiones pendientes

1. **P-A (recomendada) o P-B (mínima)**: P-A cambia la decisión del 2026-10-02 (autoUpdate) y añade un aviso
   visible; hay que preguntarlo a Guillem antes de aplicarla. P-B es técnica e invisible, pero recarga por sorpresa.
2. Con P-A: ¿aplicar sola antes del primer «Jugar» (propuesto) o mostrar el aviso siempre?
3. ¿Añadir P-D (el aviso dice el número de versión)?
4. ¿Mostrar la versión también en el menú principal, en pequeño, para no tener que entrar en Configuració?
5. ¿Ejecutar `pwaUpdate.spec.ts` en el CI (~3 min más por dos builds) o dejarlo como prueba manual?
