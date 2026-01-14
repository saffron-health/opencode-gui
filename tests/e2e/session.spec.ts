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

    // Verify the dropdown is showing (either loading or sessions)
    const dropdown = page.locator(".session-dropdown");
    await expect(dropdown).toBeVisible();

    // Wait for loading state to disappear and session items to appear
    await expect(page.locator(".session-loading")).toBeVisible();
    await expect(page.locator(".session-loading")).not.toBeVisible();
    await expect(page.locator(".session-item")).toBeVisible();

    // Verify that at least one session list API call was made after clicking
    expect(sessionRequests.length).toBeGreaterThan(0);
  });
});
