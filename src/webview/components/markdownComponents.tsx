import type { JSX } from "solid-js";
import type { Components } from "../lib/streamdown";
import { parseFileReferenceTarget } from "../../shared/fileReferences";
import { vscode } from "../utils/vscode";

export const messageMarkdownComponents: Components = {
  a: (props) => {
    const { node: _node, onClick, href, ...rest } = props as JSX.IntrinsicElements["a"] & {
      node?: unknown;
    };

    const handleClick: JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent> = (event) => {
      if (typeof href === "string") {
        const target = parseFileReferenceTarget(href);
        if (target) {
          event.preventDefault();
          event.stopPropagation();
          vscode.postMessage({
            type: "open-file",
            url: target.url,
            startLine: target.startLine,
            endLine: target.endLine,
          });
          return;
        }
      }
      if (typeof onClick === "function") {
        (onClick as (evt: MouseEvent) => void)(event);
      }
    };

    return (
      <a {...rest} href={href} onClick={handleClick}>
        {props.children}
      </a>
    );
  },
};
