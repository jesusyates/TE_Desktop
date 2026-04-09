import { useUiStrings } from "../../i18n/useUiStrings";

type Props = {
  logs: unknown[];
};

export const ExecutionLogPanel = ({ logs }: Props) => {
  const u = useUiStrings();
  return (
    <section className="execution-log-panel" aria-label={u.console.logStreamTitle}>
      <h2 className="execution-log-panel__title">{u.console.logStreamTitle}</h2>
      <pre className="execution-log-panel__pre mono-block">{logs.length ? JSON.stringify(logs, null, 2) : "[]"}</pre>
    </section>
  );
};
