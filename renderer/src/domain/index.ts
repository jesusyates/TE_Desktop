/**
 * D-7-4T：AICS 本地 Domain 收口入口（类型 + mappers；不替代 DTO / VM）。
 */

export type { TaskDomainModel, TaskDomainSource } from "./models/taskDomainModel";
export type { ResultDomainModel, ResultDomainKind } from "./models/resultDomainModel";
export type { TemplateDomainModel, TemplateDomainSource } from "./models/templateDomainModel";
export type { MemorySignalDomainModel, MemorySignalDomainType } from "./models/memorySignalDomainModel";
export type { AuditEventDomainModel } from "./models/auditEventDomainModel";

export { executionTaskToDomainModel } from "./mappers/executionTaskMapper";
export { taskResultToDomainModel } from "./mappers/taskResultMapper";
export { templateListLikeToDomainModel, templateStoredToDomainModel } from "./mappers/templateMapper";
export type { TemplateListLike } from "./mappers/templateMapper";
export { userBehaviorMemoryToSignalDomain } from "./mappers/userBehaviorMemoryMapper";
export {
  coreAuditRecordToDomainModel,
  postCoreAuditInputToDomainModel
} from "./mappers/auditEventMapper";
