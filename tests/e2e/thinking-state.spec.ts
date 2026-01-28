import { test, expect } from "./fixtures";

/**
 * Tests for thinking state and message queue management.
 *
 * Related bugs:
 * 1. Thinking state stops prematurely but assistant still replies
 *    - The session.idle SSE event clears thinkingSessions in syncStore
 *    - But App.tsx's local inFlightMessage is never cleared on success
 *    - This causes a mismatch where isThinking() returns false but message is still processing
 *
 * 2. Infinite message loop after sending second message
 *    - inFlightMessage stays set after successful send (only cleared on error)
 *    - When isThinking becomes false, processNextQueuedMessage is called
 *    - But it bails out because inFlightMessage is still set
 *    - This can cause race conditions with queue processing
 *
 * Bug reproduction strategy:
 * - Use network interception to delay responses and create race conditions
 * - Monitor POST request counts to detect infinite loops
 * - Check thinking state transitions at specific points
 */
test.describe("Thinking State Management", () => {
  test("thinking indicator should persist until assistant response completes", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send a message
    await textarea.fill("Say hello");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for assistant response to appear
    await expect(
      webview.getByRole("article", { name: "assistant message" }).first()
    ).toBeVisible({ timeout: 30000 });

    // After assistant responds, the textarea should be enabled again
    await expect(textarea).toBeEnabled({ timeout: 10000 });

    // Verify we can send another message
    await textarea.fill("Follow up");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
  });

  test("should handle multiple sequential messages without infinite loop", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    // Track POST requests to detect infinite loops
    let postCount = 0;
    const postTimestamps: number[] = [];
    await page.route("**/session/*/message", async (route) => {
      if (route.request().method() === "POST") {
        postCount++;
        postTimestamps.push(Date.now());
        console.log(`[test] POST #${postCount} at ${Date.now()}`);
      }
      await route.continue();
    });

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send first message
    await textarea.fill("First message");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for first response
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "First message" })
    ).toBeVisible({ timeout: 15000 });

    await expect(
      webview.getByRole("article", { name: "assistant message" })
    ).toBeVisible({ timeout: 30000 });

    // Wait for thinking to stop
    await expect(submitButton).toBeVisible({ timeout: 10000 });

    const postCountAfterFirst = postCount;
    console.log(`[test] POST count after first message: ${postCountAfterFirst}`);

    // Send second message
    await textarea.fill("Second message");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for second response
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Second message" })
    ).toBeVisible({ timeout: 15000 });

    // Wait for 5 seconds to detect any infinite loop behavior
    await page.waitForTimeout(5000);

    // Check for infinite loop: if there were many rapid POST requests, we have a problem
    // In normal operation, we should have at most 2 more POSTs (for the second message)
    const postCountAfterSecond = postCount;
    console.log(`[test] POST count after second message: ${postCountAfterSecond}`);

    // Allow for some reasonable number of retries, but not an infinite loop
    const secondMessagePosts = postCountAfterSecond - postCountAfterFirst;
    expect(secondMessagePosts).toBeLessThan(5); // Should be 1-2, definitely not many

    // Check for rapid-fire requests (sign of infinite loop)
    if (postTimestamps.length >= 3) {
      const intervals = [];
      for (let i = 1; i < postTimestamps.length; i++) {
        intervals.push(postTimestamps[i] - postTimestamps[i - 1]);
      }
      // If we have 3+ requests within 500ms each, that's suspicious
      const rapidRequests = intervals.filter((i) => i < 500).length;
      expect(rapidRequests).toBeLessThan(3);
    }
  });

  test("inFlightMessage should be cleared after successful send", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    // Intercept the message API to verify request/response cycle
    let messageResolved = false;
    await page.route("**/session/*/message", async (route) => {
      if (route.request().method() === "POST") {
        await route.continue();
        messageResolved = true;
      } else {
        await route.continue();
      }
    });

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send a message
    await textarea.fill("Test message");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for assistant response
    await expect(
      webview.getByRole("article", { name: "assistant message" })
    ).toBeVisible({ timeout: 30000 });

    // After completion, the submit button should be usable again
    await expect(submitButton).toBeVisible({ timeout: 10000 });

    // Type a new message - if inFlightMessage wasn't cleared, this might be blocked
    await textarea.fill("Follow up message");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });

    // Submit should work
    await submitButton.click();

    // Should see the new user message
    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Follow up message" })
    ).toBeVisible({ timeout: 15000 });
  });

  test("queued messages should be processed after first response", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });
    const stopButton = webview.getByRole("button", { name: "Stop" });
    const queueButton = webview.getByRole("button", { name: "Queue message" });

    // Send first message
    await textarea.fill("First message");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Try to queue a second message while thinking
    // The response might be fast, so we check if we can catch the thinking state
    await textarea.fill("Queued message");

    // Check if we're still in thinking state (Stop/Queue buttons visible)
    // If the response already came, just send the second message normally
    const isThinking = await stopButton.isVisible().catch(() => false);

    if (isThinking) {
      // We caught the thinking state, use the queue button
      const hasQueueButton = await queueButton.isVisible().catch(() => false);
      if (hasQueueButton) {
        await queueButton.click();

        // Wait for first response
        await expect(
          webview.getByRole("article", { name: "assistant message" }).first()
        ).toBeVisible({ timeout: 30000 });

        // The queued message should eventually be sent and appear
        await expect(
          webview
            .getByRole("article", { name: "user message" })
            .filter({ hasText: "Queued message" })
        ).toBeVisible({ timeout: 30000 });
      } else {
        // No queue button while thinking - wait for thinking to end
        await expect(submitButton).toBeVisible({ timeout: 30000 });
        // Re-fill the input (may have been cleared) and submit
        await textarea.fill("Queued message");
        await expect(submitButton).toBeEnabled({ timeout: 5000 });
        await submitButton.click();

        await expect(
          webview
            .getByRole("article", { name: "user message" })
            .filter({ hasText: "Queued message" })
        ).toBeVisible({ timeout: 15000 });
      }
    } else {
      // Response was fast, just wait and send second message normally
      await expect(submitButton).toBeVisible({ timeout: 30000 });
      // Re-fill the input and submit
      await textarea.fill("Queued message");
      await expect(submitButton).toBeEnabled({ timeout: 5000 });
      await submitButton.click();

      await expect(
        webview
          .getByRole("article", { name: "user message" })
          .filter({ hasText: "Queued message" })
      ).toBeVisible({ timeout: 15000 });
    }
  });

  test("should not trigger infinite loop when POST response is delayed", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    // Track POST request count to detect infinite loops
    let postCount = 0;
    const postTimestamps: number[] = [];

    await page.route("**/session/*/message", async (route) => {
      if (route.request().method() === "POST") {
        postCount++;
        postTimestamps.push(Date.now());
        console.log(`[test] POST #${postCount} at ${Date.now()}`);

        // Delay the first POST response to create a race condition window
        if (postCount === 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      await route.continue();
    });

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send first message
    await textarea.fill("Message with delayed response");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for response
    await expect(
      webview.getByRole("article", { name: "assistant message" }).first()
    ).toBeVisible({ timeout: 30000 });

    // Record count after first message
    const countAfterFirst = postCount;
    console.log(`[test] POST count after first: ${countAfterFirst}`);

    // Wait a bit to detect any runaway loops
    await page.waitForTimeout(2000);

    // Check for infinite loop
    const countAfterWait = postCount;
    console.log(`[test] POST count after wait: ${countAfterWait}`);

    // Should not have sent additional requests
    expect(countAfterWait - countAfterFirst).toBeLessThan(3);

    // Send second message to verify system is still functional
    await textarea.fill("Second message");
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Second message" })
    ).toBeVisible({ timeout: 15000 });

    // Final count check
    const finalCount = postCount;
    console.log(`[test] Final POST count: ${finalCount}`);

    // Should have at most 2-3 POSTs total (first + second, maybe a retry)
    expect(finalCount).toBeLessThan(5);

    // Check for rapid-fire requests (sign of infinite loop)
    if (postTimestamps.length >= 3) {
      const rapidRequests = postTimestamps
        .slice(1)
        .filter((t, i) => t - postTimestamps[i] < 200).length;
      expect(rapidRequests).toBeLessThan(2);
    }
  });

  test("should recover correctly after session.idle event", async ({
    openWebview,
    page,
  }) => {
    const webview = await openWebview();

    // This test verifies that after a normal completion (session.idle),
    // the UI correctly resets and allows new messages

    const textarea = webview.getByRole("textbox", { name: "Message input" });
    const submitButton = webview.getByRole("button", { name: "Submit" });

    // Send two messages in sequence to test completions
    // First message
    await textarea.fill("Message 1");
    await expect(submitButton).toBeEnabled({ timeout: 10000 });
    await submitButton.click();

    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Message 1" })
    ).toBeVisible({ timeout: 15000 });

    await expect(
      webview.getByRole("article", { name: "assistant message" }).first()
    ).toBeVisible({ timeout: 30000 });

    // Wait for textarea to be enabled (thinking stopped)
    await expect(textarea).toBeEnabled({ timeout: 15000 });

    // Second message
    await textarea.fill("Message 2");
    await expect(submitButton).toBeEnabled({ timeout: 10000 });
    await submitButton.click();

    await expect(
      webview
        .getByRole("article", { name: "user message" })
        .filter({ hasText: "Message 2" })
    ).toBeVisible({ timeout: 15000 });

    // Both messages should be visible
    const userMessages = await webview
      .getByRole("article", { name: "user message" })
      .count();
    expect(userMessages).toBe(2);
  });
});
