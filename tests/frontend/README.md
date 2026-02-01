# Frontend Unit Tests with Gatekeeper

This directory contains unit tests for the frontend client using the Gatekeeper approach.

## What is Gatekeeper?

Gatekeeper is a testing utility that allows you to intercept and control method calls on objects. It acts as a "gate" between the caller and the actual implementation, giving you fine-grained control over:

1. **Method arguments** - Inspect what arguments were passed
2. **Execution flow** - Control when methods execute
3. **Return values** - Mock responses without calling the real implementation
4. **Error handling** - Simulate errors and edge cases

## Usage Patterns

### Pattern 1: No Interception (Gates Down)

Use this when you want the real implementation to run without any mocking:

```typescript
const harness = new GatekeeperHarness()
  .add("api", () => new MyApi());

harness.lowerAllGates(); // No interception

const result = await (harness as any).api.someMethod();
// Real method was called
```

### Pattern 2: Full Mock (fulfill/reject)

Use this when you want to completely replace the implementation:

```typescript
harness.raiseAllGates(); // Enable interception

const resultPromise = (harness as any).api.someMethod("arg");

const call = await (harness as any).api.waitForCall("someMethod");
expect(call.args).toEqual(["arg"]);

// Return mocked value
await call.fulfill("mocked result");

const result = await resultPromise;
expect(result).toBe("mocked result");
```

### Pattern 3: Inspect and Proceed

Use this when you want to verify arguments but still run the real implementation:

```typescript
harness.raiseAllGates();

const resultPromise = (harness as any).api.someMethod("arg");

const call = await (harness as any).api.waitForCall("someMethod");
expect(call.args[0]).toBe("arg"); // Verify

await call.proceed(); // Run real implementation
await call.deliverActual(); // Return real result

const result = await resultPromise;
// Real result is returned
```

## Test Files

- **simple-bootstrap.test.ts** - Basic examples showing all three patterns
- **bootstrap.test.ts** - Comprehensive bootstrap testing with complex scenarios
- **message-handling.test.ts** - Tests for message processing utilities

## Why Use Gatekeeper?

Traditional frontend tests often require:
- Setting up complex mock servers
- Dealing with network timing issues
- Managing state across async operations

With Gatekeeper:
- ✅ No network required - mock at the API boundary
- ✅ Precise control over timing and execution
- ✅ Easy to test error scenarios
- ✅ Can verify implementation details (arguments, call order)
- ✅ Can selectively mock only what you need

## Running Tests

```bash
# Run all frontend tests
pnpm vitest run tests/frontend/

# Run a specific test file
pnpm vitest run tests/frontend/simple-bootstrap.test.ts

# Watch mode
pnpm vitest tests/frontend/
```
