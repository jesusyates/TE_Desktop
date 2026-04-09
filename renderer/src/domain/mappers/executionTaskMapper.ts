/**
 * D-7-4T：ExecutionTask → TaskDomainModel
 */

import type { ExecutionTask } from "../../execution/execution.types";
import type { TaskDomainModel, TaskDomainSource } from "../models/taskDomainModel";

function inferTaskDomainSource(task: ExecutionTask): TaskDomainSource {
  if (task.input?.templateId?.trim()) return "template";
  if (task.sourceTaskId?.trim()) return "history";
  return "workbench";
}

export function executionTaskToDomainModel(task: ExecutionTask): TaskDomainModel {
  return {
    id: task.id,
    prompt: task.prompt,
    status: task.status,
    source: inferTaskDomainSource(task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    mode: task.input?.resolvedMode,
    sourceTemplateId: task.input?.templateId?.trim() || undefined
  };
}
