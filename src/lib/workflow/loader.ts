import { readFile } from 'fs/promises';
import path from 'path';
import type { ComfyWorkflow, WorkflowMap } from './types';

const WORKFLOWS_DIR = path.join(process.cwd(), 'comfyui-workflows');
const MAP_FILE = 'workflow_map.json';

let cache: { workflow: ComfyWorkflow; map: WorkflowMap } | null = null;

/**
 * Carga el workflow activo de ComfyUI junto con su mapa de roles.
 * Los resultados se cachean en memoria: para recargar tras editar los
 * archivos JSON basta con reiniciar `npm run dev` / `npm start`.
 */
export async function loadWorkflowMap(): Promise<{ workflow: ComfyWorkflow; map: WorkflowMap }> {
  if (cache) return cache;

  const map: WorkflowMap = JSON.parse(await readFile(path.join(WORKFLOWS_DIR, MAP_FILE), 'utf-8'));
  const workflow: ComfyWorkflow = JSON.parse(
    await readFile(path.join(WORKFLOWS_DIR, map.workflowFile), 'utf-8')
  );

  cache = { workflow, map };
  return cache;
}

function findNodeIdByTitle(workflow: ComfyWorkflow, title: string): string {
  const entry = Object.entries(workflow).find(([, node]) => node._meta?.title === title);
  if (!entry) {
    throw new Error(
      `No se encontro ningun nodo con el titulo "${title}" en el workflow. Revisa comfyui-workflows/workflow_map.json`
    );
  }
  return entry[0];
}

export interface OutpaintParams {
  inputImageFilename: string;
  maskImageFilename: string;
  positivePrompt?: string;
  negativePrompt?: string;
  seed: number;
  steps: number;
  guidance: number;
  denoise: number;
}

/**
 * Construye una copia del workflow con los parametros del usuario
 * aplicados, resolviendo cada rol a traves de workflow_map.json en vez de
 * IDs de nodo fijos en el codigo.
 */
export function buildPrompt(
  workflow: ComfyWorkflow,
  map: WorkflowMap,
  params: OutpaintParams
): { prompt: ComfyWorkflow; outputNodeId: string } {
  const clone: ComfyWorkflow = JSON.parse(JSON.stringify(workflow));

  const setRole = (roleKey: string, value: unknown) => {
    const role = map.roles[roleKey];
    if (!role) throw new Error(`Rol "${roleKey}" no definido en workflow_map.json`);
    const nodeId = findNodeIdByTitle(clone, role.nodeTitle);
    if (!role.input) return nodeId;
    clone[nodeId].inputs[role.input] = value;
    return nodeId;
  };

  setRole('inputImage', params.inputImageFilename);
  setRole('maskImage', params.maskImageFilename);
  setRole('positivePrompt', params.positivePrompt || map.defaults.positivePrompt);
  setRole('negativePrompt', params.negativePrompt || map.defaults.negativePrompt);
  setRole('seed', params.seed);
  setRole('steps', params.steps);
  setRole('guidance', params.guidance);
  setRole('denoise', params.denoise);

  const outputRole = map.roles.outputNode;
  const outputNodeId = findNodeIdByTitle(clone, outputRole.nodeTitle);

  return { prompt: clone, outputNodeId };
}
