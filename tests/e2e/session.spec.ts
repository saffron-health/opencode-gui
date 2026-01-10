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
    
    const sessionSwitcher = page.getByRole("button", { name: "Switch session" });
    await expect(sessionSwitcher).toBeVisible();
  });
});
