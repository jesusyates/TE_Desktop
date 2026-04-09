"use strict";
/**
 * D-7-3R / D-7-5G：Content hash 字段规范单源（无 crypto；Core 与 Renderer 共用）。
 * 本文件为标准 ESM/TS 源码；Renderer 直接 import；Node（aics-core）require 编译产物 `dist-node/contentHashSpec.js`。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalTaskResultForHash = canonicalTaskResultForHash;
exports.buildResultHashPayloadObject = buildResultHashPayloadObject;
exports.buildMemoryHashPayloadObject = buildMemoryHashPayloadObject;
function canonicalTaskResultForHash(result) {
    if (!result || typeof result !== "object") {
        return { kind: "content", title: "", body: "" };
    }
    const r = result;
    const kind = r.kind === "computer" ? "computer" : "content";
    if (kind === "content") {
        const o = {
            kind: "content",
            title: String(r.title ?? ""),
            body: String(r.body ?? "")
        };
        if (r.summary != null && String(r.summary) !== "")
            o.summary = String(r.summary);
        if (r.action != null && String(r.action) !== "")
            o.action = String(r.action);
        if (typeof r.stepCount === "number" && Number.isFinite(r.stepCount))
            o.stepCount = r.stepCount;
        if (typeof r.durationMs === "number" && Number.isFinite(r.durationMs))
            o.durationMs = r.durationMs;
        return o;
    }
    const o = {
        kind: "computer",
        title: String(r.title ?? "")
    };
    if (r.body != null && String(r.body) !== "")
        o.body = String(r.body);
    if (r.summary != null && String(r.summary) !== "")
        o.summary = String(r.summary);
    if (typeof r.stepCount === "number" && Number.isFinite(r.stepCount))
        o.stepCount = r.stepCount;
    if (typeof r.eventCount === "number" && Number.isFinite(r.eventCount))
        o.eventCount = r.eventCount;
    if (r.environmentLabel != null && String(r.environmentLabel) !== "")
        o.environmentLabel = String(r.environmentLabel);
    if (r.targetApp != null && String(r.targetApp) !== "")
        o.targetApp = String(r.targetApp);
    return o;
}
function buildResultHashPayloadObject(prompt, result) {
    return {
        prompt: String(prompt ?? "").trim(),
        result: canonicalTaskResultForHash(result)
    };
}
function buildMemoryHashPayloadObject(fields) {
    return {
        prompt: String(fields.prompt ?? "").trim(),
        requestedMode: fields.requestedMode != null ? String(fields.requestedMode) : "",
        resolvedMode: fields.resolvedMode != null ? String(fields.resolvedMode) : "",
        intent: fields.intent != null ? String(fields.intent) : "",
        resultKind: fields.resultKind != null && String(fields.resultKind) !== "" ? String(fields.resultKind) : "",
        capabilityIds: Array.isArray(fields.capabilityIds)
            ? [...fields.capabilityIds].map(String).sort()
            : [],
        success: typeof fields.success === "boolean" ? fields.success : null,
        memoryType: fields.memoryType != null ? String(fields.memoryType) : "",
        memoryKey: fields.memoryKey != null ? String(fields.memoryKey) : ""
    };
}
