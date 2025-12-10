/* @jsxImportSource solid-js */
import type { Element, Nodes } from "hast";
import type { JSX } from "solid-js";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import type { PluggableList } from "unified";
import { unified } from "unified";
import { hastToSolid, type Components, type HastNode } from "./hast-to-solid";

export type { Components };

export type MarkdownOptions = {
  children?: string;
  components?: Components;
  rehypePlugins?: PluggableList;
  remarkPlugins?: PluggableList;
  remarkRehypeOptions?: Readonly<RemarkRehypeOptions>;
};

const EMPTY_PLUGINS: PluggableList = [];
const DEFAULT_REMARK_REHYPE_OPTIONS = { allowDangerousHtml: true };

// Plugin name cache for faster serialization
const pluginNameCache = new WeakMap<Function, string>();

// LRU Cache for unified processors
class ProcessorCache {
  private readonly cache = new Map<string, any>();
  private readonly keyCache = new WeakMap<Readonly<MarkdownOptions>, string>();
  private readonly maxSize = 100;

  generateCacheKey(options: Readonly<MarkdownOptions>): string {
    const cachedKey = this.keyCache.get(options);
    if (cachedKey) return cachedKey;

    const rehypePlugins = options.rehypePlugins;
    const remarkPlugins = options.remarkPlugins;
    const remarkRehypeOptions = options.remarkRehypeOptions;

    if (!(rehypePlugins || remarkPlugins || remarkRehypeOptions)) {
      const key = "default";
      this.keyCache.set(options, key);
      return key;
    }

    const serializePlugins = (plugins: PluggableList | undefined): string => {
      if (!plugins || plugins.length === 0) return "";
      let result = "";
      for (let i = 0; i < plugins.length; i += 1) {
        const plugin = plugins[i];
        if (i > 0) result += ",";
        if (Array.isArray(plugin)) {
          const [pluginFn, pluginOptions] = plugin;
          if (typeof pluginFn === "function") {
            let name = pluginNameCache.get(pluginFn);
            if (!name) {
              name = pluginFn.name;
              pluginNameCache.set(pluginFn, name);
            }
            result += name;
          } else {
            result += String(pluginFn);
          }
          result += ":";
          result += JSON.stringify(pluginOptions);
        } else if (typeof plugin === "function") {
          let name = pluginNameCache.get(plugin);
          if (!name) {
            name = plugin.name;
            pluginNameCache.set(plugin, name);
          }
          result += name;
        } else {
          result += String(plugin);
        }
      }
      return result;
    };

    const rehypeKey = serializePlugins(rehypePlugins);
    const remarkKey = serializePlugins(remarkPlugins);
    const optionsKey = remarkRehypeOptions ? JSON.stringify(remarkRehypeOptions) : "";
    const key = `${remarkKey}::${rehypeKey}::${optionsKey}`;
    this.keyCache.set(options, key);
    return key;
  }

  get(options: Readonly<MarkdownOptions>) {
    const key = this.generateCacheKey(options);
    const processor = this.cache.get(key);
    if (processor) {
      this.cache.delete(key);
      this.cache.set(key, processor);
    }
    return processor;
  }

  set(options: Readonly<MarkdownOptions>, processor: any): void {
    const key = this.generateCacheKey(options);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, processor);
  }
}

const processorCache = new ProcessorCache();

const getCachedProcessor = (options: Readonly<MarkdownOptions>) => {
  const cached = processorCache.get(options);
  if (cached) return cached;
  const processor = createProcessor(options);
  processorCache.set(options, processor);
  return processor;
};

const createProcessor = (options: Readonly<MarkdownOptions>) => {
  const rehypePlugins = options.rehypePlugins || EMPTY_PLUGINS;
  const remarkPlugins = options.remarkPlugins || EMPTY_PLUGINS;
  const remarkRehypeOptions = options.remarkRehypeOptions
    ? { ...DEFAULT_REMARK_REHYPE_OPTIONS, ...options.remarkRehypeOptions }
    : DEFAULT_REMARK_REHYPE_OPTIONS;

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkPlugins)
    .use(remarkRehype, remarkRehypeOptions)
    .use(rehypeRaw)
    .use(rehypePlugins);
};

export function Markdown(options: Readonly<MarkdownOptions>): JSX.Element {
  const processor = getCachedProcessor(options);
  const content = options.children || "";
  const tree = processor.runSync(processor.parse(content), content) as HastNode;
  return hastToSolid(tree, { components: options.components });
}

// Convenience function for rendering markdown string directly
export function renderMarkdown(
  markdown: string,
  options: Omit<MarkdownOptions, "children"> = {}
): JSX.Element {
  return Markdown({ ...options, children: markdown });
}
