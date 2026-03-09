import { describe, expect, it } from "vitest";
import { createStore } from "solid-js/store";
import { commitBootstrapData, type BootstrapResult } from "./bootstrap";
import { createEmptyState } from "./types";

describe("commitBootstrapData", () => {
  it("commits questionMap into store question state", () => {
    const [store, setStore] = createStore(createEmptyState());

    const data: BootstrapResult = {
      agents: [],
      sessions: [],
      messageList: [],
      partMap: {},
      permissionMap: {},
      questionMap: {
        "ses-1": [
          {
            id: "req-1",
            sessionID: "ses-1",
            questions: [
              {
                header: "Q1",
                question: "What should we do?",
                options: [{ label: "A", description: "Option A" }],
              },
            ],
          },
        ],
      },
      sessionStatusMap: {},
      contextInfo: null,
      fileChanges: null,
    };

    commitBootstrapData(data, null, setStore);

    expect(store.question["ses-1"]).toHaveLength(1);
    expect(store.question["ses-1"]?.[0]?.id).toBe("req-1");
  });
});
