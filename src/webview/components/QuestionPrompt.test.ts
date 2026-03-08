import { describe, expect, it } from "vitest";
import {
  applyCustomAnswer,
  createQuestionPromptState,
  isQuestionPromptComplete,
  setCustomInput,
  setExpandedQuestion,
  setSingleAnswer,
  toggleMultiAnswer,
} from "./QuestionPrompt";

describe("QuestionPrompt state helpers", () => {
  it("starts with the first question expanded", () => {
    const state = createQuestionPromptState(3);
    expect(state.expandedIndex).toBe(0);
    expect(state.answers).toEqual([[], [], []]);
  });

  it("auto-advances to the next question after single-select answer", () => {
    const state = createQuestionPromptState(3);
    const next = setSingleAnswer(state, 0, "Option A", 3);

    expect(next.answers[0]).toEqual(["Option A"]);
    expect(next.expandedIndex).toBe(1);
  });

  it("supports reopening and editing prior answers", () => {
    const state = createQuestionPromptState(2);
    const answeredFirst = setSingleAnswer(state, 0, "Option A", 2);
    const reopenedFirst = setExpandedQuestion(answeredFirst, 0, 2);
    const editedFirst = setSingleAnswer(reopenedFirst, 0, "Option B", 2);

    expect(editedFirst.answers[0]).toEqual(["Option B"]);
  });

  it("toggles multi-select answers and can keep multiple values", () => {
    const state = createQuestionPromptState(2);
    const afterFirst = toggleMultiAnswer(state, 0, "A", 2);
    const afterSecond = toggleMultiAnswer(afterFirst, 0, "B", 2);
    const afterToggleOff = toggleMultiAnswer(afterSecond, 0, "A", 2);

    expect(afterSecond.answers[0]).toEqual(["A", "B"]);
    expect(afterToggleOff.answers[0]).toEqual(["B"]);
  });

  it("applies custom answers and uses them in submit payload shape", () => {
    const state = createQuestionPromptState(2);
    const withCustomInput = setCustomInput(state, 0, "Custom answer");
    const withCustom = applyCustomAnswer(withCustomInput, 0, false, 2);
    const complete = setSingleAnswer(withCustom, 1, "Final answer", 2);

    expect(withCustom.answers[0]).toEqual(["Custom answer"]);
    expect(isQuestionPromptComplete(complete, 2)).toBe(true);
    expect(complete.answers).toEqual([["Custom answer"], ["Final answer"]]);
  });

  it("keeps submit disabled until all questions have at least one answer", () => {
    const state = createQuestionPromptState(2);
    const partial = setSingleAnswer(state, 0, "A", 2);

    expect(isQuestionPromptComplete(state, 2)).toBe(false);
    expect(isQuestionPromptComplete(partial, 2)).toBe(false);
  });
});
