# Expansor de fondos para cartas coleccionables (Pokemon)

Aplicación web **100% local** para expandir la ilustración de una carta
coleccionable en una composición 3x3 usando IA generativa (ComfyUI +
FLUX.1-Fill-dev), sin ningún servicio de pago ni envío de imágenes a
internet.

```
[1]     [2]     [3]
[4]  [CARTA]     [5]     <- la carta completa, intacta, no solo el artwork
[6]     [7]     [8]
```

Cada una de las 9 celdas (las 8 generadas + la carta central) mide
**exactamente lo mismo, con la misma relación de aspecto que tu carta**.
Si tu carta es vertical, el resultado es vertical; si es horizontal, es
horizontal. Ver [Geometría de la composición](#geometría-de-la-composición).

## Índice

1. [Qué modelo y workflow usa](#qué-modelo-y-workflow-usa)
2. [Geometría de la composición](#geometría-de-la-composición)
3. [Arquitectura del proyecto](#arquitectura-del-proyecto)
4. [Instalación de ComfyUI (Windows)](#instalación-de-comfyui-windows)
5. [Instalación de la aplicación](#instalación-de-la-aplicación)
6. [Uso](#uso)
7. [Comprobar que todo está conectado](#comprobar-que-todo-está-conectado)
8. [Cambiar de modelo o workflow en el futuro](#cambiar-de-modelo-o-workflow-en-el-futuro)
9. [Solución de problemas](#solución-de-problemas)

---

## Qué modelo y workflow usa

- **Modelo:** [FLUX.1-Fill-dev](https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev)
  de Black Forest Labs. Es el modelo abierto especializado en
  inpainting/outpainting con máscara, entrenado específicamente para
  **continuar** una imagen existente (no para generar una nueva desde
  cero), lo que da la mejor continuidad de líneas, perspectiva, iluminación
  y estilo para este caso de uso.
- **Workflow:** `comfyui-workflows/flux_fill_outpaint.json` (formato API de
  ComfyUI). Replica línea por línea la parte de sampling/inpainting de la
  plantilla oficial actual de ComfyUI (`flux_fill_outpaint_example`):
  `InpaintModelConditioning` con `noise_mask: false` + `DifferentialDiffusion`
  aplicado al modelo antes del `KSampler` (20 steps, cfg 1, euler, normal,
  denoise 1) + `FluxGuidance` a 30. Ver el detalle y por qué en
  `comfyui-workflows/README.md`.
- **Carga del UNET:** por defecto, cuantizado en **GGUF** (`UnetLoaderGGUF`
  del custom node [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)
  de city96), pensado para GPUs de 8 GB de VRAM. CLIP (`clip_l` + `t5xxl`)
  y VAE se cargan sin cuantizar con los nodos nativos. Ver
  `comfyui-workflows/README.md` para usar en su lugar el checkpoint nativo
  bf16/fp8 si tienes más VRAM.
- **Todo corre localmente** contra `http://127.0.0.1:8188`, la API HTTP que
  expone ComfyUI cuando se ejecuta en tu ordenador.

## Geometría de la composición

El tamaño de panel **no se introduce a mano**: se calcula automáticamente a
partir del tamaño real de la carta que subes (no del recorte del artwork),
para que las 9 celdas sean siempre exactamente iguales entre sí y tengan la
misma relación de aspecto que la carta.

Ejemplo con una carta vertical de 734×1024 px (relación ≈ 0.717) y calidad
"Normal":

- cada panel (las 8 imágenes generadas + la carta central): **320×448 px**
- lienzo completo enviado a ComfyUI: **960×1344 px** (3×320 × 3×448)
- ningún panel es cuadrado salvo que la carta original lo sea

La calidad elegida en la interfaz (Baja/Normal/Alta) solo cambia el
tamaño objetivo del lado más largo del panel (320/448/576 px antes de
redondear a múltiplos de 16); la proporción siempre sale de la carta.
Se generan resoluciones moderadas a propósito: como la composición 3x3 se
genera en **una sola pasada** (no 8 llamadas independientes), el lienzo
real que procesa FLUX ya mide 9 veces el área de un panel, y una GPU de
8 GB con el modelo GGUF Q4_K_S tiene margen limitado para resoluciones muy
grandes (la cuantización GGUF reduce el peso del modelo en VRAM, pero no
la memoria que consume el cálculo al generar una imagen grande). Si tu GPU
aguanta más, "Alta" da más detalle a costa de velocidad y VRAM.

**Exportar al tamaño original de la carta** (activado por defecto): la
generación siempre ocurre a la resolución reducida de arriba, pero antes
de exportar puedes reescalar por código (Lanczos, en CPU, sin volver a
pasar por FLUX) las 8 imágenes y la preview al tamaño real de la carta que
subiste. El eje más largo coincide exactamente con el de tu carta; el eje
corto puede quedar 1-2 px por debajo debido al redondeo a múltiplos de 16
usado durante la generación — nunca se deforma la imagen para forzar el
tamaño exacto (nada de `fit: "fill"` a ciegas). Esto no añade detalle real
(la IA generó a la resolución reducida), solo cambia el tamaño de archivo
para que encaje con el de tu carta original.

Separación de conceptos en el código (`src/lib/image/canvas.ts`):

- **`originalCard`**: la carta completa tal cual la subiste. Se ajusta sin
  deformar dentro de la celda central (mismo `fit: "contain"` que el
  artwork, nunca `fit: "fill"` — así el redondeo a múltiplos de 16 nunca
  estira la carta, aunque deje como mucho 1-2 px de margen dentro de la
  celda) y se reinserta intacta **después** de generar.
- **`artworkCrop`**: el rectángulo que marcas a mano sobre la ilustración.
  Es la única referencia visual que ve FLUX para continuar el escenario
  (líneas, colores, perspectiva); no incluye el marco ni el texto de la
  carta.
- **`generatedExpansion`**: lo que devuelve ComfyUI a partir del lienzo +
  máscara.
- **`final3x3`**: `generatedExpansion` con la carta completa
  (`originalCard`) vuelta a pegar exactamente en la celda central, y de ahí
  se recortan matemáticamente las 8 imágenes exteriores (opcionalmente
  reescaladas al tamaño original antes del recorte, ver arriba).

## Arquitectura del proyecto

```
src/
  app/                    Frontend (Next.js/React/TypeScript) + API routes
    api/comfyui/status     Comprobación de conexión con ComfyUI
    api/comfyui/generate   Inicia un trabajo de expansión
    api/comfyui/progress   Consulta el progreso de un trabajo
    api/comfyui/result     Descarga preview / paneles / zip
  components/             UI: dropzone, crop, controles, progreso, grid 3x3
  lib/
    comfyui/client.ts      Cliente HTTP puro de la API de ComfyUI
    workflow/loader.ts      Capa de abstracción: aplica parámetros al
                             workflow JSON por título de nodo (sin IDs
                             hardcodeados)
    image/                  Composición de lienzo, máscara, split en 8
                             paneles y zip (todo por código, sin IA)
    pipeline.ts             Orquesta: imagen -> ComfyUI -> recomposición
comfyui-workflows/
  flux_fill_outpaint.json   Workflow de ComfyUI (formato API)
  workflow_map.json         Mapa de roles -> nodos (para poder cambiar de
                             modelo/workflow sin tocar el código)
```

La separación es intencional: `lib/comfyui` no sabe nada de cartas ni de
paneles; `lib/image` no sabe nada de ComfyUI; `lib/workflow` es la única
pieza que traduce entre "parámetros de la app" y "nodos concretos del
grafo". Para cambiar de modelo o de workflow en el futuro, ver la sección
correspondiente más abajo.

## Instalación de ComfyUI (Windows)

### 1. Instalar ComfyUI

Opción más sencilla: descarga el **paquete portable para Windows** desde la
página oficial de releases de ComfyUI:
<https://github.com/comfyanonymous/ComfyUI/releases>
(busca el archivo `ComfyUI_windows_portable_nvidia.7z` o similar).

1. Descomprímelo, por ejemplo en `C:\ComfyUI_windows_portable`.
2. Dentro encontrarás una carpeta `ComfyUI` — esa es la instalación real.

> Alternativa avanzada: `git clone https://github.com/comfyanonymous/ComfyUI`
> y crear un entorno virtual de Python con `pip install -r requirements.txt`
> (requiere Python 3.10+ y PyTorch con soporte CUDA instalado manualmente).

### 2. Descargar el modelo FLUX.1-Fill-dev

El workflow incluido usa por defecto una versión **GGUF cuantizada** del
UNET (pensada para GPUs de 8 GB de VRAM, como una RTX 4070 Laptop), más
CLIP y VAE sin cuantizar:

| Archivo | Carpeta destino | Origen |
|---|---|---|
| `flux1-fill-dev-Q4_K_S.gguf` (o Q4_K_M/Q5_K_S si tu GPU tiene algo más de VRAM) | `ComfyUI\models\diffusion_models\` (o `\unet\`) | https://huggingface.co/city96/FLUX.1-Fill-dev-gguf |
| `clip_l.safetensors` | `ComfyUI\models\clip\` | https://huggingface.co/comfyanonymous/flux_text_encoders |
| `t5xxl_fp8_e4m3fn.safetensors` | `ComfyUI\models\clip\` | https://huggingface.co/comfyanonymous/flux_text_encoders |
| `ae.safetensors` (VAE de FLUX) | `ComfyUI\models\vae\` | https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev |

**Notas sobre VRAM:**
- **8 GB de VRAM** (p.ej. RTX 4070 Laptop): usa el GGUF `Q4_K_S` como en la
  tabla — es la configuración por defecto del proyecto.
- **12-16 GB de VRAM**: puedes usar un GGUF menos agresivo (`Q5_K_S`/`Q8_0`)
  o el checkpoint **fp8** oficial con el nodo nativo `UNETLoader`.
- **24 GB de VRAM**: usa `flux1-fill-dev.safetensors` (bf16) con
  `UNETLoader` directamente, sin cuantizar.

Para cambiar entre variantes GGUF (por ejemplo pasar de `Q4_K_S` a
`Q5_K_S`), basta con editar `comfyui-workflows/flux_fill_outpaint.json` y
ajustar el nombre de archivo en el input `unet_name` del nodo
`UNET Loader GGUF (Modelo FLUX Fill Q4_K_S)`. Para volver al checkpoint
nativo sin cuantizar, sustituye ese nodo por `UNETLoader`
(`unet_name` + `weight_dtype: "default"`) apuntando a
`flux1-fill-dev.safetensors`; el resto del grafo no cambia (ver detalles
en `comfyui-workflows/README.md`).

### 3. Custom nodes necesarios

Con una instalación reciente de ComfyUI (2024 en adelante), la mayoría de
nodos usados por el workflow son nativos: `DualCLIPLoader`, `VAELoader`,
`LoadImage`, `LoadImageMask`, `CLIPTextEncode`, `FluxGuidance`,
`InpaintModelConditioning`, `KSampler`, `VAEDecode`, `SaveImage`.

La carga del UNET en formato **GGUF** (la configuración por defecto de
este proyecto) sí requiere un custom node:
- [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) (de city96) —
  instálalo desde el "ComfyUI Manager" o clonándolo en
  `ComfyUI\custom_nodes\`. Aporta el nodo `UnetLoaderGGUF` que usa el
  workflow.

Si en su lugar usas el checkpoint nativo sin cuantizar (`UNETLoader`), no
necesitas ningún custom node adicional.

Si tu versión de ComfyUI es antigua y no reconoce `InpaintModelConditioning`
o `FluxGuidance`, actualízala (en el portable: ejecuta
`update\update_comfyui.bat`).

### 4. Iniciar ComfyUI

- Con el paquete portable: ejecuta `run_nvidia_gpu.bat` dentro de
  `ComfyUI_windows_portable`.
- O usa el script `start-comfyui.bat` incluido en este proyecto (edita la
  variable `COMFYUI_DIR` al principio del archivo para que apunte a tu
  carpeta `ComfyUI`).

Deberías ver en la consola algo como:
`Starting server` ... `To see the GUI go to: http://127.0.0.1:8188`

Déjalo abierto: es el backend de generación que usará la app.

## Instalación de la aplicación

Requisitos: [Node.js LTS](https://nodejs.org/) (18 o superior).

1. Ejecuta **`setup.bat`** (doble clic). Instala las dependencias de Node
   (`npm install`).
2. Ejecuta **`start-app.bat`**. La primera vez compila la aplicación
   (`npm run build`) y luego la arranca en `http://localhost:3000`.
3. Abre `http://localhost:3000` en tu navegador.

(En Mac/Linux, o si prefieres la terminal: `npm install`, luego
`npm run build && npm run start`, o `npm run dev` para modo desarrollo.)

## Uso

1. Arrastra o selecciona la foto/escaneo de la carta **completa**.
2. Dibuja el rectángulo sobre el **artwork/ilustración** (sin marco ni
   texto): es la referencia visual que usará la IA, no lo que aparecerá en
   el centro del resultado (el centro será la carta completa que subiste).
3. Elige la calidad (Baja/Normal/Alta) — el tamaño exacto de cada imagen se
   calcula solo y se muestra en pantalla —, si quieres **exportar al
   tamaño original de la carta** (activado por defecto), y opcionalmente
   prompt, negative prompt, seed, steps, guidance y denoise.
4. Pulsa **Generar expansión**. La barra de progreso muestra el estado
   (subida, cola de ComfyUI, generación, recomposición).
5. Revisa la previsualización completa y la cuadrícula 3x3 (haz clic en
   cualquier panel exterior para ampliarlo; el centro es tu carta original).
6. Descarga los paneles individuales, usa **Descargar las 8 imágenes** o
   **Descargar ZIP**.
7. Para variar el resultado: pulsa **Nueva seed** y **Generar expansión**
   de nuevo. Para repetir exactamente el mismo resultado (por ejemplo tras
   cambiar el prompt), deja la seed igual y vuelve a generar.

Los ficheros exportados son siempre:
`01_top_left.png · 02_top.png · 03_top_right.png · 04_left.png ·
05_right.png · 06_bottom_left.png · 07_bottom.png · 08_bottom_right.png ·
preview_3x3.png` (dentro del ZIP).

## Pruebas automatizadas

`npm test` ejecuta `tests/geometry.test.ts` (Node's test runner vía `tsx`,
sin necesidad de ComfyUI): construye cartas sintéticas con `sharp` y
comprueba matemáticamente la parte del pipeline que no depende de IA —
que el lienzo mide siempre 3×panel, que los 8 PNG exportados miden
exactamente panelWidth×panelHeight, que la celda central del resultado es
la carta completa sin deformar (no el recorte del artwork) dentro de una
tolerancia de redondeo explícita (no se afirma una identidad binaria con
el archivo original, que sería falsa en cuanto hay cualquier reescalado),
que la relación de aspecto sigue la de la carta (y solo es 1:1 si la carta
es cuadrada) en orientación vertical y horizontal, que el degradado
cuadrático de la máscara nunca alcanza el centro del artwork por pequeño
que sea, que `computeExportPanelSize`/`upscaleFinal3x3ToOriginalSize`
reescalan al tamaño original sin deformar de más, y que el propio JSON del
workflow tiene `DifferentialDiffusion` conectado antes del `KSampler` con
`noise_mask: false` en `InpaintModelConditioning`.

## Comprobar que todo está conectado

En la parte superior de la app hay un indicador de **Conexión con
ComfyUI**:
- Punto verde + "Conectado" → todo correcto.
- Punto rojo → revisa que `start-comfyui.bat` (o tu forma habitual de
  arrancar ComfyUI) siga en marcha, y que la URL mostrada sea
  `http://127.0.0.1:8188` (o la que corresponda si cambiaste el puerto).
- Si aparece "Faltan modelos: ..." significa que ComfyUI está activo pero
  no encuentra alguno de los archivos de modelo — revisa la tabla de la
  sección de instalación y las carpetas `ComfyUI\models\diffusion_models`
  (o `\unet`), `\clip`, `\vae`. Si el que falta es el `.gguf`, confirma
  también que el custom node `ComfyUI-GGUF` está instalado (si no lo está,
  ComfyUI no expondrá el nodo `UnetLoaderGGUF` y el workflow fallará al
  encolarse).

También puedes pulsar el botón **Comprobar conexión** en cualquier
momento.

## Cambiar de modelo o workflow en el futuro

1. Diseña el nuevo workflow en la interfaz de ComfyUI y expórtalo como
   "Save (API Format)".
2. Guarda el JSON en `comfyui-workflows/`.
3. Actualiza `comfyui-workflows/workflow_map.json`: cambia `workflowFile`
   al nuevo archivo, y si los títulos de los nodos cambian, actualiza los
   campos `nodeTitle` de cada rol (`inputImage`, `maskImage`,
   `positivePrompt`, `negativePrompt`, `seed`, `steps`, `guidance`,
   `denoise`, `outputNode`).
4. No hace falta modificar nada en `src/`: la app lee siempre el workflow
   activo a través de esta capa de abstracción.

## Solución de problemas

- **"No se pudo conectar con ComfyUI"**: confirma que ComfyUI está
  arrancado y escuchando en `127.0.0.1:8188` (mira la consola donde lo
  lanzaste). Si usas otro puerto/host, cámbialo en el campo de conexión de
  la app.
- **"ComfyUI rechazo el workflow"**: normalmente falta un archivo de
  modelo o un custom node. El mensaje de error de ComfyUI se muestra tal
  cual para que puedas identificar el nodo problemático.
- **Costuras visibles entre el artwork y el fondo generado**: prueba a
  subir el `denoise` a 1.0 y a describir el escenario en el prompt (por
  ejemplo: "bosque frondoso, cielo nublado, montañas al fondo") para guiar
  mejor la continuidad.
- **El fondo generado sale como una textura plana/marrón uniforme, sin
  árboles/cielo/detalle**: casi siempre es porque el recorte del artwork es
  muy pequeño en relación con el lienzo completo (FLUX tiene muy poco
  contexto real del que extrapolar). Recorta el artwork lo más grande
  posible dentro de la carta, y si sigue pasando, usa calidad "Baja" para
  iterar rápido: al reducir la resolución total, el recorte ocupa una
  fracción mayor del lienzo y FLUX tiene más contexto relativo del que
  partir.
- **Generación muy lenta o error de memoria (CUDA out of memory)**: baja la
  calidad a "Baja"/"Normal", reduce `steps`, o usa una variante GGUF más
  agresiva (ver sección de instalación).
- **Los paneles no encajan/objetos "duplicados" en el centro**: revisa que
  el rectángulo de recorte cubra exactamente la ilustración y no incluya
  el marco de la carta.
- **El centro del resultado muestra el recorte del artwork en vez de la
  carta completa**: no debería ocurrir (la carta completa se reinserta por
  código sobre la celda central tras generar, ver
  [Geometría de la composición](#geometría-de-la-composición)); si lo ves,
  es un bug — revisa que estés en una versión del proyecto posterior a este
  cambio.

## Privacidad

Todo el procesamiento (subida, composición, generación, recorte) ocurre en
tu máquina, hablando únicamente con `127.0.0.1`. No se usa ninguna API de
pago ni servicio externo de generación de imágenes, ni telemetría.
