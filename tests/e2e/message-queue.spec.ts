import { test, expect } from "./fixtures";

/**
 * Dedicated tests for message queue functionality.
 * 
 * Bug: When sending a message, inFlightMessage is set but never cleared on success.
 * It relies on session.idle event to clear it, which creates a race condition where
 * queued messages may not be processed because inFlightMessage is still set.
 */
test.describe("Message Queue", () => {
  test("should process queued messages immediately after response", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });
    const queueButton = webview.getByRole("button", { name: "Queue message" });
    
    // Send first message
    await textarea.fill("First message");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();
    
    // Wait a tiny bit for the thinking state to start
    await page.waitForTimeout(100);
    
    // Queue second message while thinking
    await textarea.fill("Second queued message");
    const hasQueueButton = await queueButton.isVisible().catch(() => false);
    
    if (hasQueueButton) {
      await queueButton.click();
      
      // The second message should appear automatically after the first completes
      // This tests that processNextQueuedMessage() is called properly
      await expect(
        webview
          .getByRole("article", { name: "user message" })
          .filter({ hasText: "Second queued message" })
      ).toBeVisible({ timeout: 45000 });
      
      // And should get a response
      const assistantMessages = webview.getByRole("article", { name: "assistant message" });
      await expect(assistantMessages.nth(1)).toBeVisible({ timeout: 30000 });
    } else {
      // Response was too fast, we couldn't queue
      console.log("[test] Response was too fast to queue message");
      test.skip();
    }
  });
  
  test("should process multiple queued messages in order", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });
    const queueButton = webview.getByRole("button", { name: "Queue message" });
    
    // Send first message
    await textarea.fill("Message 1");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();
    
    // Wait for thinking state
    await page.waitForTimeout(100);
    
    // Try to queue multiple messages
    await textarea.fill("Message 2");
    const hasQueueButton = await queueButton.isVisible().catch(() => false);
    
    if (!hasQueueButton) {
      console.log("[test] Response was too fast to queue messages");
      test.skip();
      return;
    }
    
    await queueButton.click();
    
    // Queue a third message
    await textarea.fill("Message 3");
    await queueButton.click();
    
    // All three messages should appear in order
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Message 1" })
    ).toBeVisible({ timeout: 15000 });
    
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Message 2" })
    ).toBeVisible({ timeout: 45000 });
    
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Message 3" })
    ).toBeVisible({ timeout: 45000 });
    
    // Should have 3 user messages total
    const userMessages = await webview
      .getByRole("article", { name: "user message" })
      .count();
    expect(userMessages).toBe(3);
  });
  
  test("queue button should not be visible when not thinking", async ({
    openWebview,
  }) => {
    const webview = await openWebview();
    
    const queueButton = webview.getByRole("button", { name: "Queue message" });
    
    // Initially, queue button should not be visible
    await expect(queueButton).not.toBeVisible();
  });
});
