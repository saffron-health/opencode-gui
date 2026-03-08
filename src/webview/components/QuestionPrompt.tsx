import { For, Show, createSignal } from "solid-js";
import type {
  QuestionAnswer,
  QuestionRequest,
} from "@opencode-ai/sdk/v2/client";

export interface QuestionPromptProps {
  request: QuestionRequest;
  onSubmit: (requestId: string, answers: Array<QuestionAnswer>) => void | Promise<void>;
  onReject: (requestId: string) => void | Promise<void>;
}

export interface QuestionPromptState {
  expandedIndex: number;
  answers: Array<QuestionAnswer>;
  customInputs: string[];
}

function clampExpandedIndex(index: number, questionCount: number): number {
  if (questionCount <= 0) return 0;
  if (index < 0) return 0;
  if (index >= questionCount) return questionCount - 1;
  return index;
}

function shouldAutoAdvance(
  expandedIndex: number,
  answerIndex: number,
  questionCount: number
): number {
  if (expandedIndex !== answerIndex) return expandedIndex;
  const nextIndex = answerIndex + 1;
  if (nextIndex >= questionCount) return expandedIndex;
  return nextIndex;
}

export function createQuestionPromptState(questionCount: number): QuestionPromptState {
  return {
    expandedIndex: 0,
    answers: Array.from({ length: questionCount }, () => []),
    customInputs: Array.from({ length: questionCount }, () => ""),
  };
}

export function setExpandedQuestion(
  state: QuestionPromptState,
  questionIndex: number,
  questionCount: number
): QuestionPromptState {
  return {
    ...state,
    expandedIndex: clampExpandedIndex(questionIndex, questionCount),
  };
}

export function setSingleAnswer(
  state: QuestionPromptState,
  questionIndex: number,
  answer: string,
  questionCount: number
): QuestionPromptState {
  const answers = [...state.answers];
  answers[questionIndex] = [answer];
  return {
    ...state,
    answers,
    expandedIndex: shouldAutoAdvance(state.expandedIndex, questionIndex, questionCount),
  };
}

export function toggleMultiAnswer(
  state: QuestionPromptState,
  questionIndex: number,
  answer: string,
  questionCount: number
): QuestionPromptState {
  const answers = [...state.answers];
  const existing = answers[questionIndex] ?? [];
  const hasAnswer = existing.includes(answer);
  answers[questionIndex] = hasAnswer
    ? existing.filter((value) => value !== answer)
    : [...existing, answer];

  return {
    ...state,
    answers,
    expandedIndex: shouldAutoAdvance(state.expandedIndex, questionIndex, questionCount),
  };
}

export function setCustomInput(
  state: QuestionPromptState,
  questionIndex: number,
  value: string
): QuestionPromptState {
  const customInputs = [...state.customInputs];
  customInputs[questionIndex] = value;
  return {
    ...state,
    customInputs,
  };
}

export function applyCustomAnswer(
  state: QuestionPromptState,
  questionIndex: number,
  multiple: boolean,
  questionCount: number
): QuestionPromptState {
  const value = state.customInputs[questionIndex]?.trim();
  if (!value) return state;

  const customInputs = [...state.customInputs];
  customInputs[questionIndex] = "";

  if (!multiple) {
    const next = setSingleAnswer(state, questionIndex, value, questionCount);
    return {
      ...next,
      customInputs,
    };
  }

  const withToggle = toggleMultiAnswer(state, questionIndex, value, questionCount);
  return {
    ...withToggle,
    customInputs,
  };
}

export function isQuestionPromptComplete(state: QuestionPromptState, questionCount: number): boolean {
  if (questionCount === 0) return false;
  for (let i = 0; i < questionCount; i++) {
    if (!state.answers[i] || state.answers[i].length === 0) return false;
  }
  return true;
}

function isOptionSelected(selected: QuestionAnswer, label: string): boolean {
  return selected.includes(label);
}

export function QuestionPrompt(props: QuestionPromptProps) {
  const questionCount = props.request.questions.length;
  const [state, setState] = createSignal<QuestionPromptState>(
    createQuestionPromptState(questionCount)
  );
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const handleSubmit = async () => {
    const current = state();
    if (!isQuestionPromptComplete(current, questionCount) || isSubmitting()) return;
    setIsSubmitting(true);
    try {
      await props.onSubmit(props.request.id, current.answers);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (isSubmitting()) return;
    setIsSubmitting(true);
    try {
      await props.onReject(props.request.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div class="question-prompt" role="group" aria-label="Question request">
      <div class="question-prompt__header">Questions</div>
      <div class="question-prompt__items">
        <For each={props.request.questions}>
          {(question, indexAccessor) => {
            const index = indexAccessor();
            const expanded = () => state().expandedIndex === index;
            const selectedAnswers = () => state().answers[index] ?? [];
            const answered = () => selectedAnswers().length > 0;
            const allowCustom = () => question.custom !== false;
            const isMultiple = () => question.multiple === true;

            return (
              <div class={`question-prompt__item ${expanded() ? "is-expanded" : ""}`}>
                <button
                  class={`question-prompt__accordion ${answered() ? "is-answered" : ""}`}
                  onClick={() =>
                    setState((prev) => setExpandedQuestion(prev, index, questionCount))
                  }
                  aria-expanded={expanded()}
                >
                  <span class="question-prompt__title">{question.header}</span>
                  <Show when={answered()}>
                    <span class="question-prompt__status">Answered</span>
                  </Show>
                </button>

                <Show when={expanded()}>
                  <div class="question-prompt__panel">
                    <div class="question-prompt__question">{question.question}</div>

                    <div class="question-prompt__options">
                      <For each={question.options}>
                        {(option) => (
                          <button
                            class={`question-prompt__option ${
                              isOptionSelected(selectedAnswers(), option.label)
                                ? "is-selected"
                                : ""
                            }`}
                            onClick={() =>
                              setState((prev) =>
                                isMultiple()
                                  ? toggleMultiAnswer(prev, index, option.label, questionCount)
                                  : setSingleAnswer(prev, index, option.label, questionCount)
                              )
                            }
                            type="button"
                          >
                            <div class="question-prompt__option-label">{option.label}</div>
                            <div class="question-prompt__option-description">
                              {option.description}
                            </div>
                          </button>
                        )}
                      </For>
                    </div>

                    <Show when={allowCustom()}>
                      <div class="question-prompt__custom">
                        <input
                          class="question-prompt__custom-input"
                          type="text"
                          value={state().customInputs[index] ?? ""}
                          placeholder="Custom answer"
                          onInput={(event) =>
                            setState((prev) =>
                              setCustomInput(
                                prev,
                                index,
                                (event.currentTarget as HTMLInputElement).value
                              )
                            )
                          }
                        />
                        <button
                          class="question-prompt__custom-button"
                          type="button"
                          onClick={() =>
                            setState((prev) =>
                              applyCustomAnswer(prev, index, isMultiple(), questionCount)
                            )
                          }
                        >
                          {isMultiple() ? "Toggle custom" : "Use custom"}
                        </button>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <div class="question-prompt__actions">
        <button
          class="permission-button permission-button--quiet"
          onClick={handleReject}
          disabled={isSubmitting()}
          type="button"
        >
          Reject
        </button>
        <div class="permission-spacer" />
        <button
          class="permission-button permission-button--primary"
          onClick={handleSubmit}
          disabled={!isQuestionPromptComplete(state(), questionCount) || isSubmitting()}
          type="button"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
