Create a spec sheet for the given feature/fix request in specs/ directory.

Ultrathink. Follow the following steps:

## Understand existing code

Use `finder` and `Grep` as much as possible to deeply understand all of the relevant code. Be smart about your code search: start with where you think it might be, and if that inspires different places to read, follow up with sub-agents to do so. Each sub-agent should give you back information, and potentially other files to read or searches that might be relevant.

## Understand external documentation/libraries

If external libraries are involved, always look up and research their relevant documentation as well. Tend to adhere strictly to the examples and best practices provided by the external libraries.

## Ask good questions

The feature/fix request from the user will not always be completely defined. There may be logical errors embedded or important clairfications required before the spec can continue. Examples of these may be of the form "How can I retrieve that data over here?" or "This seems like it will require a major rewrite" or "This feels like it will require lots of duplication". You are a talented software engineer who prioritizes clean, simple, readable code -- if something seems like it's going to spiral into complexity, bring up the concern to the user. That being said, don't feel like you _have_ to ask questions. If the feature request is defined and straightforward, go ahead and just write the spec -- only involve the user if it seems like something is egregiously wrong. Practice good judgement.

## Write an effective spec

Follow the guidelines specified below:

### Spec Structure

Specs should always have the following form:

#### Problem overview

A couple plain English sentences describing the problem: either a bug, or a feature request, or a refactor to be done with motivation

#### Solution overview

A couple plain English sentences describing the proposed solution.

#### Success criteria

A set of natural language test cases to assert the goal was correctly implemented. Test cases can be for the frontend or the backend or any individual package. Test cases always take the following form:

- Test name
  1. steps
  2. to
  3. follow
  4. Usually ending up with some assertion

You can have multiple tests, but it should always be the minimum set in order to consider the original goal fully completed.

#### Important files/docs for implementation

A list of all the files that are involved in the implementation. Also included should be any docs files or external links to documentation.

#### Implementation

A nested to-do list of all of the tasks to be done for a successful implementation. The top-level todos should often be high-level, such as "Implement new `streamChat` route in backend`. As it recursively gets lower, it should be more lower-level like specific file edits. Here are some examples:

```
- [ ] Add gender and age fields to the provider search input schema and database queries.
  - [ ] Add `gender` parameter to `searchProvidersInput` schema in [`apps/api/src/tools/searchProviders.ts`](apps/api/src/tools/searchProviders.ts) as optional `z.enum(["M", "F"])`
  - [ ] Add `ageFilter` parameter using structured object with optional `min_age` and `max_age` integer fields
  - [ ] Add gender filtering logic to the database query using `eq(providers.gender, gender)` when gender is provided
  - [ ] Add age range filtering logic using `gte(providers.age, min_age)` and `lte(providers.age, max_age)` when age filters are provided
```

```
- [ ] Update the frontend to include a new assistant pane with chat functionality and context awareness.
  - [ ] Create Assistant Pane UI & Logic
    - [ ] apps/web/src/components/AssistantPane.tsx: Create a new component for the AI chat interface, managing its own state for messages and loading status, and calling the backend with useApiClient.
  - [ ] Integrate Assistant Pane into Application
    - [ ] apps/web/src/App.tsx: Add the AssistantPane component to the right sidebar in the main application layout.
  - [ ] Implement Context Gathering
    - [ ] apps/web/src/components/AssistantPane.tsx: Fetch the current taskId from the URL using the useRoute("/task/:taskId") hook. Query the local database for task, patient, and document context to prepend to the chat history.
  - [ ] Refactor State Management
    - [ ] Remove the AIContext abstraction to simplify the architecture.
      - [ ] apps/web/src/contexts/AIContext.tsx: Delete this file.
      - [ ] apps/web/src/components/Providers.tsx: Remove the AIProvider from the provider tree.
      - [ ] apps/web/src/components/AssistantPane.tsx: Consolidate all state management logic directly within the component.
```

#### Sanity checklist

These should always be the following task items, to be done after a spec is implemented

```
- [ ] Run `pnpm type-check` to ensure all TypeScript types are correct
- [ ] Run `pnpm build` to ensure all packages compile successfully
- [ ] Run `pnpm lint` to verify no linting errors
- [ ] Ensure all written code adheres to the quality documentation in AGENT.md
- [ ] If this spec involves frontend changes, test the web app with Playwright using the instructions in AGENT.md
- [ ] Update this spec to mark all tasks as completed
```

### What to avoid in the spec

- Avoid any mobile code
- Avoid creating new UI components unless absolutely necessary to the core functionality. Use design system components as much as possible.
- Avoid any performance optimization unless specifically requested
