import { test, expect } from "./fixtures";

test.describe("AI Generation", () => {
  test("should generate AI responses with content", async ({ openWebview, getServerLogEntries, searchServerLogEntries }) => {
    const page = await openWebview();
    
    // Send a simple prompt
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Say exactly: 'Test response 123'");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for assistant message
    const assistantMessage = page.getByRole("article", { name: "assistant message" });
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });
    
    // Verify actual content was generated
    const messageContent = await assistantMessage.textContent();
    expect(messageContent).toBeTruthy();
    expect(messageContent?.length).toBeGreaterThan(0);
    
    // Check structured server logs for AI activity
    const logEntries = getServerLogEntries();
    expect(logEntries.length).toBeGreaterThan(0);
    
    // Verify LLM service was invoked
    const llmLogs = searchServerLogEntries({ service: "llm" });
    expect(llmLogs.length).toBeGreaterThan(0);
    
    // Verify streaming happened
    const streamLogs = llmLogs.filter(log => log.message.includes("stream"));
    expect(streamLogs.length).toBeGreaterThan(0);
    
    // Verify message was updated
    const messageLogs = searchServerLogEntries({ service: "bus", metadata: { type: "message.updated" } });
    expect(messageLogs.length).toBeGreaterThan(0);
  });

  test("should handle streaming responses", async ({ openWebview }) => {
    const page = await openWebview();
    
    // Send prompt that should stream
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Count from 1 to 5");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Verify stop button appears (streaming started)
    const stopButton = page.getByRole("button", { name: "Stop" });
    await expect(stopButton).toBeVisible({ timeout: 10000 });
    
    // Wait for completion
    await expect(page.getByRole("button", { name: "Submit" })).toBeVisible({ timeout: 30000 });
    
    // Verify response exists
    const assistantMessage = page.getByRole("article", { name: "assistant message" });
    await expect(assistantMessage).toBeVisible();
  });
});
