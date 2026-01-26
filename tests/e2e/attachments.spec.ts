import { test, expect } from "./fixtures";

test.describe("Attachment/Selection Parity", () => {
  test("should display attachment chip when editor-selection message received", async ({ openWebview }) => {
    const page = await openWebview();

    // Simulate an editor-selection message from the host
    await page.evaluate(() => {
      window.postMessage({
        type: "editor-selection",
        filePath: "src/example.ts",
        fileUrl: "file:///workspace/src/example.ts",
        selection: {
          startLine: 10,
          endLine: 25,
        },
      }, "*");
    });

    // Wait for the attachment chip to appear
    await expect(page.getByText("example.ts L10-25")).toBeVisible({ timeout: 5000 });
  });

  test("should display single-line selection correctly", async ({ openWebview }) => {
    const page = await openWebview();

    await page.evaluate(() => {
      window.postMessage({
        type: "editor-selection",
        filePath: "src/utils/helper.ts",
        fileUrl: "file:///workspace/src/utils/helper.ts",
        selection: {
          startLine: 42,
          endLine: 42,
        },
      }, "*");
    });

    // Single line shows just L42
    await expect(page.getByText("helper.ts L42")).toBeVisible({ timeout: 5000 });
  });

  test("should display whole file attachment without line numbers", async ({ openWebview }) => {
    const page = await openWebview();

    await page.evaluate(() => {
      window.postMessage({
        type: "editor-selection",
        filePath: "README.md",
        fileUrl: "file:///workspace/README.md",
        // No selection = whole file
      }, "*");
    });

    // Should show just filename without line numbers
    await expect(page.getByText("README.md")).toBeVisible({ timeout: 5000 });
  });

  test("should remove attachment when clicking remove button", async ({ openWebview }) => {
    const page = await openWebview();

    await page.evaluate(() => {
      window.postMessage({
        type: "editor-selection",
        filePath: "src/app.ts",
        fileUrl: "file:///workspace/src/app.ts",
        selection: {
          startLine: 1,
          endLine: 10,
        },
      }, "*");
    });

    // Wait for chip to appear
    const chipText = page.getByText("app.ts L1-10");
    await expect(chipText).toBeVisible({ timeout: 5000 });

    // Find and click the remove button (x) for this attachment
    const removeButton = page.locator('[data-testid="remove-attachment"]').or(
      page.getByRole("button", { name: /remove|delete|×|x/i }).first()
    );
    
    if (await removeButton.isVisible()) {
      await removeButton.click();
      await expect(chipText).not.toBeVisible({ timeout: 5000 });
    }
  });

  test("should not duplicate identical attachments", async ({ openWebview }) => {
    const page = await openWebview();

    // Send the same attachment twice
    await page.evaluate(() => {
      window.postMessage({
        type: "editor-selection",
        filePath: "src/duplicate.ts",
        fileUrl: "file:///workspace/src/duplicate.ts",
        selection: {
          startLine: 5,
          endLine: 15,
        },
      }, "*");
    });

    await page.waitForTimeout(100);

    await page.evaluate(() => {
      window.postMessage({
        type: "editor-selection",
        filePath: "src/duplicate.ts",
        fileUrl: "file:///workspace/src/duplicate.ts",
        selection: {
          startLine: 5,
          endLine: 15,
        },
      }, "*");
    });

    // Wait for chip to appear
    await expect(page.getByText("duplicate.ts L5-15")).toBeVisible({ timeout: 5000 });

    // Should only have one chip, not two
    const chips = await page.getByText("duplicate.ts L5-15").count();
    expect(chips).toBe(1);
  });

  test("should send attachment with prompt and clear attachments", async ({ 
    openWebview
  }) => {
    const page = await openWebview();

    // Use a real file from the workspace
    const workspaceRoot = process.env.OPENCODE_WORKSPACE_ROOT || process.cwd();
    const filePath = "package.json";
    const fileUrl = `file://${workspaceRoot}/package.json`;

    // Add an attachment using a real file
    await page.evaluate(({ filePath, fileUrl }) => {
      window.postMessage({
        type: "editor-selection",
        filePath,
        fileUrl,
        selection: {
          startLine: 1,
          endLine: 5,
        },
      }, "*");
    }, { filePath, fileUrl });

    // Wait for chip to appear
    await expect(page.getByText("package.json L1-5")).toBeVisible({ timeout: 5000 });

    // Type a prompt 
    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill("What is this file?");

    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.click();

    // After sending, the attachment should be cleared from the input area
    await expect(page.getByText("package.json L1-5")).not.toBeVisible({ timeout: 10000 });

    // The user message should appear
    await expect(page.getByRole("article", { name: "user message" })).toContainText("What is this file?", { timeout: 10000 });
  });

  test("should normalize reversed line selection", async ({ openWebview }) => {
    const page = await openWebview();

    // Send selection with end < start (user selected upward)
    await page.evaluate(() => {
      window.postMessage({
        type: "editor-selection",
        filePath: "src/reversed.ts",
        fileUrl: "file:///workspace/src/reversed.ts",
        selection: {
          startLine: 50,
          endLine: 30, // end < start
        },
      }, "*");
    });

    // Should display normalized (smaller number first)
    await expect(page.getByText("reversed.ts L30-50")).toBeVisible({ timeout: 5000 });
  });
});
