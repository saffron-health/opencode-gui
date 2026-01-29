import {
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  type Component,
  type JSX,
} from "solid-js";
import type { Permission } from "../../types";
import { ChevronDownIcon, EnterIcon } from "./ToolCallIcons";

export interface ToolCallTemplateProps {
  icon: Component;
  header: Component;
  output?: Component;
  footer?: Component;
  isLight?: boolean;
  defaultOpen?: boolean;
  isPending?: boolean;
  needsPermission?: boolean;
  permission?: Permission;
  onPermissionResponse?: (response: "once" | "always" | "reject") => void;
}

function formatPermissionMessage(perm: Permission): string {
  const type = perm.permission;
  const meta = perm.metadata || {};

  switch (type) {
    case "external_directory": {
      const dir =
        (meta.parentDir as string) ||
        (meta.filepath as string) ||
        perm.patterns?.[0] ||
        "unknown";
      return `Allow access to ${dir}?`;
    }
    case "edit":
      return `Allow editing ${(meta.filepath as string) || "this file"}?`;
    case "read":
      return `Allow reading ${(meta.filepath as string) || "this file"}?`;
    case "bash":
      return `Allow running: ${(meta.command as string) || "this command"}?`;
    default:
      return `Allow ${type}?`;
  }
}

function PermissionButtons(props: {
  onResponse: (response: "once" | "always" | "reject") => void;
}): JSX.Element {
  return (
    <div
      class="tool-permission-buttons"
      role="group"
      aria-label="Permission request"
    >
      <button
        class="permission-button permission-button--quiet"
        onClick={(e) => {
          e.stopPropagation();
          props.onResponse("reject");
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
          props.onResponse("always");
        }}
        aria-label="Allow always"
      >
        always
      </button>
      <button
        class="permission-button permission-button--primary"
        onClick={(e) => {
          e.stopPropagation();
          props.onResponse("once");
        }}
        aria-label="Allow once"
      >
        once
        <EnterIcon />
      </button>
    </div>
  );
}

export function ToolCallTemplate(props: ToolCallTemplateProps) {
  const [isOpen, setIsOpen] = createSignal(props.defaultOpen ?? false);
  const [toolCallRef, setToolCallRef] = createSignal<HTMLDivElement | null>(
    null,
  );

  const hasOutput = () => !!props.output;

  // Auto-focus when permission prompt appears
  createEffect(() => {
    if (props.needsPermission) {
      toolCallRef()?.focus();
    }
  });

  const handlePermissionResponse = (response: "once" | "always" | "reject") => {
    const perm = props.permission;
    if (perm?.id && props.onPermissionResponse) {
      props.onPermissionResponse(response);
    }
  };

  return (
    <Switch>
      <Match when={props.isLight}>
        <div class="tool-call-light">
          <props.icon />
          <props.header />
        </div>
      </Match>
      <Match when={!props.isLight}>
        <div
          ref={setToolCallRef}
          class="tool-call"
          classList={{
            "tool-call--needs-permission": props.needsPermission,
            "tool-call--pending": props.isPending,
          }}
          tabIndex={props.needsPermission ? 0 : undefined}
          onKeyDown={(e) => {
            if (props.needsPermission && e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              handlePermissionResponse("once");
            }
          }}
        >
          {/* Tool header */}
          <div
            class="tool-header"
            onClick={() => hasOutput() && setIsOpen(!isOpen())}
            style={{ cursor: hasOutput() ? "pointer" : "default" }}
          >
            <span class="tool-icon">
              <props.icon />
            </span>
            <props.header />
            <Show when={hasOutput()}>
              <span class="tool-icon">
                <ChevronDownIcon isOpen={isOpen()} />
              </span>
            </Show>
          </div>

          {/* Permission prompt */}
          <Show when={props.needsPermission && props.permission}>
            <div class="tool-permission-prompt">
              <div class="tool-permission-message">
                {formatPermissionMessage(props.permission!)}
              </div>
              <PermissionButtons onResponse={handlePermissionResponse} />
            </div>
          </Show>

          {/* Output */}
          <Show when={isOpen() && props.output}>
            <div class="tool-output-container">
              {props.output && <props.output />}
            </div>
          </Show>

          {/* Footer */}
          {props.footer && <props.footer />}
        </div>
      </Match>
    </Switch>
  );
}
