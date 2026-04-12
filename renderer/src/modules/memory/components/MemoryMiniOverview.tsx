import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ExecutionStatus } from "../../../execution/session/execution";
import { useUiStrings } from "../../../i18n/useUiStrings";
import {
  fetchMemoryList,
  type MemoryListItemVm,
  type MemoryReadSource
} from "../../../services/coreMemoryService";
import { loadMemorySnapshot } from "../memoryStore";
import type { MemorySnapshot } from "../memoryTypes";
import "../memory-mini-overview.css";

type Props = {
  /** 终端态刷新快照（回放/仅浏览不触发写入，此处仅在有新终端态时刷新展示） */
  status: ExecutionStatus;
};

function aggregateHintPatterns(items: MemoryListItemVm[]) {
  const m = new Map<string, { count: number }>();
  for (const it of items) {
    const hintLike =
      it.memoryType === "successful_task_hint" || it.memoryType === "pattern";
    if (!hintLike) continue;
    const k =
      it.memoryType === "pattern"
        ? (it.valuePreview.trim().slice(0, 80) || it.memoryId || it.memoryType)
        : it.key.trim() || it.memoryType;
    const row = m.get(k) ?? { count: 0 };
    row.count += 1;
    m.set(k, row);
  }
  return [...m.entries()].map(([patternKey, v]) => ({
    patternKey,
    successCount: v.count,
    total: v.count
  }));
}

/**
 * D-6-3 / P1：长期记忆概览 — Core走 `GET /v1/memory`；能力统计仍用本地快照。
 */
export function MemoryMiniOverview({ status }: Props) {
  const u = useUiStrings();
  const [source, setSource] = useState<MemoryReadSource>("local");
  const [localSnap, setLocalSnap] = useState<MemorySnapshot>(() => loadMemorySnapshot());
  const [coreList, setCoreList] = useState<MemoryListItemVm[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { list } = await fetchMemoryList({ page: 1, pageSize: 100 });
      setCoreList(list);
      setSource("core");
    } catch (e) {
      console.error("[D-3] Core memory list failed, fallback local", e);
      setLocalSnap(loadMemorySnapshot());
      setSource("local");
      setCoreList([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status === "success" || status === "error" || status === "stopped") {
      void refresh();
    }
  }, [status, refresh]);

  const useCore = source === "core" && coreList.length > 0;

  const topCaps = [...localSnap.capabilityStats]
    .sort((a, b) => b.usedCount - a.usedCount)
    .slice(0, 3);

  const topPatterns = useCore
    ? [...aggregateHintPatterns(coreList)].sort((a, b) => b.successCount - a.successCount).slice(0, 3)
    : [...localSnap.taskPatterns].sort((a, b) => b.successCount - a.successCount).slice(0, 3);

  const recentCore = useCore ? coreList.slice(0, 5) : [];

  return (
    <section className="memory-mini-overview" aria-label="长期记忆概览">
      <header className="memory-mini-overview__header">
        记忆概览
        <span className="memory-mini-overview__source text-muted">
          {source === "core" ? " · Core" : " · 本地"}
        </span>
      </header>
      <div className="memory-mini-overview__block">
        <h3 className="memory-mini-overview__sub">常用能力</h3>
        {topCaps.length === 0 ? (
          <p className="memory-mini-overview__empty text-sm">暂无记录</p>
        ) : (
          <ol className="memory-mini-overview__list">
            {topCaps.map((c) => (
              <li key={c.capabilityId} className="memory-mini-overview__item text-sm">
                <code>{c.capabilityId}</code> · 使用 {c.usedCount} · 成功 {c.successCount}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="memory-mini-overview__block">
        <h3 className="memory-mini-overview__sub">{useCore ? "成功模式 (hint)" : "成功模式"}</h3>
        {topPatterns.length === 0 ? (
          <p className="memory-mini-overview__empty text-sm">暂无记录</p>
        ) : (
          <ol className="memory-mini-overview__list">
            {topPatterns.map((p) => (
              <li key={p.patternKey} className="memory-mini-overview__item text-sm">
                <code>{p.patternKey}</code> · 成功 {p.successCount} 次
              </li>
            ))}
          </ol>
        )}
      </div>
      {useCore ? (
        <div className="memory-mini-overview__block">
          <h3 className="memory-mini-overview__sub">最近归档</h3>
          {recentCore.length === 0 ? (
            <p className="memory-mini-overview__empty text-sm">暂无</p>
          ) : (
            <ol className="memory-mini-overview__list">
              {recentCore.map((m) => (
                <li key={m.memoryId} className="memory-mini-overview__item text-sm">
                  <span className="text-muted">{m.memoryType}</span> · <code>{m.key}</code>
                  {m.valuePreview ? (
                    <span className="memory-mini-overview__preview"> — {m.valuePreview}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
      <div className="memory-mini-overview__footer">
        <Link to="/memory" className="memory-mini-overview__link">
          {u.memoryPage.miniOverviewLink}
        </Link>
      </div>
    </section>
  );
}
