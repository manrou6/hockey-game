# 04 — Arte y audio

## Dirección visual
- Semi-realista "retransmisión de TV": iluminación de pabellón cálida, pista de parquet o pintada (azul/gris) con reflejos sutiles, vallas blancas con publicidad inventada, grada con público.
- Materiales PBR (Babylon PBRMaterial), una HDRI de interior para iluminación ambiental, sombras de una luz principal.
- Prioridad de calidad visual: 1) jugadores y animación, 2) pista y bola, 3) porterías y vallas, 4) pabellón, 5) público.
- Nada de estética cartoon. Proporciones humanas reales, colores de equipación saturados para leer bien a los equipos desde la cámara lejana.

## Jugadores
- Modelo humanoide base riggeado (CC0) + equipamiento modelado/añadido por código: rodilleras, espinilleras, guantes, stick, patines de 4 ruedas (quad). Porteros: casco con rejilla, peto, protecciones de piernas grandes, guantes.
- Equipaciones: camiseta, pantalón, medias con 2 colores del equipo, dorsal y nombre generados como textura.
- Variedad: 4-6 caras/peinados/tonos de piel combinables.
- Animación: el patinaje es procedural (zancada lateral, deslizamiento, cruce de piernas en curva, frenada) sobre el esqueleto, mezclado con animaciones de tren superior (conducir, pase, tiro, regate, celebración). Animaciones de librería (si se usan) deben tener licencia de uso en juegos.
- LOD: 2-3 niveles según distancia a cámara.

## Pabellón y ambiente
- Pabellón modular: grada a 3-4 lados, techo con focos, marcador electrónico, banquillos, mesa de anotadores.
- Público: impostores (sprites/billboards animados) en grada, nunca modelos 3D completos.
- 3 pabellones: modesto, mediano, gran pabellón (final de copa).

## Interfaz
- Marcador estilo TV compacto arriba (equipos con abreviatura de 3 letras, resultado, reloj, faltas de equipo como puntos, sancionados con cuenta atrás).
- Menús limpios, tipografía deportiva, transiciones rápidas, todo navegable con un pulgar.
- Escudos y nombres de equipo inventados, generados vectorialmente.

## Fuentes de assets permitidas (registrar cada uno en CREDITS.md)
- Modelos 3D: Quaternius, Kenney, Poly Pizza (filtrar CC0), Sketchfab solo con licencia CC0 o CC-BY verificada.
- Texturas y HDRI: Poly Haven (CC0), ambientCG (CC0).
- Sonido: Freesound solo CC0 (comprobar licencia de cada archivo), Kenney audio (CC0), y síntesis por código.
- Si un asset requiere iniciar sesión para descargarlo, Claude Code da a Guillem pasos exactos para descargarlo y subirlo al repo.
- Prohibido: marcas, escudos, camisetas o patrocinadores reales; música con copyright.

## Audio
- Ambiente: público (murmullo, ovación, pitos, cánticos genéricos), eco de pabellón.
- Juego: ruedas sobre pista (varía con velocidad), golpe de stick, impacto de bola en valla/poste/protecciones, frenada, silbato (generado por código), sirena de final de parte.
- Mezcla dinámica: el público sube en ataques peligrosos y explota con gol.
- Música solo en menús (CC0 o generada).

## Presupuestos de rendimiento (Pixel 8a, 60 fps)
- Triángulos visibles en partido: ≤ 200k. Draw calls: ≤ 120.
- Texturas comprimidas KTX2 (Basis), máximo 1024 px en jugadores, atlas cuando sea posible.
- 1 luz con sombras (cascada única), resto horneado o ambiental.
- Escalado de resolución dinámico si baja de 55 fps. Preset de calidad: Bajo / Medio / Alto, autodetectado.
- Peso de descarga inicial ≤ 25 MB; resto en carga diferida y caché (service worker).
