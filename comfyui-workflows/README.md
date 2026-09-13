# Workflow de ComfyUI: `flux_fill_outpaint.json`

Este workflow (en formato API de ComfyUI, el mismo que exporta el menú
"Save (API Format)") realiza el **outpainting** del lienzo expandido usando
**FLUX.1-Fill-dev**, el modelo oficial de Black Forest Labs pensado
específicamente para inpainting/outpainting con máscara.

## Por qué FLUX.1-Fill-dev

- Es un modelo *fill* nativo (no un checkpoint genérico con un sampler de
  inpaint improvisado): entiende la máscara como parte del condicionamiento
  (`InpaintModelConditioning`) y ha sido entrenado para continuar la imagen
  existente en vez de "inventar" un cuadro nuevo.
- Da una continuidad de líneas, perspectiva, iluminación y estilo muy
  superior a SD1.5/SDXL + ControlNet-inpaint en la mayoría de ilustraciones,
  que es exactamente la prioridad de este proyecto.
- Corre completamente local, con pesos abiertos descargables, sin cuota ni
  API de pago.
- Existe una versión **fp8** oficial (~12 GB VRAM) y versiones **GGUF**
  cuantizadas de la comunidad (city96) que bajan el requisito hasta 6-8 GB
  VRAM manteniendo una calidad muy razonable.

## Carga del modelo: GGUF (por defecto) vs. checkpoint nativo

Por defecto este workflow carga el UNET con el nodo `UnetLoaderGGUF` del
custom node **[ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)**
(city96), apuntando a un checkpoint cuantizado
(`flux1-fill-dev-Q4_K_S.gguf` u otra variante Q4/Q5/Q8 que coloques en
`ComfyUI/models/diffusion_models/` o `ComfyUI/models/unet/`). Es la opción
pensada para GPUs de 8 GB de VRAM (por ejemplo, portátiles con RTX 4070
Laptop).

Si tu GPU tiene 16-24 GB de VRAM y prefieres el checkpoint bf16/fp8
oficial sin cuantizar, sustituye el nodo `UnetLoaderGGUF` por el nativo
`UNETLoader` (input `unet_name` + `weight_dtype: "default"`), apuntando a
`flux1-fill-dev.safetensors` en `ComfyUI/models/unet/`. El resto del grafo
(CLIP, VAE, conditioning, sampler) no cambia: ambos nodos devuelven un
`MODEL` compatible con `KSampler`.

## Grafo de nodos

```
UnetLoaderGGUF (FLUX Fill Q4_K_S) ───┐
DualCLIPLoader (clip_l + t5xxl) ───┐  │
VAELoader (ae.safetensors) ─────┐  │  │
                                 │  │  │
LoadImage (lienzo) ──┐           │  │  │
LoadImageMask (mask)─┼─► InpaintModelConditioning ──► KSampler ──► VAEDecode ──► SaveImage
CLIPTextEncode (+) ──┤           ▲  │
CLIPTextEncode (-) ──┴► FluxGuidance
```

## Convención de la máscara (`LoadImageMask` + `InpaintModelConditioning`)

Verificada contra el código fuente de ComfyUI (`InpaintModelConditioning.encode()`):

- **Blanco (valor 1.0)** = zona que FLUX debe **generar** (todo el lienzo
  salvo el recorte del artwork).
- **Negro (valor 0.0)** = zona que se **conserva** como contexto real (el
  recorte del artwork, colocado como semilla en el centro del lienzo).

`InpaintModelConditioning` redondea la máscara a 0/1 y, antes de
codificarla con el VAE, sustituye por gris neutro (0.5) todos los píxeles
marcados como "generar". Esto tiene una consecuencia importante para el
diseño de `canvas.png`: **el color de fondo que pintemos fuera del artwork
no influye en el resultado**, porque ComfyUI lo descarta de todas formas.
Por eso el lienzo se rellena con gris neutro (antes se usaba el color
dominante del artwork, que no tenía ningún efecto real y solo dificultaba
depurar la imagen visualmente).

El borde del rectángulo protegido se difumina unos pocos píxeles
(`createMaskBuffer(..., featherPx)`) antes de enviarlo a ComfyUI. Esto no
cambia el límite "duro" que ve `InpaintModelConditioning` (que redondea a
0/1 en torno al 50% del degradado), pero sí suaviza el `noise_mask` que usa
el sampler para mezclar el latente conocido con el generado durante el
denoising — reduce la costura justo en el borde del artwork sin agrandar
la zona realmente protegida.

## Por qué el resultado puede salir como una textura plana/marrón

Si el recorte del artwork es muy pequeño en relación con el lienzo 3x3
completo, FLUX tiene que extrapolar una superficie enorme a partir de muy
poco contexto real en una sola pasada — un modo de fallo conocido de los
modelos de outpainting, que ante una extrapolación extrema tienden a
"rendirse" y producir un relleno de baja frecuencia (plano/uniforme) en
vez de continuar el detalle. La aplicación mitiga esto calculando el
tamaño de panel a partir de la carta completa (no de un ancho/alto
arbitrario) y maximizando el tamaño del recorte del artwork dentro de esa
celda central (ver `README.md` del proyecto, sección "Geometría de la
composición"); si aun así el resultado sale plano, recorta el artwork lo
más grande posible o prueba con calidad "Baja" primero.

## Prompt por defecto

Los prompts por defecto (en `workflow_map.json` y en los nodos
`CLIPTextEncode` de este JSON) están escritos en inglés a propósito — los
codificadores de texto de FLUX (CLIP-L y T5-XXL) siguen instrucciones de
forma más fiable en inglés — y están pensados para **continuar
exactamente la escena visible**, no para generar contenido nuevo:

- **Positivo**: pide una continuación sin costuras del mismo estilo,
  paleta, iluminación y perspectiva, extendiendo árboles/cielo/terreno/
  agua/edificios "más allá del marco", y pide explícitamente "no new
  characters, no text".
- **Negativo**: excluye specíficamente marcos de carta, texto, logos,
  marcas de agua, collages/rejillas, personajes duplicados y rellenos
  planos/uniformes — los artefactos más comunes al hacer outpainting de
  una carta coleccionable.

Si el usuario escribe su propio prompt/negative prompt en la interfaz,
sustituye por completo al valor por defecto correspondiente (ver
`buildPrompt` en `src/lib/workflow/loader.ts`); dejarlos vacíos no es un
problema, porque el comportamiento por defecto ya está orientado a
continuar el escenario existente.

## Capa de abstracción (`workflow_map.json`)

La aplicación **nunca** escribe directamente `workflow["10"].inputs.seed`.
En su lugar:

1. Carga `flux_fill_outpaint.json`.
2. Busca en cada nodo su `_meta.title`.
3. Usa `workflow_map.json` para saber **qué título de nodo** corresponde a
   cada parámetro lógico (`seed`, `steps`, `denoise`, `guidance`,
   `positivePrompt`, `negativePrompt`, `inputImage`, `maskImage`,
   `outputNode`).

Esto permite sustituir el workflow por otro (otro modelo, otro sampler,
otro nodo de inpaint) sin tocar el código de la aplicación: basta con que
los nodos relevantes conserven esos títulos, o con actualizar
`workflow_map.json` para apuntar a los títulos nuevos.

## Cambiar de modelo/workflow en el futuro

1. Diseña y prueba tu nuevo workflow en la interfaz web de ComfyUI.
2. Expórtalo como API JSON (menú del desarrollador → "Save (API Format)")
   y guárdalo en esta carpeta.
3. Actualiza `workflowFile` y, si cambian los títulos de los nodos, los
   campos `nodeTitle` en `workflow_map.json`.
4. No hace falta tocar ningún archivo de `src/`.
