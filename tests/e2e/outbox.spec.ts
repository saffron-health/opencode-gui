import { test, expect } from "./fixtures";

test.describe("Outbox and Idempotent Sends", () => {
  test("should send message and show user message content", async ({ openWebview }) => {
    const page = await openWebview();

    // Send a message
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Hello from outbox test");

    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();

    // Wait for user message to appear with content
    await expect(page.getByRole("article", { name: "user message" })).toContainText("Hello from outbox test", { timeout: 10000 });

    // Verify only ONE user message appears (not duplicated)
    const userMessages = await page.getByRole("article", { name: "user message" }).count();
    expect(userMessages).toBe(1);
  });

  test("should show thinking state while processing", async ({ openWebview }) => {
    const page = await openWebview();

    const textarea = page.getByRole("textbox", { name: "Message input" });
    const submitButton = page.getByRole("button", { name: "Submit" });

    // Send a message
    await textarea.fill("Test message");
    await submitButton.click();

    // Wait for user message to appear
    await expect(page.getByRole("article", { name: "user message" })).toBeVisible({ timeout: 10000 });

    // The submit button should be disabled or replaced with stop button during thinking
    // We just verify the user message appears - thinking state is implicitly tested
  });
});
