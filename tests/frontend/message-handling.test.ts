import { describe, it, expect } from "vitest";
import { GatekeeperHarness } from "../utils/Gatekeeper";
import { extractTextFromParts } from "../../src/webview/state/utils";
import type { MessagePart } from "../../src/webview/types";

describe("Message Handling Tests", () => {
  it("should extract text from text parts", () => {
    const parts: MessagePart[] = [
      { id: "1", type: "text", text: "Hello " },
      { id: "2", type: "text", text: "world" },
    ];

    const text = extractTextFromParts(parts);
    expect(text).toBe("Hello \nworld");
  });

  it("should filter out non-text parts", () => {
    const parts: MessagePart[] = [
      { id: "1", type: "text", text: "Hello" },
      { id: "2", type: "tool", tool: "bash" },
      { id: "3", type: "text", text: " world" },
    ];

    const text = extractTextFromParts(parts);
    expect(text).toBe("Hello\n world");
  });

  it("should handle empty parts array", () => {
    const parts: MessagePart[] = [];
    const text = extractTextFromParts(parts);
    expect(text).toBe("");
  });

  it("should handle parts without text field", () => {
    const parts: MessagePart[] = [
      { id: "1", type: "text", text: "Start" },
      { id: "2", type: "text" },
      { id: "3", type: "text", text: "End" },
    ];

    const text = extractTextFromParts(parts);
    expect(text).toBe("Start\nEnd");
  });
});

type MessageProcessor = {
  processMessage(text: string): Promise<string>;
};

class SimpleProcessor implements MessageProcessor {
  async processMessage(text: string): Promise<string> {
    return text.toUpperCase();
  }
}

describe("Message Processing with Gatekeeper", () => {
  it("should process messages without interception", async () => {
    const harness = new GatekeeperHarness().add(
      "processor",
      () => new SimpleProcessor()
    );

    harness.lowerAllGates();

    const result = await harness.processor.call.processMessage("hello");
    expect(result).toBe("HELLO");
  });

  it("should intercept and mock message processing", async () => {
    const harness = new GatekeeperHarness().add(
      "processor",
      () => new SimpleProcessor()
    );

    harness.raiseAllGates();

    const resultPromise = harness.processor.intercept.processMessage("hello");

    const call = await harness.processor.waitForCall("processMessage");
    expect(call.args).toEqual(["hello"]);

    // Return custom response instead of actual processing
    await call.fulfill("MOCKED RESPONSE");

    const result = await resultPromise;
    expect(result).toBe("MOCKED RESPONSE");
  });

  it("should inspect arguments before proceeding", async () => {
    const harness = new GatekeeperHarness().add(
      "processor",
      () => new SimpleProcessor()
    );

    harness.raiseAllGates();

    const resultPromise = harness.processor.intercept.processMessage("test input");

    const call = await harness.processor.waitForCall("processMessage");
    
    // Verify the argument
    expect(call.args[0]).toBe("test input");
    
    // Let it proceed with actual processing
    await call.proceed();
    await call.deliverActual();

    const result = await resultPromise;
    expect(result).toBe("TEST INPUT");
  });
});
