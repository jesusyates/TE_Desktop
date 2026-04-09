import "./replay.css";

type Props = {
  progress: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (p: number) => void;
  onExit: () => void;
};

export const ExecutionReplayControls = ({
  progress,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onExit
}: Props) => {
  const pct = Math.round(progress * 100);

  return (
    <div className="execution-replay-controls" role="group" aria-label="执行回放控制">
      <div className="execution-replay-controls__buttons">
        {isPlaying ? (
          <button type="button" className="execution-replay-controls__btn" onClick={onPause}>
            暂停
          </button>
        ) : (
          <button type="button" className="execution-replay-controls__btn execution-replay-controls__btn--primary" onClick={onPlay}>
            播放
          </button>
        )}
        <button type="button" className="execution-replay-controls__btn execution-replay-controls__btn--ghost" onClick={onExit}>
          退出回放
        </button>
      </div>
      <div className="execution-replay-controls__scrub">
        <input
          type="range"
          className="execution-replay-controls__range"
          min={0}
          max={100}
          step={1}
          value={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          onChange={(e) => onSeek(Number(e.target.value) / 100)}
        />
        <span className="execution-replay-controls__pct text-muted text-sm">{pct}%</span>
      </div>
    </div>
  );
};
