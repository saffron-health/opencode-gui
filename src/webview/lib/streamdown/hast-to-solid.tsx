/* @jsxImportSource solid-js */
import { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Element, Text, Root, Comment, Doctype, ElementContent } from "hast";

export type HastNode = Element | Text | Root | Comment | Doctype;

export type Components = {
  [Key in keyof JSX.IntrinsicElements]?: (
    props: JSX.IntrinsicElements[Key] & { node?: Element }
  ) => JSX.Element;
};

export interface HastToSolidOptions {
  components?: Components;
}

function isElement(node: HastNode): node is Element {
  return node.type === "element";
}

function isText(node: HastNode): node is Text {
  return node.type === "text";
}

function isRoot(node: HastNode): node is Root {
  return node.type === "root";
}

function convertProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    
    // Convert className to class for Solid
    if (key === "className") {
      result.class = Array.isArray(value) ? value.join(" ") : value;
      continue;
    }
    
    // Convert htmlFor to for
    if (key === "htmlFor") {
      result.for = value;
      continue;
    }
    
    // Handle style object
    if (key === "style" && typeof value === "object") {
      result.style = value;
      continue;
    }
    
    // Handle boolean attributes
    if (typeof value === "boolean") {
      if (value) {
        result[key] = true;
      }
      continue;
    }
    
    // Handle arrays (like class lists)
    if (Array.isArray(value)) {
      result[key] = value.join(" ");
      continue;
    }
    
    result[key] = value;
  }
  
  return result;
}

function renderNode(
  node: HastNode | ElementContent,
  options: HastToSolidOptions,
  key?: number
): JSX.Element | string | null {
  if (isText(node as HastNode)) {
    return (node as Text).value;
  }
  
  if (isElement(node as HastNode)) {
    const element = node as Element;
    const tagName = element.tagName as keyof JSX.IntrinsicElements;
    const CustomComponent = options.components?.[tagName];
    
    const props = convertProperties(element.properties || {});
    const children = element.children?.map((child, i) => renderNode(child, options, i)) || [];
    
    if (CustomComponent) {
      return (
        <CustomComponent {...props} node={element}>
          {children}
        </CustomComponent>
      );
    }
    
    // Use Dynamic for standard HTML elements
    return <Dynamic component={tagName} {...props}>{children}</Dynamic>;
  }
  
  if (isRoot(node as HastNode)) {
    const root = node as Root;
    const children = root.children?.map((child, i) => renderNode(child, options, i)) || [];
    return <>{children}</>;
  }
  
  // Ignore comments and doctypes
  return null;
}

export function hastToSolid(tree: HastNode, options: HastToSolidOptions = {}): JSX.Element {
  return renderNode(tree, options) as JSX.Element;
}
