declare const acquireVsCodeApi: (() => { postMessage: (message: unknown) => void }) | undefined;

export const hasVscodeApi = typeof acquireVsCodeApi !== "undefined";

const noopVscode = {
  postMessage: (_message: unknown) => {},
};

export const vscode = hasVscodeApi ? acquireVsCodeApi!() : noopVscode;
