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

          // Get cursor position from ProseMirror
          const { view } = props.editor;
          const { from } = props.range;
          const coords = view.coordsAtPos(from);
          
          // Position dropdown directly below cursor using absolute positioning
          // coords.top and coords.left are already viewport-relative
          const dropdownTop = coords.bottom; // Position below the cursor line
          const dropdownLeft = coords.left;
          
          // Render the dropdown at the calculated position
          setTimeout(() => {
            try {
              const DropdownComponent = () => {
                return FileMentionDropdown({
                  items,
                  selectedIndex,
                  onSelect: (item) => {
                    props.command({ id: item.path, label: item.path });
                  },
                  position: { top: dropdownTop, left: dropdownLeft },
                  ref: (ref) => {
                    dropdownRef = ref;
                  },
                });
              };
              
              // Clear the test content
              container!.innerHTML = "";
              container!.style.background = "transparent";
              container!.style.border = "none";
              container!.style.padding = "0";
              container!.style.position = "absolute";
              
              dispose = render(DropdownComponent, container!);
            } catch (err) {
              // Silently fail
            }
          }, 100);
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
                      props.command({ id: item.path, label: item.path });
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
