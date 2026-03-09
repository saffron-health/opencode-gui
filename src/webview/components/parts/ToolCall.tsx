import { Match, Show, Switch, createMemo, type Accessor } from "solid-js";
import type { MessagePart, Permission } from "../../types";
import type { QuestionAnswer, QuestionRequest } from "@opencode-ai/sdk/v2/client";
import { ReadToolCall } from "./ReadToolCall";
import { EditToolCall } from "./EditToolCall";
import { GrepToolCall } from "./GrepToolCall";
import { GlobToolCall } from "./GlobToolCall";
import { BashToolCall } from "./BashToolCall";
import { ListToolCall } from "./ListToolCall";
import { WebfetchToolCall } from "./WebfetchToolCall";
import { TodoToolCall } from "./TodoToolCall";
import { TaskToolCall } from "./TaskToolCall";
import { GenericToolCall } from "./GenericToolCall";
import { QuestionToolCall } from "./QuestionToolCall";
import { QuestionPrompt } from "../QuestionPrompt";
import { findQuestionRequest } from "./questionToolMatching";

interface ToolCallProps {
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

export function ToolCall(props: ToolCallProps) {
  const tool = () => props.part.tool as string;
  const inlineQuestionRequest = createMemo(() =>
    findQuestionRequest(props.part, props.pendingQuestions?.())
  );
  const reactiveInlineQuestion = createMemo(() => {
    if (!props.onQuestionSubmit || !props.onQuestionReject) return undefined;
    return inlineQuestionRequest();
  });

  return (
    <Show
      when={reactiveInlineQuestion()}
      fallback={
        <Switch>
          <Match when={tool() === "read"}>
            <ReadToolCall {...props} />
          </Match>
          <Match when={tool() === "edit" || tool() === "write"}>
            <EditToolCall {...props} />
          </Match>
          <Match when={tool() === "grep"}>
            <GrepToolCall {...props} />
          </Match>
          <Match when={tool() === "glob"}>
            <GlobToolCall {...props} />
          </Match>
          <Match when={tool() === "bash"}>
            <BashToolCall {...props} />
          </Match>
          <Match when={tool() === "list"}>
            <ListToolCall {...props} />
          </Match>
          <Match when={tool() === "webfetch"}>
            <WebfetchToolCall {...props} />
          </Match>
          <Match when={tool() === "todowrite" || tool() === "todoread"}>
            <TodoToolCall {...props} />
          </Match>
          <Match when={tool() === "task"}>
            <TaskToolCall {...props} />
          </Match>
          <Match when={tool() === "question"}>
            <QuestionToolCall {...props} />
          </Match>
          <Match when={true}>
            <GenericToolCall {...props} />
          </Match>
        </Switch>
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
