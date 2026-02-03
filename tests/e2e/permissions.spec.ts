import { test, expect } from "./fixtures";

// Restrictive permission config for testing - ask for everything  
const restrictiveConfig = {
  model: "anthropic/claude-sonnet-4-5-20250929",
  permission: "ask",
  agents: {
    "*": {
      permission: "ask"
    }
  }
};

// Permission tests are skipped by default because they depend on 
// AI behavior (whether the model decides to use a tool that needs permission).
// Enable these tests manually when testing permission flows.
test.describe.skip("Permissions", () => {
  test.beforeEach(async () => {
    // Clean up any test files from previous runs
    const fs = await import("fs");
    const path = await import("path");
    const testFile = path.join(process.cwd(), "tests", "sandbox", "test-permission.txt");
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });
  test("should show permission card when tool needs approval", async ({ openWebview }) => {
    const page = await openWebview({ opencodeConfig: restrictiveConfig });
    
    // Send a prompt that will trigger a tool call requiring permission
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Create a new file called test-permission.txt with the content 'hello world'");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for permission card to appear
    const permissionGroup = page.getByRole("group", { name: "Permission request" });
    await expect(permissionGroup).toBeVisible({ timeout: 30000 });
    
    // Permission buttons should be visible
    await expect(page.getByRole("button", { name: "Allow once" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
  });

  test("should allow approving permission once", async ({ openWebview }) => {
    const page = await openWebview({ opencodeConfig: restrictiveConfig });
    
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Run the command: echo 'hello from e2e test'");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for permission card
    const permissionGroup = page.getByRole("group", { name: "Permission request" });
    await expect(permissionGroup).toBeVisible({ timeout: 30000 });
    
    // Click allow once
    await page.getByRole("button", { name: "Allow once" }).click();
    
    // Permission card should disappear
    await expect(permissionGroup).not.toBeVisible({ timeout: 5000 });
  });

  test("should allow rejecting permission", async ({ openWebview }) => {
    const page = await openWebview({ opencodeConfig: restrictiveConfig });
    
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Run the command: echo 'this will be rejected'");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for permission card
    const permissionGroup = page.getByRole("group", { name: "Permission request" });
    await expect(permissionGroup).toBeVisible({ timeout: 30000 });
    
    // Click reject
    await page.getByRole("button", { name: "Reject" }).click();
    
    // Permission card should disappear
    await expect(permissionGroup).not.toBeVisible({ timeout: 5000 });
  });

  test("should show inline permission for external directory", async ({ openWebview }) => {
    const page = await openWebview({ opencodeConfig: restrictiveConfig });
    
    // Send a prompt that will try to edit a file outside the workspace
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("Edit the file /tmp/test-external.txt and add the line 'hello world'");
    
    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();
    
    // Wait for permission prompt to appear (inline with tool or standalone)
    const permissionGroup = page.getByRole("group", { name: "Permission request" });
    await expect(permissionGroup).toBeVisible({ timeout: 30000 });
    
    // Should have the external directory message
    await expect(page.locator(".permission-prompt__message")).toContainText(/allow access|tmp/i);
    
    // Permission buttons should be visible
    await expect(page.getByRole("button", { name: "Allow once" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Allow always" })).toBeVisible();
    
    // Approve the permission
    await page.getByRole("button", { name: "Allow once" }).click();
    
    // Permission should disappear
    await expect(permissionGroup).not.toBeVisible({ timeout: 5000 });
    
    // Tool should complete
    await expect(page.locator(".tool-result")).toBeVisible({ timeout: 10000 });
  });
});
