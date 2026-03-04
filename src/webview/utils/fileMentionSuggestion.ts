import type { SuggestionOptions } from "@tiptap/suggestion";
import { render } from "solid-js/web";
import { FileMentionDropdown, type FileItem, type FileMentionDropdownRef } from "../components/FileMentionDropdown";

interface FileMentionSuggestionOptions {
  searchFiles: (query: string) => Promise<string[]>;
}

let debounceTimer: number | undefined;
const DROPDOWN_PADDING = 8;
const DROPDOWN_FALLBACK_WIDTH = 300;
const DROPDOWN_FALLBACK_HEIGHT = 194;

export function createFileMentionSuggestion(
  options: FileMentionSuggestionOptions
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "@",
    
    items: async ({ query }) => {
      // Debounce file search by 200ms
      return new Promise<FileItem[]>((resolve) => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        debounceTimer = window.setTimeout(async () => {
          try {
            const files = await options.searchFiles(query);
            const items = files.map((path) => ({
              path,
              name: path.split("/").pop() || path,
            }));
            resolve(items);
          } catch (error) {
            resolve([]);
          }
        }, 200);
      });
    },

    render: () => {
      let container: HTMLElement | null = null;
      let dropdownRef: FileMentionDropdownRef | null = null;
      let dispose: (() => void) | null = null;
      let selectedIndex = 0;
      let items: FileItem[] = [];
      let currentPosition = { top: 0, left: 0 };

      const getReferenceRect = (props: Parameters<NonNullable<ReturnType<NonNullable<SuggestionOptions["render"]>>["onStart"]>>[0]) => {
        const clientRect = props.clientRect?.();
        if (clientRect) {
          return clientRect;
        }

        const { view } = props.editor;
        const coords = view.coordsAtPos(props.range.to);
        return {
          top: coords.top,
          bottom: coords.bottom,
          left: coords.left,
          right: coords.left,
          width: 0,
          height: coords.bottom - coords.top,
          x: coords.left,
          y: coords.top,
          toJSON: () => ({}),
        } as DOMRect;
      };

      const getDropdownPosition = (
        props: Parameters<NonNullable<ReturnType<NonNullable<SuggestionOptions["render"]>>["onStart"]>>[0],
        dropdownElement?: HTMLDivElement | null,
      ) => {
        const reference = getReferenceRect(props);
        const dropdownWidth = dropdownElement?.offsetWidth ?? DROPDOWN_FALLBACK_WIDTH;
        const dropdownHeight = dropdownElement?.offsetHeight ?? DROPDOWN_FALLBACK_HEIGHT;

        let top = reference.bottom;
        let left = reference.left;

        const maxLeft = window.innerWidth - dropdownWidth - DROPDOWN_PADDING;
        left = Math.min(Math.max(left, DROPDOWN_PADDING), Math.max(DROPDOWN_PADDING, maxLeft));

        if (top + dropdownHeight > window.innerHeight - DROPDOWN_PADDING) {
          top = Math.max(DROPDOWN_PADDING, reference.top - dropdownHeight);
        }

        return { top, left };
      };

      const renderDropdown = (props: Parameters<NonNullable<ReturnType<NonNullable<SuggestionOptions["render"]>>["onStart"]>>[0]) => {
        if (!container) {
          return;
        }

        if (dispose) {
          dispose();
          dispose = null;
        }

        const DropdownComponent = () => {
          return FileMentionDropdown({
            items,
            selectedIndex,
            onSelect: (item) => {
              props.command({ id: item.path, label: item.path });
            },
            position: currentPosition,
            ref: (ref) => {
              dropdownRef = ref;
            },
          });
        };

        dispose = render(DropdownComponent, container);
      };

      return {
        onStart: (props) => {
          items = props.items as FileItem[];
          selectedIndex = 0;

          // Create container for dropdown
          container = document.createElement("div");
          container.id = "file-mention-dropdown-container";
          container.style.position = "fixed";
          container.style.zIndex = "10000";
          container.style.top = "0";
          container.style.left = "0";
          container.style.pointerEvents = "none"; // Allow clicks through container to dropdown
          document.body.appendChild(container);
          container.style.background = "transparent";
          container.style.border = "none";
          container.style.padding = "0";

          currentPosition = getDropdownPosition(props, dropdownRef?.getElement());
          renderDropdown(props);
        },

        onUpdate: (props) => {
          selectedIndex = 0;
          items = props.items as FileItem[];

          if (container) {
            currentPosition = getDropdownPosition(props, dropdownRef?.getElement());
            renderDropdown(props);
          }
        },

        onKeyDown: (props) => {
          if (dropdownRef && dropdownRef.onKeyDown(props.event)) {
            return true;
          }
          return false;
        },

        onExit: () => {
          if (dispose) {
            dispose();
            dispose = null;
          }
          if (container) {
            if (container.parentNode) {
              document.body.removeChild(container);
            }
            container = null;
          }
          dropdownRef = null;
        },
      };
    },
  };
}
