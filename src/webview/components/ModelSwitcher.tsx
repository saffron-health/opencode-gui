import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { ModelOption } from "../hooks/useOpenCode";

interface ModelSwitcherProps {
  models: ModelOption[];
  selectedModel: { providerID: string; modelID: string } | null;
  onModelChange: (model: ModelOption) => void;
  // "up" (default) opens the dropdown above the button (left-aligned);
  // "down" opens it below the button (right-aligned), used when the input sits at the top.
  dropdownPlacement?: "up" | "down";
}

export function ModelSwitcher(props: ModelSwitcherProps) {
  const [open, setOpen] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  const current = () =>
    props.models.find(
      (m) =>
        props.selectedModel != null &&
        m.providerID === props.selectedModel.providerID &&
        m.modelID === props.selectedModel.modelID,
    );

  const label = () => current()?.name || "Model";

  // Group models by provider for a readable dropdown.
  const grouped = createMemo(() => {
    const groups = new Map<string, { providerName: string; models: ModelOption[] }>();
    for (const model of props.models) {
      const group = groups.get(model.providerID);
      if (group) {
        group.models.push(model);
      } else {
        groups.set(model.providerID, {
          providerName: model.providerName,
          models: [model],
        });
      }
    }
    return Array.from(groups.values());
  });

  const isSelected = (model: ModelOption) =>
    props.selectedModel != null &&
    model.providerID === props.selectedModel.providerID &&
    model.modelID === props.selectedModel.modelID;

  const select = (model: ModelOption) => {
    props.onModelChange(model);
    setOpen(false);
  };

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
  });

  return (
    <div class="model-switcher" ref={containerRef}>
      <button
        type="button"
        class="model-switcher-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch model"
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={current() ? `${current()!.providerName} / ${label()}` : "Select model"}
        disabled={props.models.length === 0}
      >
        <span class="model-switcher-button__label">{label()}</span>
        <span class="model-switcher-button__caret">▾</span>
      </button>
      <Show when={open()}>
        <div
          class={`model-switcher-dropdown${props.dropdownPlacement === "down" ? " model-switcher-dropdown--down" : ""}`}
          role="listbox"
        >
          <Show
            when={props.models.length > 0}
            fallback={<div class="model-switcher-empty">No models available</div>}
          >
            <For each={grouped()}>
              {(group) => (
                <div class="model-switcher-group">
                  <div class="model-switcher-group__label">{group.providerName}</div>
                  <For each={group.models}>
                    {(model) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected(model)}
                        class={`model-switcher-option${isSelected(model) ? " model-switcher-option--selected" : ""}`}
                        onClick={() => select(model)}
                      >
                        {model.name}
                      </button>
                    )}
                  </For>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
