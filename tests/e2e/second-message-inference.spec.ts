import { test, expect } from "./fixtures";

/**
 * Tests for the bug where sending a second user message doesn't trigger inference.
 *
 * Bug behavior:
 * - First message works fine - user sends message, assistant responds
 * - Second message: sendPrompt returns successfully (hasError: false, hasData: true),
 *   session.idle fires immediately, but NO assistant response is generated
 * - The user message appears in the UI in correct order
 *
 * Suspected cause: Client-generated messageID format may be incompatible with server,
 * or inFlightMessage state isn't being cleared properly after first message.
 */
test.describe("Second Message Inference Bug", () => {
  test("should generate assistant response for second message", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send first message
    await textarea.fill("hello");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for user message to appear
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "hello" })
    ).toBeVisible({ timeout: 15000 });

    // Wait for first assistant response
    await expect(
      webview.getByRole("article", { name: "assistant message" }).first()
    ).toBeVisible({ timeout: 30000 });

    // Wait for thinking to stop (submit button should be visible and enabled)
    await expect(textarea).toBeEnabled({ timeout: 15000 });

    // Count assistant messages before second send
    const assistantMessagesBefore = await webview
      .getByRole("article", { name: "assistant message" })
      .count();
    console.log(
      `[test] Assistant messages after first message: ${assistantMessagesBefore}`
    );

    // Send second message
    await textarea.fill("what is 2+2");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for second user message to appear
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "what is 2+2" })
    ).toBeVisible({ timeout: 15000 });

    // Wait for second assistant response - THIS IS THE BUG
    // If the bug exists, this will timeout because no assistant response is generated
    await expect(
      webview.getByRole("article", { name: "assistant message" }).nth(1)
    ).toBeVisible({ timeout: 30000 });

    // Verify we have 2 assistant messages
    const assistantMessagesAfter = await webview
      .getByRole("article", { name: "assistant message" })
      .count();
    console.log(
      `[test] Assistant messages after second message: ${assistantMessagesAfter}`
    );

    expect(assistantMessagesAfter).toBeGreaterThan(assistantMessagesBefore);
    expect(assistantMessagesAfter).toBe(2);
  });

  test("should generate responses for three sequential messages", async ({
    openWebview,
  }) => {
    const webview = await openWebview();

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    const messages = ["first message", "second message", "third message"];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      console.log(`[test] Sending message ${i + 1}: "${message}"`);

      // Wait for input to be enabled
      await expect(textarea).toBeEnabled({ timeout: 15000 });

      // Send message
      await textarea.fill(message);
      await expect(submitButton).toBeEnabled({ timeout: 5000 });
      await submitButton.click();

      // Wait for user message to appear
      await expect(
        webview
          .getByRole("article", { name: "user message" })
          .filter({ hasText: message })
      ).toBeVisible({ timeout: 15000 });

      // Wait for assistant response
      await expect(
        webview.getByRole("article", { name: "assistant message" }).nth(i)
      ).toBeVisible({ timeout: 30000 });

      console.log(`[test] Got assistant response for message ${i + 1}`);
    }

    // Verify we have 3 user messages and 3 assistant messages
    const userMessages = await webview
      .getByRole("article", { name: "user message" })
      .count();
    const assistantMessages = await webview
      .getByRole("article", { name: "assistant message" })
      .count();

    expect(userMessages).toBe(3);
    expect(assistantMessages).toBe(3);
  });

  test("should track POST requests for sequential messages", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    // Track POST requests to the message endpoint
    const postRequests: { url: string; body: string; timestamp: number }[] = [];

    await page.route("**/session/*/message", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postData() || "";
        postRequests.push({
          url: route.request().url(),
          body,
          timestamp: Date.now(),
        });
        console.log(`[test] POST request #${postRequests.length}:`, {
          url: route.request().url(),
          bodyLength: body.length,
        });
      }
      await route.continue();
    });

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send first message
    await textarea.fill("hello");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for first response
    await expect(
      webview.getByRole("article", { name: "assistant message" }).first()
    ).toBeVisible({ timeout: 30000 });
    await expect(textarea).toBeEnabled({ timeout: 15000 });

    const postsAfterFirst = postRequests.length;
    console.log(`[test] POST requests after first message: ${postsAfterFirst}`);

    // Send second message
    await textarea.fill("what is 2+2");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait a bit for the request to be made
    await page.waitForTimeout(2000);

    const postsAfterSecond = postRequests.length;
    console.log(
      `[test] POST requests after second message: ${postsAfterSecond}`
    );

    // Verify a POST was made for the second message
    expect(postsAfterSecond).toBeGreaterThan(postsAfterFirst);

    // Wait for second response
    await expect(
      webview.getByRole("article", { name: "assistant message" }).nth(1)
    ).toBeVisible({ timeout: 30000 });

    // Log all POST request bodies for debugging
    console.log("[test] All POST requests:");
    postRequests.forEach((req, i) => {
      try {
        const parsed = JSON.parse(req.body);
        console.log(`  [${i + 1}] messageID: ${parsed.messageID}, parts: ${parsed.parts?.length}`);
      } catch {
        console.log(`  [${i + 1}] body: ${req.body.substring(0, 100)}...`);
      }
    });
  });

  test("should verify messageID format in requests", async ({
    openWebview,
    page,
    getServerLogEntries,
  }) => {
    const webview = await openWebview();

    // Capture request bodies from POST requests
    const requestBodies: { messageID?: string; hasMessageID: boolean }[] = [];

    await page.route("**/session/*/message", async (route) => {
      if (route.request().method() === "POST") {
        try {
          const body = JSON.parse(route.request().postData() || "{}");
          const hasMessageID = "messageID" in body && body.messageID !== undefined;
          requestBodies.push({
            messageID: body.messageID,
            hasMessageID,
          });
          console.log(`[test] Captured request: messageID=${body.messageID}, hasMessageID=${hasMessageID}`);
        } catch {
          // ignore parse errors
        }
      }
      await route.continue();
    });

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send two messages
    await textarea.fill("first");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    await expect(
      webview.getByRole("article", { name: "assistant message" }).first()
    ).toBeVisible({ timeout: 30000 });
    await expect(textarea).toBeEnabled({ timeout: 15000 });

    await textarea.fill("second");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for second response or timeout
    try {
      await expect(
        webview.getByRole("article", { name: "assistant message" }).nth(1)
      ).toBeVisible({ timeout: 30000 });
    } catch (e) {
      console.log("[test] Second message did not get a response - BUG DETECTED");

      // Log captured requests for debugging
      console.log("[test] Captured requests:", requestBodies);

      // Check server logs for clues
      const logEntries = getServerLogEntries();
      const relevantLogs = logEntries.filter(
        (entry) =>
          entry.message.includes("message") ||
          entry.service === "session" ||
          entry.level === "ERROR" ||
          entry.level === "WARN"
      );
      console.log(
        "[test] Relevant server logs:",
        relevantLogs.map((e) => e.raw)
      );

      throw e;
    }

    // Verify we captured 2 POST requests
    expect(requestBodies.length).toBe(2);
    
    // Log request info for debugging
    console.log("[test] Request bodies:", requestBodies);
    
    // If messageIDs are present, verify they're unique
    const messageIDs = requestBodies.filter(r => r.hasMessageID).map(r => r.messageID);
    if (messageIDs.length === 2) {
      expect(messageIDs[0]).not.toBe(messageIDs[1]);
      console.log("[test] MessageIDs are unique:", messageIDs);
    } else {
      console.log("[test] MessageIDs not present in all requests (may be using undefined)");
    }
  });
});
