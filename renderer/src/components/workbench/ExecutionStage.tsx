import type { ExecutionPhase } from "../../execution/session/execution";
import { useUiStrings } from "../../i18n/useUiStrings";

const PHASES: ExecutionPhase[] = ["task_received", "preparing", "running", "completed"];

type Props = {
  /** 由会话 status 推导，保证阶段与控制台状态一致 */
  phase: ExecutionPhase | null;
};

function phaseIndex(phase: ExecutionPhase | null): number {
  if (!phase) return -1;
  return PHASES.indexOf(phase);
}

export const ExecutionStage = ({ phase }: Props) => {
  const u = useUiStrings();
  const x = u.console.executionSession;
  const active = phaseIndex(phase);

  const label = (p: ExecutionPhase) => {
    switch (p) {
      case "task_received":
        return x.phaseReceived;
      case "preparing":
        return x.phasePreparing;
      case "running":
        return x.phaseRunning;
      case "completed":
        return x.phaseCompleted;
      default:
        return p;
    }
  };

  return (
    <section className="execution-phase-track" aria-label={x.phaseTrackAria}>
      <ol className="execution-phase-track__list">
        {PHASES.map((p, i) => {
          const isActive = active >= 0 && i === active;
          const isDone = active >= 0 && i < active;
          const stateClass = isActive ? "execution-phase-track__step--active" : isDone ? "execution-phase-track__step--done" : "";
          return (
            <li key={p} className={`execution-phase-track__step ${stateClass}`.trim()} data-phase={p}>
              <span className="execution-phase-track__dot" aria-hidden />
              <span className="execution-phase-track__label">{label(p)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
