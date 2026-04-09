/**
 * AICS 桌面更新策略 — 服务端裁决 updateType；客户端仅执行。
 * GET /aics/desktop/update-check?currentVersion=&platform=&channel=
 *
 * 运维接入：按 semver / 风险标替换下方默认占位（当前默认无更新，不打扰客户端）。
 */
const ALLOWED_TYPES = new Set(["silent", "soft", "force"]);

function normalizeUpdateType(raw) {
  const t = raw != null ? String(raw).trim() : "";
  return ALLOWED_TYPES.has(t) ? t : "silent";
}

function handleDesktopUpdateCheck(_req, searchParams) {
  const currentVersion = String(searchParams.get("currentVersion") || "").trim() || "0.0.0";
  const platform = String(searchParams.get("platform") || "").trim() || "unknown";
  const channel = String(searchParams.get("channel") || "").trim() || "stable";
  void currentVersion;
  void platform;
  void channel;

  /** 替换为真实策略：无更新时 hasUpdate=false，客户端不做任何事 */
  const hasUpdate = false;
  const updateType = normalizeUpdateType("silent");

  return {
    status: 200,
    body: {
      success: true,
      data: {
        hasUpdate,
        updateType,
        targetVersion: null,
        downloadUrl: null,
        releaseNotes: null,
        message: null
      }
    }
  };
}

module.exports = { handleDesktopUpdateCheck };
