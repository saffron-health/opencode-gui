import { test, expect } from "./fixtures";

test.describe("Session Management", () => {
  test("should display message list on load", async ({ openWebview }) => {
    const page = await openWebview();
    await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
  });

  test("should be able to create a new session", async ({ openWebview }) => {
    const page = await openWebview();

    const newSessionButton = page.getByRole("button", { name: "New session" });
    await expect(newSessionButton).toBeVisible();
    await newSessionButton.click();

    // After creating a new session, the message list should be empty
    await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
  });

  test("should show session switcher toggle", async ({ openWebview }) => {
    const page = await openWebview();

    const sessionSwitcher = page.getByRole("button", {
      name: "Switch session",
    });
    await expect(sessionSwitcher).toBeVisible();
  });

  test("should refresh sessions when opening dropdown", async ({
    openWebview,
  }) => {
    const page = await openWebview();

    // First create a session by sending a message so we have something to show
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Test message for session");
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for the response to complete
    await expect(page.getByRole("article", { name: "assistant message" })).toBeVisible({ timeout: 30000 });

    // Click the session switcher to open dropdown
    const sessionSwitcher = page.getByRole("button", {
      name: "Switch session",
    });
    await expect(sessionSwitcher).toBeVisible();

    // Record network requests before opening dropdown
    const sessionRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/session")) {
        sessionRequests.push(request.url());
      }
    });

    // Open the dropdown
    await sessionSwitcher.click();

    // Verify the dropdown is showing
    const dropdown = page.locator(".session-dropdown");
    await expect(dropdown).toBeVisible();

    // Wait for at least one session item to appear (loading may be too fast to catch)
    await expect(page.locator(".session-item").first()).toBeVisible({ timeout: 10000 });

    // Verify that at least one session list API call was made after clicking
    expect(sessionRequests.length).toBeGreaterThan(0);
  });
});
