import "./data-posture-strip.css";

type Props = {
  title: string;
  rows: string[];
};

/**
 * Trust & Data Safety：执行侧摘要条（与结果区同文案来源）。
 */
export function DataPostureStrip({ title, rows }: Props) {
  if (!rows.length) return null;
  return (
    <div className="data-posture-strip" role="region" aria-label={title}>
      <div className="data-posture-strip__title">{title}</div>
      <ul className="data-posture-strip__list">
        {rows.map((line, i) => (
          <li key={i} className="data-posture-strip__line text-sm text-muted">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
