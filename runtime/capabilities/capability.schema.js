/**
 * Capability System — 数据结构约定（模块 D）。
 * 禁止在业务里直接绑定具体软件名；一律经 capability id → tool 候选解析。
 */

/**
 * @typedef {Object} LocalizedLabel
 * @property {string} [zh-CN]
 * @property {string} [en-US]
 * @property {string} [ja-JP]
 */

/**
 * @typedef {Object} CapabilityDefinition
 * @property {string} capability
 * @property {LocalizedLabel} label
 * @property {string[]} tool_candidates
 * @property {string[]} [infer_keywords] — 用于从用户自然语言推断所需能力（小写）
 */

/**
 * @typedef {Object} ToolMatchInfo
 * @property {string} [process_name]
 * @property {string} [install_path]
 */

/**
 * @typedef {Object} ScannedTool
 * @property {string} tool_id
 * @property {string} display_name
 * @property {string[]} capabilities
 * @property {'available'|'unknown'} status
 * @property {ToolMatchInfo} match
 * @property {'system_scan'} source
 */

module.exports = {};
