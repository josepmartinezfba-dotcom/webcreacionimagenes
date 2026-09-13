export interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyWorkflow = Record<string, WorkflowNode>;

export interface WorkflowRole {
  nodeTitle: string;
  input?: string;
  type: 'image_filename' | 'string' | 'number' | 'integer' | 'output';
}

export interface WorkflowMap {
  description?: string;
  workflowFile: string;
  roles: Record<string, WorkflowRole>;
  defaults: Record<string, string | number>;
  limits?: Record<string, { min?: number; max?: number; step?: number }>;
}
