type VscodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

declare const acquireVsCodeApi: (() => VscodeApi) | undefined;

export const hasVscodeApi = typeof acquireVsCodeApi !== "undefined";

const noopVscode = {
  postMessage: (_message: unknown) => {},
  getState: () => undefined,
  setState: (_state: unknown) => {},
};

export const vscode = hasVscodeApi ? acquireVsCodeApi!() : noopVscode;
