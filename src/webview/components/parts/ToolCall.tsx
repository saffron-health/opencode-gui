
import { Match, Show, Switch, createEffect, createSignal, createMemo } from "solid-js";
import type { ToolState as BaseToolState, MessagePart, Permission } from "../../types";
import { DiffViewer, getDiffStats } from "./DiffViewer";

type ToolName =
  | "read"
  | "write"
  | "edit"
  | "web_search"
  | "webfetch"
  | "grep"
  | "glob"
  | "list"
  | "bash"
  | "todowrite"
  | "todoread"
  | "playwright_browser_navigate"
  | "playwright_browser_click"
  | "playwright_browser_type"
  | "playwright_browser_snapshot"
  | "playwright_browser_take_screenshot"
  | "clipboard_copy_selection"
  | "clipboard_cut_selection"
  | "clipboard_paste_clipboard"
  | "task"
  | "query_db"
  | "logs"
  | "enrich_profile";

type ReadInput = { filePath?: string; path?: string };
type WriteInput = { filePath?: string; path?: string };
type WebSearchInput = { query?: string };
type WebFetchInput = { url?: string };
type GrepInput = { pattern?: string };
type GlobInput = { pattern?: string };
type ListInput = { path?: string };
type BashInput = { command?: string; description?: string };
type PlaywrightNavigateInput = { url?: string };
type PlaywrightClickInput = { element?: string };
type PlaywrightTypeInput = { element?: string };
type ClipboardInput = { selection?: string };
type TaskInput = { description?: string };

type ToolInputMap = {
  read: ReadInput;
  write: WriteInput;
  edit: WriteInput;
  web_search: WebSearchInput;
  webfetch: WebFetchInput;
  grep: GrepInput;
  glob: GlobInput;
  list: ListInput;
  bash: BashInput;
  todowrite: Record<string, unknown>;
  todoread: Record<string, unknown>;
  playwright_browser_navigate: PlaywrightNavigateInput;
  playwright_browser_click: PlaywrightClickInput;
  playwright_browser_type: PlaywrightTypeInput;
  playwright_browser_snapshot: Record<string, unknown>;
  playwright_browser_take_screenshot: Record<string, unknown>;
  clipboard_copy_selection: ClipboardInput;
  clipboard_cut_selection: ClipboardInput;
  clipboard_paste_clipboard: ClipboardInput;
  task: TaskInput;
  query_db: Record<string, unknown>;
  logs: Record<string, unknown>;
  enrich_profile: Record<string, unknown>;
};

type ToolInput = ToolInputMap[ToolName] | Record<string, unknown>;

type ToolState = Omit<BaseToolState, "input"> & {
  input?: ToolInput;
};

// Icon components
const ChecklistIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M9.25 9.25V6.75C9.25 6.19772 8.80228 5.75 8.25 5.75H5.75C5.19772 5.75 4.75 6.19772 4.75 6.75V9.25C4.75 9.80228 5.19772 10.25 5.75 10.25H8.25C8.80228 10.25 9.25 9.80228 9.25 9.25Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M9.25 18.25H5.75C5.19772 18.25 4.75 17.8023 4.75 17.25V13.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M12.75 6.75H19.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M12.75 14.75H19.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M12.75 9.25H19.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M12.75 17.25H19.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M8 16.25L7.42383 16.7301C7.59297 16.9331 7.85641 17.0321 8.11735 16.9908C8.37829 16.9494 8.59824 16.7738 8.69636 16.5285L8 16.25ZM10.8011 13.2587C11.0821 12.9543 11.0631 12.4799 10.7587 12.1989C10.4543 11.9179 9.97985 11.9369 9.6989 12.2413L10.8011 13.2587ZM7.32617 14.2699C7.06099 13.9517 6.58807 13.9087 6.26986 14.1738C5.95165 14.439 5.90866 14.9119 6.17383 15.2301L7.32617 14.2699ZM8.69636 16.5285C9.03866 15.6728 9.56133 14.855 10.0115 14.2398C10.2345 13.9351 10.4349 13.6865 10.5785 13.5152C10.6503 13.4296 10.7076 13.3637 10.7462 13.32C10.7655 13.2981 10.7801 13.2819 10.7894 13.2716C10.7941 13.2664 10.7974 13.2627 10.7994 13.2606C10.8004 13.2595 10.801 13.2588 10.8013 13.2585C10.8015 13.2583 10.8015 13.2583 10.8015 13.2583C10.8015 13.2583 10.8014 13.2584 10.8014 13.2584C10.8013 13.2585 10.8013 13.2585 10.8012 13.2586C10.8012 13.2586 10.8011 13.2587 10.25 12.75C9.6989 12.2413 9.69881 12.2414 9.69872 12.2415C9.69868 12.2415 9.69858 12.2416 9.6985 12.2417C9.69835 12.2419 9.69817 12.2421 9.69797 12.2423C9.69757 12.2427 9.69708 12.2433 9.6965 12.2439C9.69534 12.2452 9.69382 12.2468 9.69194 12.2489C9.68819 12.253 9.68303 12.2587 9.67653 12.2658C9.66352 12.2802 9.64515 12.3007 9.62195 12.327C9.57558 12.3795 9.50986 12.4551 9.42926 12.5512C9.26825 12.7432 9.04679 13.0181 8.80098 13.354C8.31367 14.02 7.71134 14.9522 7.30364 15.9715L8.69636 16.5285ZM6.17383 15.2301L7.42383 16.7301L8.57617 15.7699L7.32617 14.2699L6.17383 15.2301Z" fill="currentColor"></path>
  </svg>
);

const FileIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M7.75 19.25H16.25C17.3546 19.25 18.25 18.3546 18.25 17.25V9L14 4.75H7.75C6.64543 4.75 5.75 5.64543 5.75 6.75V17.25C5.75 18.3546 6.64543 19.25 7.75 19.25Z"
    ></path>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M18 9.25H13.75V5"
    ></path>
  </svg>
);

const FileDiffIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M7.75 19.25H16.25C17.3546 19.25 18.25 18.3546 18.25 17.25V9L14 4.75H7.75C6.64543 4.75 5.75 5.64543 5.75 6.75V17.25C5.75 18.3546 6.64543 19.25 7.75 19.25Z"
    ></path>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M18 9.25H13.75V5"
    ></path>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M9.75 15.25H14.25"
    ></path>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M9.75 12.25H14.25"
    ></path>
  </svg>
);

const GlobeIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
    <circle
      cx="12"
      cy="12"
      r="7.25"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></circle>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M15.25 12C15.25 16.5 13.2426 19.25 12 19.25C10.7574 19.25 8.75 16.5 8.75 12C8.75 7.5 10.7574 4.75 12 4.75C13.2426 4.75 15.25 7.5 15.25 12Z"
    ></path>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M5 12H12H19"
    ></path>
  </svg>
);

const MagnifyingGlassIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M19.25 19.25L15.5 15.5M4.75 11C4.75 7.54822 7.54822 4.75 11 4.75C14.4518 4.75 17.25 7.54822 17.25 11C17.25 14.4518 14.4518 17.25 11 17.25C7.54822 17.25 4.75 14.4518 4.75 11Z"
    ></path>
  </svg>
);

const FolderIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    fill="none"
    viewBox="0 0 24 24"
  >
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M4.75 18.25V7.75c0-1.105.918-2 2.05-2h1.368c.531 0 1.042.201 1.424.561l.932.878c.382.36.892.561 1.424.561h5.302a1 1 0 0 1 1 1v3m-13.5 6.5h12.812l1.642-5.206c.2-.635-.278-1.278-.954-1.294m-13.5 6.5 1.827-5.794c.133-.42.53-.706.98-.706H18.25"
    ></path>
  </svg>
);

const TerminalIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
    <rect
      width="14.5"
      height="14.5"
      x="4.75"
      y="4.75"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      rx="2"
    ></rect>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M8.75 10.75L11.25 13L8.75 15.25"
    ></path>
  </svg>
);

const GenericToolIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10.75 13.25V10.25H8.25V11.25C8.25 11.8023 7.80228 12.25 7.25 12.25H5.75C5.19772 12.25 4.75 11.8023 4.75 11.25V5.75C4.75 5.19772 5.19772 4.75 5.75 4.75H7.25C7.80228 4.75 8.25 5.19772 8.25 5.75V6.75H15C15 6.75 19.25 6.75 19.25 11.25C19.25 11.25 17 10.25 14.25 10.25V13.25M10.75 13.25H14.25M10.75 13.25V19.25M14.25 13.25V19.25"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    ></path>
  </svg>
);

const ChevronDownIcon = (props: { isOpen: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    style={{
      transform: props.isOpen ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.2s ease",
      "flex-shrink": "0",
    }}
  >
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M15.25 10.75L12 14.25L8.75 10.75"
    ></path>
  </svg>
);

const EnterIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    style={{ "margin-left": "4px" }}
  >
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M19 7V13.25C19 13.8023 18.5523 14.25 18 14.25H7M7 14.25L10.25 11M7 14.25L10.25 17.25"
    ></path>
  </svg>
);

interface ToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Map<string, Permission>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject"
  ) => void;
}

interface ToolDisplayInfo {
  icon: any;
  text: string;
  monospace: boolean;
  isLight?: boolean; // For todo tools
  isFilePath?: boolean; // For file paths that need special rendering
  dirPath?: string; // Directory part of the path
  fileName?: string; // File name part
}

function toRelativePath(
  absolutePath: string | undefined,
  workspaceRoot?: string
): string | undefined {
  if (!absolutePath || !workspaceRoot) return absolutePath;

  // Ensure paths have consistent separators
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const normalizedRoot = workspaceRoot.replace(/\\/g, "/");

  // Check if the path starts with the workspace root
  if (normalizedAbsolute.startsWith(normalizedRoot)) {
    let relativePath = normalizedAbsolute.slice(normalizedRoot.length);
    // Remove leading slash if present
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }
    return relativePath || ".";
  }

  return absolutePath;
}

function splitFilePath(filePath: string): {
  dirPath: string;
  fileName: string;
} {
  const lastSlash = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\")
  );

  if (lastSlash === -1) {
    // No directory, just filename
    return { dirPath: "", fileName: filePath };
  }

  return {
    dirPath: filePath.substring(0, lastSlash + 1), // Include trailing slash
    fileName: filePath.substring(lastSlash + 1),
  };
}

function getToolDisplayInfo(
  tool: ToolName | string | undefined,
  state: ToolState,
  workspaceRoot?: string
): ToolDisplayInfo {
  if (!tool) return { icon: GenericToolIcon, text: "Tool", monospace: false };

  const inputs = state.input || {};

  switch (tool) {
    // File reads
    case "read": {
      const relativePath = toRelativePath(
        (inputs as ReadInput).filePath || (inputs as ReadInput).path,
        workspaceRoot
      );
      if (relativePath) {
        const { dirPath, fileName } = splitFilePath(relativePath);
        return {
          icon: FileIcon,
          text: relativePath,
          monospace: false,
          isFilePath: true,
          dirPath,
          fileName,
        };
      }
      return {
        icon: FileIcon,
        text: "Read file",
        monospace: false,
      };
    }

    // File writes/edits
    case "write":
    case "edit": {
      const relativePath = toRelativePath(
        (inputs as WriteInput).filePath || (inputs as WriteInput).path,
        workspaceRoot
      );
      if (relativePath) {
        const { dirPath, fileName } = splitFilePath(relativePath);
        return {
          icon: FileDiffIcon,
          text: relativePath,
          monospace: false,
          isFilePath: true,
          dirPath,
          fileName,
        };
      }
      return {
        icon: FileDiffIcon,
        text: "Edit file",
        monospace: false,
      };
    }

    // Web search
    case "web_search":
      return {
        icon: GlobeIcon,
        text: (inputs as WebSearchInput).query || "Search",
        monospace: false,
      };

    // Web fetch
    case "webfetch":
      return {
        icon: GlobeIcon,
        text: (inputs as WebFetchInput).url || "Fetch page",
        monospace: false,
      };

    // Grep/glob search
    case "grep":
      return {
        icon: MagnifyingGlassIcon,
        text: (inputs as GrepInput).pattern || "Search pattern",
        monospace: true,
      };

    case "glob":
      return {
        icon: MagnifyingGlassIcon,
        text: (inputs as GlobInput).pattern || "File pattern",
        monospace: true,
      };

    // List directory
    case "list":
      return {
        icon: FolderIcon,
        text: (inputs as ListInput).path || ".",
        monospace: true,
      };

    // Bash
    case "bash":
      return {
        icon: TerminalIcon,
        text:
          (inputs as BashInput).command ||
          (inputs as BashInput).description ||
          "Run command",
        monospace: true,
      };
    // Todo tools (lighter weight)
    case "todowrite":
    case "todoread":
      return {
        icon: ChecklistIcon,
        text: tool === "todowrite" ? "Updated todos" : "Read todos",
        monospace: false,
        isLight: true,
      };

    // Playwright browser tools
    case "playwright_browser_navigate":
      return {
        icon: GlobeIcon,
        text: (inputs as PlaywrightNavigateInput).url || "Navigate",
        monospace: false,
      };

    case "playwright_browser_click":
      return {
        icon: GenericToolIcon,
        text: `Click: ${(inputs as PlaywrightClickInput).element || "element"}`,
        monospace: false,
      };

    case "playwright_browser_type":
      return {
        icon: GenericToolIcon,
        text: `Type: ${(inputs as PlaywrightTypeInput).element || "element"}`,
        monospace: false,
      };

    case "playwright_browser_snapshot":
      return {
        icon: GenericToolIcon,
        text: "Take snapshot",
        monospace: false,
      };

    case "playwright_browser_take_screenshot":
      return {
        icon: GenericToolIcon,
        text: "Screenshot",
        monospace: false,
      };

    // Clipboard operations
    case "clipboard_copy_selection":
      return {
        icon: GenericToolIcon,
        text: `Copy: ${(inputs as ClipboardInput).selection || "selection"}`,
        monospace: true,
      };

    case "clipboard_cut_selection":
      return {
        icon: GenericToolIcon,
        text: `Cut: ${(inputs as ClipboardInput).selection || "selection"}`,
        monospace: true,
      };

    case "clipboard_paste_clipboard":
      return {
        icon: GenericToolIcon,
        text: `Paste: ${(inputs as ClipboardInput).selection || "location"}`,
        monospace: true,
      };

    // Task/agent
    case "task":
      return {
        icon: GenericToolIcon,
        text: (inputs as TaskInput).description || "Run task",
        monospace: false,
      };

    // Database
    case "query_db":
      return {
        icon: GenericToolIcon,
        text: "Database query",
        monospace: false,
      };

    case "logs":
      return {
        icon: GenericToolIcon,
        text: "Fetch logs",
        monospace: false,
      };

    // Profile enrichment
    case "enrich_profile":
      return {
        icon: GenericToolIcon,
        text: "Enrich profile",
        monospace: false,
      };

    // Default
    default:
      return {
        icon: GenericToolIcon,
        text: state.title || tool,
        monospace: false,
      };
  }
}

export function ToolCall(props: ToolCallProps) {
  const tool = props.part.tool as ToolName | string | undefined;
  const state = props.part.state as ToolState | undefined;
  if (!state) return null;

  const shouldDefaultOpen = tool === "edit" || tool === "write" || tool === "bash";
  const [isOpen, setIsOpen] = createSignal(shouldDefaultOpen);
  const [toolCallRef, setToolCallRef] = createSignal<HTMLDivElement | null>(
    null
  );
  const displayInfo = getToolDisplayInfo(tool, state, props.workspaceRoot);
  const Icon = displayInfo.icon;
  const hasDiff = !!(state.metadata?.diff);
  const isEditTool = tool === "edit" || tool === "write";
  const hasOutput = !!(state.output || state.error || (isEditTool && hasDiff));
  
  const diffStats = createMemo(() => {
    if (isEditTool && hasDiff && state.metadata?.diff) {
      return getDiffStats(state.metadata.diff);
    }
    return null;
  });
  
  // Look up permission from pendingPermissions map using callID
  const permission = createMemo(() => {
    const perms = props.pendingPermissions;
    if (!perms) return undefined;
    const callID = props.part.callID;
    if (callID && perms.has(callID)) {
      return perms.get(callID);
    }
    // Also check by part ID as fallback
    if (perms.has(props.part.id)) {
      return perms.get(props.part.id);
    }
    return undefined;
  });
  
  const needsPermission = createMemo(() => !!permission());

  console.log("[ToolCall] Rendering:", {
    partId: props.part.id,
    callID: props.part.callID,
    tool,
    hasPermission: !!permission(),
    needsPermission: needsPermission(),
  });

  // Auto-focus the tool call container when permission prompt appears
  createEffect(() => {
    if (needsPermission()) {
      const container = toolCallRef();
      if (container) {
        container.focus();
      }
    }
  });

  const handlePermissionResponse = (response: "once" | "always" | "reject") => {
    const perm = permission();
    console.log(
      "[ToolCall] Permission response button clicked:",
      response,
      "for",
      perm?.id
    );
    console.log(
      "[ToolCall] onPermissionResponse prop exists?",
      !!props.onPermissionResponse
    );
    if (perm?.id && props.onPermissionResponse) {
      console.log("[ToolCall] Calling onPermissionResponse");
      props.onPermissionResponse(perm.id, response);
    } else {
      console.error(
        "[ToolCall] Cannot respond - missing permission ID or handler"
      );
    }
  };

  return (
    <Switch>
      <Match when={displayInfo.isLight}>
        <div class="tool-call-light">
          {Icon && <Icon />}
          {displayInfo.text}
        </div>
      </Match>
      <Match when={!displayInfo.isLight}>
        <div
          ref={setToolCallRef}
          class="tool-call"
          classList={{ "tool-call--needs-permission": needsPermission() }}
          tabIndex={needsPermission() ? 0 : undefined}
          onKeyDown={(e) => {
            if (needsPermission() && e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              console.log(
                "[ToolCall] Enter key pressed in tool call container"
              );
              handlePermissionResponse("once");
            }
          }}
        >
          <div
            class="tool-header"
            onClick={() => hasOutput && setIsOpen(!isOpen())}
            style={{ cursor: hasOutput ? "pointer" : "default" }}
          >
            {Icon && <span class="tool-icon"><Icon /></span>}
            <Show
              when={displayInfo.isFilePath}
              fallback={
                <span
                  class="tool-text"
                  classList={{ "tool-text--bash": tool === "bash" }}
                  style={{
                    "font-family": displayInfo.monospace
                      ? "monospace"
                      : "inherit",
                  }}
                >
                  {displayInfo.text}
                </span>
              }
            >
              <span class="tool-text tool-file-path">
                <span class="tool-file-dir">{displayInfo.dirPath}</span>
                <span class="tool-file-name">{displayInfo.fileName}</span>
              </span>
            </Show>
            <Show when={diffStats()}>
              <span class="tool-diff-stats">
                <Show when={diffStats()!.additions > 0}>
                  <span class="tool-diff-stats__additions">+{diffStats()!.additions}</span>
                </Show>
                <Show when={diffStats()!.deletions > 0}>
                  <span class="tool-diff-stats__deletions">-{diffStats()!.deletions}</span>
                </Show>
              </span>
            </Show>
            {hasOutput && <ChevronDownIcon isOpen={isOpen()} />}
          </div>
          <Show when={needsPermission()}>
            <div class="tool-permission-buttons" role="group" aria-label="Permission request">
              <button
                class="permission-button permission-button--quiet"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[ToolCall] Reject button clicked");
                  handlePermissionResponse("reject");
                }}
                aria-label="Reject"
              >
                reject
              </button>
              <div class="permission-spacer" />
              <button
                class="permission-button permission-button--quiet"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[ToolCall] Always button clicked");
                  handlePermissionResponse("always");
                }}
                aria-label="Allow always"
              >
                always
              </button>
              <button
                class="permission-button permission-button--primary"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("[ToolCall] Once button clicked");
                  handlePermissionResponse("once");
                }}
                aria-label="Allow once"
              >
                once
                <EnterIcon />
              </button>
            </div>
          </Show>
          <Show when={hasOutput && isOpen()}>
            <div class="tool-output-container">
              <Show when={isEditTool && hasDiff} fallback={
                <pre class="tool-output" classList={{ "tool-output--bash": tool === "bash" }}>{state.error || state.output}</pre>
              }>
                <DiffViewer diff={state.metadata?.diff || ""} />
                <Show when={state.output}>
                  <pre class="tool-output" classList={{ "tool-output--bash": tool === "bash" }}>{state.output}</pre>
                </Show>
              </Show>
            </div>
          </Show>
        </div>
      </Match>
    </Switch>
  );
}
