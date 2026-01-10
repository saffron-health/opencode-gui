import { test, expect } from "./fixtures";

// Permission tests are skipped by default because they depend on 
// AI behavior (whether the model decides to use a tool that needs permission).
// Enable these tests manually when testing permission flows.
test.describe("Permissions", () => {
  test.skip("should show permission card when tool needs approval", async ({ openWebview }) => {
    const page = await openWebview();
    
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

  test.skip("should allow approving permission once", async ({ openWebview }) => {
    const page = await openWebview();
    
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

  test.skip("should allow rejecting permission", async ({ openWebview }) => {
    const page = await openWebview();
    
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
});
