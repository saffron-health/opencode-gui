import type { Permission } from "../../shared/messages";

interface PermissionPromptProps {
  permission: Permission;
  onResponse: (permissionId: string, response: "once" | "always" | "reject") => void;
}

export function PermissionPrompt(props: PermissionPromptProps) {
  const getPermissionMessage = () => {
    const type = props.permission.permission;
    const meta = props.permission.metadata || {};
    
    switch (type) {
      case "external_directory": {
        const dir = (meta.parentDir as string) || (meta.filepath as string) || (props.permission.patterns?.[0]) || "unknown";
        return `Allow access to ${dir}?`;
      }
      case "edit":
        return `Allow editing ${(meta.filepath as string) || "this file"}?`;
      case "read":
        return `Allow reading ${(meta.filepath as string) || "this file"}?`;
      case "bash":
        return `Allow running: ${(meta.command as string) || "this command"}?`;
      case "task":
        return `Allow delegating to a sub-agent?`;
      case "webfetch":
        return `Allow fetching from ${(meta.url as string) || "the web"}?`;
      case "websearch":
        return `Allow searching the web?`;
      case "glob":
      case "grep":
      case "list":
        return `Allow searching the codebase?`;
      case "doom_loop":
        return `Agent appears stuck in a loop. Allow continuing?`;
      default:
        return `Allow ${type}?`;
    }
  };

  const handleResponse = (response: "once" | "always" | "reject") => {
    console.log(`[PermissionPrompt] User responded: ${response} for ${props.permission.id}`);
    props.onResponse(props.permission.id, response);
  };

  return (
    <div class="permission-prompt" role="group" aria-label="Permission request">
      <div class="permission-prompt__content">
        <div class="permission-prompt__icon">⚠️</div>
        <div class="permission-prompt__message">
          {getPermissionMessage()}
        </div>
      </div>
      <div class="permission-prompt__buttons">
        <button
          class="permission-button permission-button--quiet"
          onClick={() => handleResponse("reject")}
          aria-label="Reject"
        >
          reject
        </button>
        <div class="permission-spacer" />
        <button
          class="permission-button permission-button--quiet"
          onClick={() => handleResponse("always")}
          aria-label="Allow always"
        >
          always
        </button>
        <button
          class="permission-button permission-button--primary"
          onClick={() => handleResponse("once")}
          aria-label="Allow once"
        >
          once
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-left: 4px">
            <path d="M8.78 5.97a.75.75 0 0 0-1.06 0L4.47 9.22a.75.75 0 0 0 1.06 1.06L8 7.81l2.47 2.47a.75.75 0 1 0 1.06-1.06L8.78 5.97z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
