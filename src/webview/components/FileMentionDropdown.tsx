import { createSignal, For, onMount, Show } from "solid-js";
import "./FileMentionDropdown.css";

export interface FileItem {
  path: string;
  name: string;
}

export interface FileMentionDropdownProps {
  items: FileItem[];
  selectedIndex: number;
  onSelect: (item: FileItem) => void;
  position: { top: number; left: number };
}

export interface FileMentionDropdownRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
  getElement: () => HTMLDivElement;
}

export function FileMentionDropdown(props: FileMentionDropdownProps & { ref?: (ref: FileMentionDropdownRef) => void }) {
  let containerRef!: HTMLDivElement;
  const [localSelectedIndex, setLocalSelectedIndex] = createSignal(props.selectedIndex);

  onMount(() => {
    if (props.ref) {
      props.ref({
        onKeyDown: handleKeyDown,
        getElement: () => containerRef,
      });
    }
  });

  const handleKeyDown = (event: KeyboardEvent): boolean => {
    const itemCount = props.items.length;
    
    if (itemCount === 0) {
      return false;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setLocalSelectedIndex((prev) => (prev + 1) % itemCount);
      scrollToSelected();
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setLocalSelectedIndex((prev) => (prev - 1 + itemCount) % itemCount);
      scrollToSelected();
      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const selected = props.items[localSelectedIndex()];
      if (selected) {
        props.onSelect(selected);
      }
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      return true;
    }

    return false;
  };

  const scrollToSelected = () => {
    const selected = containerRef?.querySelector(`[data-index="${localSelectedIndex()}"]`) as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  };



  return (
    <div
      ref={containerRef}
      class="file-mention-dropdown"
      style={{
        position: "fixed",
        top: `${props.position.top}px`,
        left: `${props.position.left}px`,
        "pointer-events": "auto", // Re-enable clicks on dropdown itself
      }}
    >
      <Show
        when={props.items.length > 0}
        fallback={<div class="file-mention-dropdown__empty">No files found</div>}
      >
        <For each={props.items}>
          {(item, index) => {
            // Extract directory from path
            const pathParts = item.path.split("/");
            const directory = pathParts.slice(0, -1).join("/");
            
            return (
              <div
                class={`file-mention-dropdown__item ${
                  index() === localSelectedIndex() ? "file-mention-dropdown__item--selected" : ""
                }`}
                data-index={index()}
                onClick={() => props.onSelect(item)}
                onMouseEnter={() => setLocalSelectedIndex(index())}
              >
                <span class="file-mention-dropdown__name">{item.name}</span>
                {directory && <span class="file-mention-dropdown__path">{directory}</span>}
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}
