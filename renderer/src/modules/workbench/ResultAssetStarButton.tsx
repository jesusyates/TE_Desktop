import { useEffect, useState } from "react";
import { isResultStarred, toggleStarredResultId } from "./resultAssetStars";

type Props = {
  storageId: string;
  markLabel: string;
  markedLabel: string;
  disabled?: boolean;
};

export const ResultAssetStarButton = ({ storageId, markLabel, markedLabel, disabled = false }: Props) => {
  const id = storageId.trim();
  const [starred, setStarred] = useState(() => (id ? isResultStarred(id) : false));

  useEffect(() => {
    if (!id) {
      setStarred(false);
      return;
    }
    setStarred(isResultStarred(id));
  }, [id]);

  if (!id) return null;

  return (
    <button
      type="button"
      className={
        starred
          ? "ui-btn ui-btn--primary execution-result-panel__asset-star execution-result-panel__asset-star--on"
          : "ui-btn ui-btn--secondary execution-result-panel__asset-star"
      }
      disabled={disabled}
      aria-pressed={starred}
      onClick={() => {
        const next = toggleStarredResultId(id);
        setStarred(next);
      }}
    >
      {starred ? markedLabel : markLabel}
    </button>
  );
};
