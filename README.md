# Expansor de fondos para cartas coleccionables (Pokemon)

Aplicación web **100% local** para expandir la ilustración de una carta
coleccionable en una composición 3x3 usando IA generativa (ComfyUI +
FLUX.1-Fill-dev), sin ningún servicio de pago ni envío de imágenes a
internet.

```
[1] [2] [3]
[4] [ART] [5]      <- [ART] es tu ilustracion original, intacta
[6] [7] [8]
```

## Índice

1. [Qué modelo y workflow usa](#qué-modelo-y-workflow-usa)
2. [Arquitectura del proyecto](#arquitectura-del-proyecto)
3. [Instalación de ComfyUI (Windows)](#instalación-de-comfyui-windows)
4. [Instalación de la aplicación](#instalación-de-la-aplicación)
5. [Uso](#uso)
6. [Comprobar que todo está conectado](#comprobar-que-todo-está-conectado)
7. [Cambiar de modelo o workflow en el futuro](#cambiar-de-modelo-o-workflow-en-el-futuro)
8. [Solución de problemas](#solución-de-problemas)

---

## Qué modelo y workflow usa

- **Modelo:** [FLUX.1-Fill-dev](https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev)
  de Black Forest Labs. Es el modelo abierto especializado en
  inpainting/outpainting con máscara, entrenado específicamente para
  **continuar** una imagen existente (no para generar una nueva desde
  cero), lo que da la mejor continuidad de líneas, perspectiva, iluminación
  y estilo para este caso de uso.
- **Workflow:** `comfyui-workflows/flux_fill_outpaint.json` (formato API de
  ComfyUI). Usa el nodo nativo `InpaintModelConditioning` + `FluxGuidance`,
  el patrón recomendado oficialmente para FLUX Fill.
- **Carga del UNET:** por defecto, cuantizado en **GGUF** (`UnetLoaderGGUF`
  del custom node [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)
  de city96), pensado para GPUs de 8 GB de VRAM. CLIP (`clip_l` + `t5xxl`)
  y VAE se cargan sin cuantizar con los nodos nativos. Ver
  `comfyui-workflows/README.md` para usar en su lugar el checkpoint nativo
  bf16/fp8 si tienes más VRAM.
- **Todo corre localmente** contra `http://127.0.0.1:8188`, la API HTTP que
  expone ComfyUI cuando se ejecuta en tu ordenador.

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

1. Arrastra o selecciona la foto/escaneo de la carta.
2. Dibuja el rectángulo exacto sobre la ilustración (sin marco ni texto).
3. Ajusta ancho/alto de cada panel, y opcionalmente prompt, negative
   prompt, seed, steps, guidance y denoise.
4. Pulsa **Generar expansión**. La barra de progreso muestra el estado
   (subida, cola de ComfyUI, generación, recomposición).
5. Revisa la previsualización completa y la cuadrícula 3x3 (haz clic en
   cualquier panel exterior para ampliarlo).
6. Descarga los paneles individuales, usa **Descargar las 8 imágenes** o
   **Descargar ZIP**.
7. Para variar el resultado: pulsa **Nueva seed** y **Generar expansión**
   de nuevo. Para repetir exactamente el mismo resultado (por ejemplo tras
   cambiar el prompt), deja la seed igual y vuelve a generar.

Los ficheros exportados son siempre:
`01_top_left.png · 02_top.png · 03_top_right.png · 04_left.png ·
05_right.png · 06_bottom_left.png · 07_bottom.png · 08_bottom_right.png ·
preview_3x3.png` (dentro del ZIP).

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
- **Generación muy lenta o error de memoria (CUDA out of memory)**: reduce
  el ancho/alto de panel, reduce `steps`, o cambia a una versión fp8/GGUF
  del modelo (ver sección de instalación).
- **Los paneles no encajan/objetos "duplicados" en el centro**: revisa que
  el rectángulo de recorte cubra exactamente la ilustración y no incluya
  el marco de la carta.

## Privacidad

Todo el procesamiento (subida, composición, generación, recorte) ocurre en
tu máquina, hablando únicamente con `127.0.0.1`. No se usa ninguna API de
pago ni servicio externo de generación de imágenes, ni telemetría.
