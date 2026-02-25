import type { SuggestionOptions } from "@tiptap/suggestion";
import { computePosition, flip, shift } from "@floating-ui/dom";
import { render } from "solid-js/web";
import { FileMentionDropdown, type FileItem, type FileMentionDropdownRef } from "../components/FileMentionDropdown";

interface FileMentionSuggestionOptions {
  searchFiles: (query: string) => Promise<string[]>;
}

let debounceTimer: number | undefined;

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
            console.error("Failed to search files:", error);
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

      return {
        onStart: (props) => {
          console.log("[FileMention] onStart called", { itemCount: props.items.length });
          container = document.createElement("div");
          container.style.position = "absolute";
          container.style.zIndex = "1000";
          document.body.appendChild(container);

          selectedIndex = 0;
          items = props.items as FileItem[];
          console.log("[FileMention] Items:", items);

          // Get cursor position from ProseMirror
          const { view } = props.editor;
          const { from } = props.range;
          const coords = view.coordsAtPos(from);

          // Create a virtual element for positioning
          const virtualElement = {
            getBoundingClientRect: () => ({
              width: 0,
              height: 0,
              top: coords.top,
              right: coords.left,
              bottom: coords.bottom,
              left: coords.left,
              x: coords.left,
              y: coords.top,
            }),
          };

          // Calculate position with floating-ui
          const containerElement = container;
          computePosition(virtualElement as Element, containerElement, {
            placement: "bottom-start",
            middleware: [
              flip(),
              shift({ padding: 8 }),
            ],
          }).then(({ x, y }) => {
            console.log("[FileMention] Rendering dropdown at", { x, y, items });
            
            // Create a wrapper function for Solid render
            const DropdownComponent = () => {
              return FileMentionDropdown({
                items,
                selectedIndex,
                onSelect: (item) => {
                  props.command({ id: item.path, label: item.name });
                },
                position: { top: y, left: x },
                ref: (ref) => {
                  dropdownRef = ref;
                },
              });
            };
            
            dispose = render(DropdownComponent, containerElement);
          });
        },

        onUpdate: (props) => {
          selectedIndex = 0;
          items = props.items as FileItem[];

          if (container && dispose) {
            // Get updated cursor position
            const { view } = props.editor;
            const { from } = props.range;
            const coords = view.coordsAtPos(from);

            const virtualElement = {
              getBoundingClientRect: () => ({
                width: 0,
                height: 0,
                top: coords.top,
                right: coords.left,
                bottom: coords.bottom,
                left: coords.left,
                x: coords.left,
                y: coords.top,
              }),
            };

            computePosition(virtualElement as Element, container, {
              placement: "bottom-start",
              middleware: [
                flip(),
                shift({ padding: 8 }),
              ],
            }).then(({ x, y }) => {
              // Re-render with updated props
              if (dispose) {
                dispose();
              }
              if (container) {
                const DropdownComponent = () => {
                  return FileMentionDropdown({
                    items,
                    selectedIndex,
                    onSelect: (item) => {
                      props.command({ id: item.path, label: item.name });
                    },
                    position: { top: y, left: x },
                    ref: (ref) => {
                      dropdownRef = ref;
                    },
                  });
                };
                
                dispose = render(DropdownComponent, container);
              }
            });
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
            document.body.removeChild(container);
            container = null;
          }
          dropdownRef = null;
        },
      };
    },
  };
}
