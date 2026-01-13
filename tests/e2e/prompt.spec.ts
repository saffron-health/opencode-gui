import { test, expect } from "./fixtures";

test.describe("Prompt Sending", () => {
  test("should show input textarea and submit button", async ({ openWebview }) => {
    const page = await openWebview();
    
    await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
  });

  test("submit button should be disabled when input is empty", async ({ openWebview }) => {
    const page = await openWebview();
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await expect(submitButton).toBeDisabled();
  });

  test("submit button should be enabled when input has text", async ({ openWebview }) => {
    const page = await openWebview();
    
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Hello, OpenCode!");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await expect(submitButton).toBeEnabled();
  });

  test("should send prompt and show user message", async ({ openWebview }) => {
    const page = await openWebview();
    
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("What is 2 + 2?");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for user message to appear
    await expect(page.getByRole("article", { name: "user message" })).toBeVisible({ timeout: 10000 });
    
    // Wait for assistant response
    await expect(page.getByRole("article", { name: "assistant message" })).toBeVisible({ timeout: 30000 });
  });

  test("should receive AI-generated response", async ({ openWebview, serverLogs }) => {
    const page = await openWebview();
    
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Say 'Hello World' and nothing else");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for user message to appear
    await expect(page.getByRole("article", { name: "user message" })).toBeVisible({ timeout: 10000 });
    
    // Wait for assistant response with actual content
    const assistantMessage = page.getByRole("article", { name: "assistant message" });
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });
    
    // Verify the response contains actual AI-generated content
    const messageContent = await assistantMessage.textContent();
    expect(messageContent).toBeTruthy();
    expect(messageContent?.trim().length).toBeGreaterThan(0);
    
    // Verify server logs show AI activity
    const logsText = serverLogs.join("");
    // Should have made API calls or processed AI requests
    expect(logsText.length).toBeGreaterThan(0);
  });
});
