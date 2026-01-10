import { test, expect } from "./fixtures";

test.describe("Abort Streaming", () => {
  test("should show stop button while streaming", async ({ openWebview }) => {
    const page = await openWebview();
    
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Write a very long story about a dragon");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for stop button to appear (indicates streaming started)
    const stopButton = page.getByRole("button", { name: "Stop" });
    await expect(stopButton).toBeVisible({ timeout: 10000 });
  });

  test("should be able to cancel streaming", async ({ openWebview }) => {
    const page = await openWebview();
    
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Write a very long essay about artificial intelligence and its impact on society");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for stop button
    const stopButton = page.getByRole("button", { name: "Stop" });
    await expect(stopButton).toBeVisible({ timeout: 10000 });
    
    // Click stop
    await stopButton.click();
    
    // Submit button should reappear
    await expect(page.getByRole("button", { name: "Submit" })).toBeVisible({ timeout: 5000 });
  });
});
