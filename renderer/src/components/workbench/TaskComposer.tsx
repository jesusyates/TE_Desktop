/** 旧版大号输入区；主工作台请使用 `chat/ChatInputBar`（D-3-1）。 */
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { useUiStrings } from "../../i18n/useUiStrings";

export type TaskComposerProps = {
  prompt: string;
  setPrompt: (v: string) => void;
  onSubmit: () => void;
  /** true 时禁用输入（校验/排队/运行/停止中等） */
  locked: boolean;
  submitDisabled: boolean;
  error?: string;
};

/**
 * 仅负责输入与提交；不持有执行会话状态（由上层 Workbench + useExecutionSession）。
 */
export const TaskComposer = ({ prompt, setPrompt, onSubmit, locked, submitDisabled, error }: TaskComposerProps) => {
  const u = useUiStrings();
  const busy = locked;

  return (
    <section className="console-super-input task-composer" aria-label={u.console.mainInputAria}>
      <div className="console-super-input__field">
        <Textarea
          id="workbench-task-composer"
          className="console-super-input__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={u.console.superInputPh}
          autoComplete="off"
          rows={5}
          disabled={locked}
        />
        <div className="console-super-input__actions">
          <Button variant="primary" type="button" disabled={submitDisabled || busy} onClick={onSubmit}>
            {busy ? u.stage.runBusy : u.console.executionSession.actionStart}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="console-super-input__err text-danger text-pre-wrap">
          {u.stage.errLabel}：{error}
        </p>
      ) : null}
    </section>
  );
};
