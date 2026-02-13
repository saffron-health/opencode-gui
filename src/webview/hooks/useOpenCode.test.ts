import { describe, expect, it } from "vitest";
import { buildSessionPromptRequest } from "./promptRequest";

describe("buildSessionPromptRequest", () => {
  it("Given minimal prompt inputs, When building session request, Then no model override is included", () => {
    const request = buildSessionPromptRequest("session-1", "hello");

    expect(request).toEqual({
      sessionID: "session-1",
      parts: [{ type: "text", text: "hello" }],
    });
    expect("model" in request).toBe(false);
  });

  it("Given agent and messageID, When building session request, Then optional fields are included", () => {
    const request = buildSessionPromptRequest("session-1", "hello", [], "coder", "msg-1");

    expect(request).toEqual({
      sessionID: "session-1",
      parts: [{ type: "text", text: "hello" }],
      agent: "coder",
      messageID: "msg-1",
    });
  });

  it("Given extra prompt parts, When building session request, Then text part stays first and extra parts are appended", () => {
    const request = buildSessionPromptRequest(
      "session-1",
      "base",
      [{ type: "text", text: "follow-up" }],
      null,
      undefined
    );

    expect(request.parts).toEqual([
      { type: "text", text: "base" },
      { type: "text", text: "follow-up" },
    ]);
  });
});
