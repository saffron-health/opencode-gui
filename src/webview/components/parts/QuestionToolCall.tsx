import { Show, createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import type { MessagePart, Permission } from "../../types";
import type { QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2/client";
import { QuestionPrompt } from "../QuestionPrompt";
import { GenericToolCall } from "./GenericToolCall";
import { useSync } from "../../state/sync";
import { useOpenCode } from "../../hooks/useOpenCode";
import { findQuestionRequest } from "./questionToolMatching";

interface QuestionToolCallProps {
  part: MessagePart;
  workspaceRoot?: string;
  pendingPermissions?: Accessor<Map<string, Permission>>;
  pendingQuestions?: Accessor<Map<string, QuestionRequest>>;
  onPermissionResponse?: (
    permissionId: string,
    response: "once" | "always" | "reject",
  ) => void;
  onQuestionSubmit?: (requestId: string, answers: Array<QuestionAnswer>) => void | Promise<void>;
  onQuestionReject?: (requestId: string) => void | Promise<void>;
}

export function QuestionToolCall(props: QuestionToolCallProps) {
  const sync = useSync();
  const { getQuestions } = useOpenCode();
  const [fetchedRequest, setFetchedRequest] = createSignal<QuestionRequest | undefined>(undefined);
  const [showMissingRequestError, setShowMissingRequestError] = createSignal(false);
  const sourceQuestions = createMemo(
    () => props.pendingQuestions?.() ?? sync.aggregatedQuestions()
  );
  const indexedRequest = createMemo(
    () =>
      sync.getQuestionByCallID(props.part.callID) ??
      sync.getQuestionByMessageID(props.part.messageID)
  );
  const request = createMemo(
    () => indexedRequest() ?? findQuestionRequest(props.part, sourceQuestions())
  );
  const activeRequest = createMemo(() => request() ?? fetchedRequest());
  const promptRequest = createMemo(() => {
    if (!props.onQuestionSubmit || !props.onQuestionReject) return undefined;
    return activeRequest();
  });

  const lookupFromServer = async () => {
    const list = await getQuestions();
    if (!list || list.length === 0) return;
    const byId = new Map(list.map((question) => [question.id, question]));
    const match = findQuestionRequest(props.part, byId);
    if (match) {
      setFetchedRequest(match);
    }
  };

  createEffect(() => {
    if (request() || fetchedRequest()) return;

    let cancelled = false;
    void (async () => {
      try {
        await lookupFromServer();
      } catch {
        // Keep generic fallback when pending questions cannot be fetched.
      }
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  });

  createEffect(() => {
    if (activeRequest()) {
      setShowMissingRequestError(false);
      return;
    }

    const status = props.part.state?.status;
    if (status === "pending" || status === "running") {
      setShowMissingRequestError(false);
      return;
    }

    const timer = window.setTimeout(() => {
      if (!activeRequest()) {
        setShowMissingRequestError(true);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  });

  return (
    <Show
      when={promptRequest()}
      fallback={
        <Show
          when={showMissingRequestError()}
          fallback={
            <GenericToolCall
              part={props.part}
              workspaceRoot={props.workspaceRoot}
              pendingPermissions={props.pendingPermissions}
              onPermissionResponse={props.onPermissionResponse}
            />
          }
        >
          <div class="session-error" role="alert">
            Missing question request for this tool call. It may have expired or been rejected.
            <button
              class="permission-button permission-button--quiet"
              style={{ "margin-left": "8px" }}
              onClick={() => {
                setShowMissingRequestError(false);
                void lookupFromServer().catch(() => {
                  setShowMissingRequestError(true);
                });
              }}
            >
              Retry lookup
            </button>
          </div>
        </Show>
      }
    >
      {(request) => (
        <QuestionPrompt
          request={request()}
          onSubmit={props.onQuestionSubmit!}
          onReject={props.onQuestionReject!}
        />
      )}
    </Show>
  );
}
