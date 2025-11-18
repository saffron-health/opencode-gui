declare const vscode: {
  postMessage(message: any): void;
};

export const logger = {
  debug: (message: string, data?: any) => {
    vscode.postMessage({
      type: "log",
      level: "debug",
      message,
      data,
    });
  },
  info: (message: string, data?: any) => {
    vscode.postMessage({
      type: "log",
      level: "info",
      message,
      data,
    });
  },
  error: (message: string, data?: any) => {
    vscode.postMessage({
      type: "log",
      level: "error",
      message,
      data,
    });
  },
};
