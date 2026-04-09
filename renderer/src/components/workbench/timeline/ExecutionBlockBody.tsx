import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const ExecutionBlockBody = ({ children }: Props) => {
  return <div className="execution-block__body">{children}</div>;
};
