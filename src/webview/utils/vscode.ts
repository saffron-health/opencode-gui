declare const acquireVsCodeApi: () => { postMessage: (message: unknown) => void };

export const vscode = acquireVsCodeApi();
