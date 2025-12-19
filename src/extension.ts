import * as vscode from "vscode";
import { OpenCodeService } from "./OpenCodeService";
import { OpenCodeViewProvider } from "./OpenCodeViewProvider";

let logger: vscode.LogOutputChannel;

export function getLogger(): vscode.LogOutputChannel {
  return logger;
}

export async function activate(context: vscode.ExtensionContext) {
  // Create log channel - VSCode manages file location and timestamps automatically
  logger = vscode.window.createOutputChannel("OpenCode", { log: true });
  context.subscriptions.push(logger);

  logger.info("OpenCode extension activated", {
    timestamp: new Date().toISOString(),
    workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    extensionPath: context.extensionPath,
  });

  // Create OpenCode service
  const openCodeService = new OpenCodeService();

  // Initialize OpenCode with workspace root
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  try {
    await openCodeService.initialize(workspaceRoot);
    logger.info("OpenCode service initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize OpenCode service", error);
    vscode.window.showErrorMessage(
      "Failed to start OpenCode. Please check your configuration."
    );
  }

  const provider = new OpenCodeViewProvider(
    context.extensionUri,
    openCodeService,
    context.globalState
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      OpenCodeViewProvider.viewType,
      provider
    )
  );

  // Cleanup on deactivation
  context.subscriptions.push(openCodeService);

  logger.info("OpenCode webview provider registered");
}

export function deactivate() {
  logger?.info("OpenCode extension deactivated");
}
