import { useRef } from "react";

type Props = {
  disabled?: boolean;
  onPickFiles: (files: File[]) => void;
  ariaLabel?: string;
  /** 悬停说明（如占位能力「即将支持」） */
  title?: string;
};

export const PlusButton = ({ disabled, onPickFiles, ariaLabel = "添加附件", title }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const control = (
    <button
      type="button"
      className={`plus-button${disabled ? " plus-button--disabled-hint" : ""}`}
      disabled={disabled}
      aria-label={ariaLabel}
      title={disabled ? undefined : title}
      onClick={() => inputRef.current?.click()}
    >
      +
    </button>
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) onPickFiles(Array.from(list));
          e.target.value = "";
        }}
      />
      {disabled && title ? (
        <span className="plus-button__tooltip-host" title={title}>
          {control}
        </span>
      ) : (
        control
      )}
    </>
  );
};
