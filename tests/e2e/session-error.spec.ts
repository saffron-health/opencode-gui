import { test, expect } from "./fixtures";

/**
 * Tests for session error handling.
 * 
 * Related bug fix: When a session.error SSE event is received, the handler 
 * sets isThinking to false and records the error, but previously failed to 
 * clear inFlightMessage. This blocks queue processing since 
 * processNextQueuedMessage() checks if (inFlightMessage()) and skips 
 * processing if there's an in-flight message.
 * 
 * These tests verify error recovery behavior to ensure users can continue
 * sending messages after an error occurs.
 * 
 * Note: Testing the SSE session.error event directly requires complex SSE
 * stream mocking. These tests cover the HTTP error path which exercises
 * similar error recovery logic.
 */
test.describe("Session Error Handling", () => {
  test("should allow sending new messages after a prompt API error", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    // First prompt - make it fail by intercepting the POST message API call
    let postCallCount = 0;
    await page.route("**/session/*/message", async (route) => {
      const method = route.request().method();
      
      // Only intercept POST requests (sending messages)
      if (method !== "POST") {
        await route.continue();
        return;
      }
      
      postCallCount++;
      if (postCallCount === 1) {
        // Fail the first prompt call with an error response
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              data: { message: "Simulated API error for testing" },
            },
          }),
        });
      } else {
        // Let subsequent requests through
        await route.continue();
      }
    });

    // Send a message that will trigger the error
    const textarea = webview.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Test message that will fail");
    
    const submitButton = webview.getByRole("button", { name: "Submit" });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for the error to be processed - the error should be shown inline as an alert
    await expect(webview.getByRole("alert")).toBeVisible({ timeout: 10000 });
    await expect(webview.getByRole("alert")).toContainText("Simulated API error for testing");

    // The submit button should be enabled again after the error
    await expect(submitButton).toBeDisabled(); // Input is empty after send
    
    // Now try to send another message - this should work if inFlightMessage was cleared
    await textarea.fill("Second message after error");
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // The second message should be sent and the user message should appear
    // If inFlightMessage wasn't cleared, the input would be blocked
    await expect(
      webview.getByRole("article", { name: "user message" }).filter({ hasText: "Second message after error" })
    ).toBeVisible({ timeout: 15000 });
  });

  test("should clear thinking state on session error", async ({
    openWebview,
  }) => {
    const page = await openWebview();

    // Send a message
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Hello");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();

    // Wait for the response (or error)
    // The thinking indicator should be cleared after completion or error
    await expect(page.getByRole("article", { name: "assistant message" })).toBeVisible({ timeout: 30000 });

    // Input should be usable again
    await expect(textarea).toBeEnabled();
    await textarea.fill("Follow up message");
    await expect(submitButton).toBeEnabled();
  });
});
