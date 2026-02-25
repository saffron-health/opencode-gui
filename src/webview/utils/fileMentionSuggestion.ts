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
            console.log("[FileMention] items() resolved with", items.length, "items");
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
          console.log("[FileMention] onStart called", { 
            itemCount: props.items.length,
            items: props.items,
            query: props.query,
            text: props.text,
          });
          
          items = props.items as FileItem[];
          selectedIndex = 0;

          // Create a simple test div first
          container = document.createElement("div");
          container.id = "file-mention-dropdown-container";
          container.style.position = "fixed";
          container.style.zIndex = "10000";
          container.style.background = "red";
          container.style.border = "2px solid yellow";
          container.style.padding = "20px";
          container.style.top = "100px";
          container.style.left = "100px";
          container.innerHTML = `<div style="color: white;">TEST DROPDOWN - Items: ${items.length}</div>`;
          document.body.appendChild(container);
          
          console.log("[FileMention] Container created and appended to body", {
            container,
            parentNode: container.parentNode,
            itemsToRender: items,
          });

          // Get cursor position from ProseMirror
          const { view } = props.editor;
          const { from } = props.range;
          const coords = view.coordsAtPos(from);
          
          console.log("[FileMention] Cursor coords", coords);

          // Create virtual element for floating-ui
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
          computePosition(virtualElement as Element, container, {
            placement: "bottom-start",
            middleware: [
              flip(),
              shift({ padding: 8 }),
            ],
          }).then(({ x, y }) => {
            console.log("[FileMention] Computed position", { x, y });
            
            // Try rendering the actual dropdown
            setTimeout(() => {
              console.log("[FileMention] Attempting to render SolidJS component");
              try {
                const DropdownComponent = () => {
                  console.log("[FileMention] DropdownComponent rendering with items:", items);
                  return FileMentionDropdown({
                    items,
                    selectedIndex,
                    onSelect: (item) => {
                      console.log("[FileMention] Item selected:", item);
                      props.command({ id: item.path, label: item.name });
                    },
                    position: { top: y, left: x },
                    ref: (ref) => {
                      console.log("[FileMention] Dropdown ref received:", ref);
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
                console.log("[FileMention] Render complete, dispose function:", dispose);
                console.log("[FileMention] Container HTML:", container!.innerHTML);
                console.log("[FileMention] Container children:", container!.children);
              } catch (err) {
                console.error("[FileMention] Error rendering dropdown:", err);
              }
            }, 100);
          });
        },

        onUpdate: (props) => {
          console.log("[FileMention] onUpdate called", { itemCount: props.items.length });
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
          console.log("[FileMention] onKeyDown", props.event.key);
          if (dropdownRef && dropdownRef.onKeyDown(props.event)) {
            return true;
          }
          return false;
        },

        onExit: () => {
          console.log("[FileMention] onExit called");
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
