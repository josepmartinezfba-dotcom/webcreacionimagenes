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
- Existe una versión **fp8** oficial que reduce el requisito de VRAM a unos
  12 GB manteniendo muy buena calidad.

## Grafo de nodos

```
UNETLoader (FLUX Fill) ─────────────┐
DualCLIPLoader (clip_l + t5xxl) ──┐  │
VAELoader (ae.safetensors) ────┐  │  │
                                │  │  │
LoadImage (lienzo) ──┐          │  │  │
LoadImageMask (mask)─┼─► InpaintModelConditioning ──► KSampler ──► VAEDecode ──► SaveImage
CLIPTextEncode (+) ──┤          ▲  │
CLIPTextEncode (-) ──┴► FluxGuidance
```

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
