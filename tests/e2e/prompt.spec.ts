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
});
