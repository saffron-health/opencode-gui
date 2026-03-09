import { test, expect } from "./fixtures";

const QUESTION_PROMPT = `Use the question tool now and ask exactly 3 questions, then wait for my answers before doing anything else.
Requirements:
1) Q1 must be single-select with options: Alpha, Beta, Gamma.
2) Q2 must be multi-select with options: Red, Green, Blue.
3) Q3 must allow a custom typed answer (free text).
Do not call any other tools before all 3 questions are asked.`;

test.describe("Question Prompt Flow", () => {
  test.setTimeout(180000);

  test("renders accordion flow and submits combined answers", async ({
    openWebview,
    getServerLogEntries,
  }) => {
    const page = await openWebview();

    const textarea = page.getByRole("textbox", { name: "Message input" });
    await textarea.fill(QUESTION_PROMPT);
    await page.getByRole("button", { name: "Submit" }).click();

    const questionGroup = page.getByRole("group", { name: "Question request" });
    await expect(questionGroup).toBeVisible({ timeout: 120000 });

    const accordions = page.locator(".question-prompt__accordion");
    await expect(accordions).toHaveCount(3, { timeout: 60000 });
    await expect(accordions.nth(0)).toHaveAttribute("aria-expanded", "true");

    // Switch away to a new session and back to ensure pending questions persist.
    await page.getByRole("button", { name: "New session" }).click();
    await page.getByRole("button", { name: "Switch session" }).click();
    const previousSession = page.locator(".session-item:not(.current)").first();
    await expect(previousSession).toBeVisible({ timeout: 10000 });
    await previousSession.click();
    await expect(questionGroup).toBeVisible({ timeout: 120000 });

    const items = page.locator(".question-prompt__item");

    // Q1 single-select
    await items.nth(0).locator(".question-prompt__option").first().click();
    await expect(accordions.nth(1)).toHaveAttribute("aria-expanded", "true");

    // Q2 multi-select (one choice is enough for submit gating)
    await items.nth(1).locator(".question-prompt__option").first().click();
    await expect(accordions.nth(2)).toHaveAttribute("aria-expanded", "true");

    // Reopen Q1 and change answer to verify editability.
    await accordions.nth(0).click();
    const q1Options = items.nth(0).locator(".question-prompt__option");
    if ((await q1Options.count()) > 1) {
      await q1Options.nth(1).click();
    }

    // Q3 custom answer when available, fallback to option.
    await accordions.nth(2).click();
    const customInput = items.nth(2).locator(".question-prompt__custom-input");
    if (await customInput.isVisible()) {
      await customInput.fill("Custom demo answer");
      await items.nth(2).locator(".question-prompt__custom-button").click();
    } else {
      await items.nth(2).locator(".question-prompt__option").first().click();
    }

    const submit = questionGroup.getByRole("button", { name: "Submit" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(questionGroup).not.toBeVisible({ timeout: 60000 });

    const logEntries = getServerLogEntries();
    const askedEvents = logEntries.filter(
      (entry) => entry.service === "bus" && entry.metadata.type === "question.asked"
    );
    const repliedEvents = logEntries.filter(
      (entry) => entry.service === "bus" && entry.metadata.type === "question.replied"
    );

    expect(askedEvents.length).toBeGreaterThan(0);
    expect(repliedEvents.length).toBeGreaterThan(0);
  });
});
