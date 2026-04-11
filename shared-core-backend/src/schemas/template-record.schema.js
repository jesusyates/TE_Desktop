/**
 * Template API 最小归一化（与 domain template 行映射）。
 */

function normalizeTemplateRecord(row) {
  if (!row || typeof row !== "object") return null;
  const templateId = row.templateId != null ? String(row.templateId) : row.id != null ? String(row.id) : "";
  const description =
    row.description != null
      ? String(row.description).slice(0, 2000)
      : row.title != null
        ? String(row.title).slice(0, 2000)
        : "";
  let promptStructure = row.promptStructure;
  if (promptStructure == null && row.body != null) {
    promptStructure =
      typeof row.body === "object" && !Array.isArray(row.body)
        ? row.body
        : { text: String(row.body).slice(0, 32000) };
  }
  if (promptStructure == null || typeof promptStructure !== "object") {
    promptStructure = {};
  }
  const createdAt =
    row.createdAt != null
      ? String(row.createdAt)
      : row.created_at != null
        ? String(row.created_at)
        : "";
  return { templateId, description, promptStructure, createdAt };
}

module.exports = { normalizeTemplateRecord };
