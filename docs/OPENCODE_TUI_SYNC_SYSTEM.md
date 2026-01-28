# OpenCode TUI Sync System - Deep Dive

This document provides a comprehensive analysis of the OpenCode TUI's real-time synchronization system, based on the source code at [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode).

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [State Management & Store Structure](#2-state-management--store-structure)
3. [ID Generation System](#3-id-generation-system)
4. [SSE Event Subscription](#4-sse-event-subscription)
5. [Event Batching & Optimization](#5-event-batching--optimization)
6. [Event Handlers](#6-event-handlers)
7. [Bootstrap/Initialization](#7-bootstrapinitialization)
8. [Binary Search & Data Structures](#8-binary-search--data-structures)
9. [Memory Optimizations](#9-memory-optimizations)
10. [Error Handling & Reconnection](#10-error-handling--reconnection)
11. [Implications for VS Code Extension](#11-implications-for-vs-code-extension)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         TUI Client                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │ UI Components│◄───│ SyncProvider │◄───│ SDKProvider        │ │
│  │ (Solid.js)  │    │ (Store)     │    │ (SSE + HTTP)       │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│         │                  │                     │              │
│         ▼                  ▼                     ▼              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Solid.js Store (Reactive State)                ││
│  │  message[sessionID][], part[messageID][], session[], ...    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                    SSE Stream + HTTP
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Server                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │ /event      │◄───│ GlobalBus   │◄───│ Session/Message     │ │
│  │ (SSE)       │    │ (Pub/Sub)   │    │ (Business Logic)    │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Key Components:**
- **SDKProvider**: Manages SSE connection, event batching, HTTP client
- **SyncProvider**: Maintains reactive store, handles all event types
- **Solid.js Store**: Fine-grained reactive state with `createStore()`
- **GlobalBus**: Server-side pub/sub for broadcasting events

---

## 2. State Management & Store Structure

**Source**: [`packages/opencode/src/cli/cmd/tui/context/sync.tsx`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/context/sync.tsx#L35-L103)

```typescript
interface SyncStore {
  status: "loading" | "partial" | "complete"
  
  // Providers & Config
  provider: Provider[]
  provider_default: Record<string, string>
  provider_auth: Record<string, ProviderAuthMethod[]>
  agent: Agent[]
  command: Command[]
  config: Config
  
  // Sessions
  session: Session[]                              // Sorted by ID
  session_status: { [sessionID: string]: SessionStatus }
  session_diff: { [sessionID: string]: FileDiff[] }
  
  // Messages & Parts (indexed by parent ID)
  message: { [sessionID: string]: Message[] }     // Sorted by ID within session
  part: { [messageID: string]: Part[] }           // Sorted by ID within message
  
  // Permissions & Questions (per session)
  permission: { [sessionID: string]: PermissionRequest[] }
  question: { [sessionID: string]: QuestionRequest[] }
  
  // Misc
  todo: { [sessionID: string]: Todo[] }
  lsp: LspStatus[]
  mcp: { [key: string]: McpStatus }
  vcs: VcsInfo | undefined
  path: Path
}
```

**Design Principles:**
- **Nested indexing**: Messages indexed by `sessionID`, parts by `messageID` for O(1) parent lookup
- **Sorted arrays**: All arrays sorted by ID for O(log n) binary search
- **Status tracking**: Three-phase loading (loading → partial → complete)

---

## 3. ID Generation System

**Source**: [`packages/opencode/src/id/id.ts`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/id/id.ts)

This is **critical** for understanding why binary search works. OpenCode uses **sortable timestamp-based IDs**, NOT random UUIDs.

### ID Format

```
{prefix}_{12-char-hex-timestamp}_{13-char-base62-random}

Examples:
  msg_018dc5a2b3f4abcdefghijk    (message)
  ses_018dc5a2b3f4xyzwvutsrqp    (session)
  prt_018dc5a2b3f4mnopqrstuvw    (part)
```

### Generation Algorithm

```typescript
const prefixes = {
  session: "ses",
  message: "msg",
  permission: "per",
  question: "que",
  part: "prt",
  // ...
}

let lastTimestamp = 0
let counter = 0

function create(prefix: keyof typeof prefixes, descending: boolean, timestamp?: number): string {
  const currentTimestamp = timestamp ?? Date.now()

  // Monotonic counter: increment within same millisecond
  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp
    counter = 0
  }
  counter++

  // Encode timestamp + counter in 48 bits (6 bytes)
  let now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter)

  // Optionally invert for descending sort order
  now = descending ? ~now : now

  // Convert to 12 hex characters
  const timeBytes = Buffer.alloc(6)
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff))
  }

  return prefixes[prefix] + "_" + timeBytes.toString("hex") + randomBase62(13)
}

// Two modes:
export const ascending = (prefix) => create(prefix, false)   // Newer IDs sort after older
export const descending = (prefix) => create(prefix, true)   // Newer IDs sort before older
```

### Why This Matters

| Property | UUID v4 | OpenCode ID |
|----------|---------|-------------|
| Sortable by time | ❌ Random | ✅ Yes |
| Binary search works | ❌ No | ✅ Yes |
| Collision resistant | ✅ Yes | ✅ Yes (timestamp + counter + random) |
| Extractable timestamp | ❌ No | ✅ Yes |

**Extracting timestamp from ID:**
```typescript
export function timestamp(id: string): number {
  const prefix = id.split("_")[0]
  const hex = id.slice(prefix.length + 1, prefix.length + 13)
  const encoded = BigInt("0x" + hex)
  return Number(encoded / BigInt(0x1000))
}
```

---

## 4. SSE Event Subscription

**Source**: [`packages/opencode/src/cli/cmd/tui/context/sdk.tsx`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/context/sdk.tsx#L57-L85)

### Client-Side SSE Loop

```typescript
while (true) {
  if (abort.signal.aborted) break
  
  // Connect to /event endpoint
  const events = await sdk.event.subscribe({}, { signal: abort.signal })
  
  // Process events as they arrive
  for await (const event of events.stream) {
    handleEvent(event)
  }
  
  // Stream ended (disconnected) - loop will reconnect
  if (timer) clearTimeout(timer)
  if (queue.length > 0) flush()
}
```

### Server-Side SSE Handler

**Source**: [`packages/opencode/src/server/routes/global.ts`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/server/routes/global.ts#L65-L104)

```typescript
streamSSE(c, async (stream) => {
  // Send initial connection event
  stream.writeSSE({
    data: JSON.stringify({
      payload: { type: "server.connected", properties: {} }
    })
  })

  // Subscribe to GlobalBus and forward events
  async function handler(event: any) {
    await stream.writeSSE({ data: JSON.stringify(event) })
  }
  GlobalBus.on("event", handler)

  // Heartbeat every 30s (prevents WKWebView 60s timeout)
  const heartbeat = setInterval(() => {
    stream.writeSSE({
      data: JSON.stringify({
        payload: { type: "server.heartbeat", properties: {} }
      })
    })
  }, 30000)

  // Cleanup on disconnect
  await new Promise<void>((resolve) => {
    stream.onAbort(() => {
      clearInterval(heartbeat)
      GlobalBus.off("event", handler)
      resolve()
    })
  })
})
```

---

## 5. Event Batching & Optimization

**Source**: [`packages/opencode/src/cli/cmd/tui/context/sdk.tsx`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/context/sdk.tsx#L25-L55)

The TUI uses **adaptive batching** to balance latency vs. render efficiency:

```typescript
let queue: Event[] = []
let timer: Timer | undefined
let last = 0  // Timestamp of last flush

const flush = () => {
  if (queue.length === 0) return
  const events = queue
  queue = []
  timer = undefined
  last = Date.now()
  
  // Process all events in a single Solid.js batch
  batch(() => {
    for (const event of events) {
      emitter.emit(event.type, event)
    }
  })
}

const handleEvent = (event: Event) => {
  queue.push(event)
  const elapsed = Date.now() - last
  
  if (timer) return  // Already have a pending flush
  
  if (elapsed < 16) {
    // Flushed recently - batch with upcoming events
    timer = setTimeout(flush, 16)
    return
  }
  
  // Been a while - flush immediately for responsiveness
  flush()
}
```

**Why 16ms?**
- 60 FPS = 16.67ms per frame
- Events within same frame are batched together
- Immediate flush if >16ms since last batch (avoids latency)

---

## 6. Event Handlers

**Source**: [`packages/opencode/src/cli/cmd/tui/context/sync.tsx`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/context/sync.tsx#L107-L326)

### Complete Event Type Reference

| Event | Description | Handler Action |
|-------|-------------|----------------|
| `server.connected` | SSE connection established | Log to console |
| `server.heartbeat` | Keep-alive (30s interval) | No-op |
| `server.instance.disposed` | Server instance cleanup | Full bootstrap |
| `session.created` | New session | Insert with binary search |
| `session.updated` | Session modified | Update or insert |
| `session.deleted` | Session removed | Remove from array |
| `session.status` | Status changed (idle, busy) | Update status map |
| `session.diff` | File diffs computed | Update diff map |
| `message.updated` | Message created/changed | Insert + memory limit |
| `message.removed` | Message deleted | Remove + clean parts |
| `message.part.updated` | Part created/changed | Insert at sorted position |
| `message.part.removed` | Part deleted | Remove from array |
| `permission.asked` | Permission needed | Insert with binary search |
| `permission.replied` | Permission answered | Remove from array |
| `question.asked` | Question asked | Insert with binary search |
| `question.replied` | Question answered | Remove from array |
| `todo.updated` | Todos changed | Replace array |
| `lsp.updated` | LSP status changed | Refetch from server |
| `vcs.branch.updated` | Git branch changed | Update VCS info |

### Example: message.updated Handler

```typescript
case "message.updated": {
  const messages = store.message[event.properties.info.sessionID]
  
  if (!messages) {
    // First message for this session
    setStore("message", event.properties.info.sessionID, [event.properties.info])
    break
  }
  
  // Binary search for existing or insertion point
  const result = Binary.search(messages, event.properties.info.id, (m) => m.id)
  
  if (result.found) {
    // Update existing message
    setStore("message", event.properties.info.sessionID, result.index, 
             reconcile(event.properties.info))
    break
  }
  
  // Insert at correct sorted position
  setStore(
    "message",
    event.properties.info.sessionID,
    produce((draft) => {
      draft.splice(result.index, 0, event.properties.info)
    })
  )
  
  // Memory optimization: keep only last 100 messages
  const updated = store.message[event.properties.info.sessionID]
  if (updated.length > 100) {
    const oldest = updated[0]
    batch(() => {
      setStore("message", event.properties.info.sessionID, 
               produce((draft) => { draft.shift() }))
      setStore("part", produce((draft) => { delete draft[oldest.id] }))
    })
  }
  break
}
```

---

## 7. Bootstrap/Initialization

**Source**: [`packages/opencode/src/cli/cmd/tui/context/sync.tsx`](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/context/sync.tsx#L331-L410)

Bootstrap uses a **two-phase loading strategy**:

### Phase 1: Blocking (Critical Data)

```typescript
async function bootstrap() {
  const start = Date.now() - 30 * 24 * 60 * 60 * 1000  // 30 days ago
  
  // Start all requests in parallel
  const sessionListPromise = sdk.client.session.list({ start })
  const providersPromise = sdk.client.config.providers()
  const agentsPromise = sdk.client.app.agents()
  const configPromise = sdk.client.config.get()
  
  // Wait for critical data
  await Promise.all([providersPromise, agentsPromise, configPromise])
  
  // Update store in single batch
  batch(() => {
    setStore("provider", reconcile(providers))
    setStore("agent", reconcile(agents))
    setStore("config", reconcile(config))
  })
  
  setStore("status", "partial")  // UI can now render
```

### Phase 2: Non-Blocking (Optional Data)

```typescript
  // Continue loading in background
  Promise.all([
    sessionListPromise.then(sessions => setStore("session", reconcile(sessions))),
    sdk.client.command.list().then(x => setStore("command", reconcile(x.data))),
    sdk.client.lsp.status().then(x => setStore("lsp", reconcile(x.data))),
    sdk.client.mcp.status().then(x => setStore("mcp", reconcile(x.data))),
    sdk.client.formatter.status().then(x => setStore("formatter", reconcile(x.data))),
    sdk.client.vcs.get().then(x => setStore("vcs", reconcile(x.data))),
  ]).then(() => {
    setStore("status", "complete")
  })
}
```

**Status Progression:**
1. `loading` → Initial state, show loading indicator
2. `partial` → Core data ready, UI can render
3. `complete` → All data loaded

---

## 8. Binary Search & Data Structures

**Source**: [`packages/util/src/binary.ts`](https://github.com/anomalyco/opencode/blob/main/packages/util/src/binary.ts)

```typescript
export namespace Binary {
  export function search<T>(
    array: T[],
    id: string,
    compare: (item: T) => string
  ): { found: boolean; index: number } {
    let left = 0
    let right = array.length - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const midId = compare(array[mid])

      if (midId === id) {
        return { found: true, index: mid }
      } else if (midId < id) {
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    // Not found: 'left' is the insertion point
    return { found: false, index: left }
  }
}
```

**Usage Pattern:**

```typescript
const result = Binary.search(array, id, (item) => item.id)

if (result.found) {
  // Update existing item at result.index
  setStore(..., result.index, reconcile(newItem))
} else {
  // Insert new item at result.index (maintains sort order)
  setStore(..., produce((draft) => {
    draft.splice(result.index, 0, newItem)
  }))
}
```

**Complexity:**
- Search: O(log n)
- Insert: O(log n) search + O(n) splice
- Update: O(log n) search + O(1) update

---

## 9. Memory Optimizations

### Message Limit (100 per session)

```typescript
// After inserting new message
const updated = store.message[sessionID]
if (updated.length > 100) {
  const oldest = updated[0]
  batch(() => {
    // Remove oldest message
    setStore("message", sessionID, produce((draft) => { draft.shift() }))
    // Clean up associated parts
    setStore("part", produce((draft) => { delete draft[oldest.id] }))
  })
}
```

### Session Time Filter (30 days)

```typescript
const start = Date.now() - 30 * 24 * 60 * 60 * 1000
const sessions = await sdk.client.session.list({ start })
```

### Reconciliation for Deep Merging

Solid.js `reconcile()` performs efficient deep merging, only updating changed properties:

```typescript
setStore("session", result.index, reconcile(event.properties.info))
// Only re-renders components that depend on changed fields
```

---

## 10. Error Handling & Reconnection

### Automatic SSE Reconnection

The SSE loop automatically reconnects when the stream ends:

```typescript
while (true) {
  if (abort.signal.aborted) break
  const events = await sdk.event.subscribe({}, { signal: abort.signal })
  for await (const event of events.stream) {
    handleEvent(event)
  }
  // Stream ended - loop continues and reconnects
}
```

### Bootstrap Error Handling

```typescript
.catch(async (e) => {
  Log.Default.error("tui bootstrap failed", {
    error: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  })
  await exit(e)  // Fatal: exit on bootstrap failure
})
```

### Server Instance Disposed

When server restarts, client receives `server.instance.disposed` and re-bootstraps:

```typescript
case "server.instance.disposed":
  bootstrap()
  break
```

---

## 11. Implications for VS Code Extension

### Current Issue

Our VS Code extension was using `crypto.randomUUID()` for client-generated message IDs:

```typescript
const messageID = `msg_${crypto.randomUUID()}`
// Example: msg_f2da5263-65ed-400c-9bb8-a29c24c0cbc5
```

UUIDs are NOT lexicographically sortable, so binary search produced wrong insertion points, causing messages to appear out of order.

### Solutions

**Option A: Use linear search + append (current fix)**
- Replace `binarySearch` with `findById` for messages/parts
- Append new items with `push()` instead of `splice()`
- Works because SSE events arrive in order

**Option B: Implement sortable IDs (matches TUI)**
- Port the ID generation from `packages/opencode/src/id/id.ts`
- Client-generated IDs would be sortable
- Binary search would work correctly

### Recommendation

For now, **Option A is sufficient** because:
1. The server-generated IDs ARE sortable
2. Client-generated IDs are only used for optimistic UI
3. SSE events arrive in chronological order

If we need true offline-first support or optimistic updates with correct ordering, implement Option B.

---

## References

- [sync.tsx - SyncProvider](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/context/sync.tsx)
- [sdk.tsx - SDKProvider & SSE](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/context/sdk.tsx)
- [id.ts - Sortable ID generation](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/id/id.ts)
- [binary.ts - Binary search utility](https://github.com/anomalyco/opencode/blob/main/packages/util/src/binary.ts)
- [global.ts - Server SSE handler](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/server/routes/global.ts)
- [message-v2.ts - Message/Part storage](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/session/message-v2.ts)
