import { describe, expect, it } from "vitest";
import { GatekeeperHarness } from "./Gatekeeper";

type ServerApi = {
	makeDummyCallToServer(args: { count: number }): Promise<number>;
};

type ClientApi = {
	makeDummyCall(args: { count: number }): Promise<number>;
};

class Server implements ServerApi {
	async makeDummyCallToServer(args: { count: number }): Promise<number> {
		return args.count * 2;
	}
}

class Client implements ClientApi {
	constructor(private server: ServerApi) {}

	async makeDummyCall(args: { count: number }): Promise<number> {
		return await this.server.makeDummyCallToServer(args);
	}
}

describe("GatekeeperHarness", () => {
	it("should allow calls to pass through when gates are lowered", async () => {
		const harness = new GatekeeperHarness()
			.add("server", () => new Server())
			.add("client", ({ server }) => new Client(server));

		harness.lowerAllGates();

		const result = await harness.client.call.makeDummyCall({ count: 5 });
		expect(result).toBe(10);
	});

	it("should intercept calls at enter gate and allow manual control", async () => {
		const harness = new GatekeeperHarness()
			.add("server", () => new Server())
			.add("client", ({ server }) => new Client(server));

		harness.raiseAllGates();

		// Call via .call proceeds automatically - only internal calls are intercepted
		const callPromise = harness.client.call.makeDummyCall({ count: 5 });

		// The client's internal call to server is what we intercept
		const serverCall = await harness.server.waitForCall("makeDummyCallToServer");
		expect(serverCall.args).toEqual([{ count: 5 }]);

		await serverCall.proceed();
		await serverCall.deliverActual();

		const result = await callPromise;
		expect(result).toBe(10);
	});

	it("should allow overriding return value with fulfill", async () => {
		const harness = new GatekeeperHarness()
			.add("server", () => new Server())
			.add("client", ({ server }) => new Client(server));

		harness.raiseAllGates();

		const callPromise = harness.client.call.makeDummyCall({ count: 5 });

		const serverCall = await harness.server.waitForCall("makeDummyCallToServer");

		await serverCall.fulfill(42);

		const result = await callPromise;
		expect(result).toBe(42);
	});

	it("should allow throwing errors with reject", async () => {
		const harness = new GatekeeperHarness()
			.add("server", () => new Server())
			.add("client", ({ server }) => new Client(server));

		harness.raiseAllGates();

		const callPromise = harness.client.call.makeDummyCall({ count: 5 });

		const serverCall = await harness.server.waitForCall("makeDummyCallToServer");

		await serverCall.reject(new Error("Simulated error"));

		await expect(callPromise).rejects.toThrow("Simulated error");
	});

	it("should timeout when waiting for a call that never arrives", async () => {
		const harness = new GatekeeperHarness()
			.add("server", () => new Server())
			.add("client", ({ server }) => new Client(server));

		harness.raiseAllGates();

		await expect(
			harness.server.waitForCall("makeDummyCallToServer", { timeout: 100 })
		).rejects.toThrow("Timeout waiting for call");
	});

	it("should handle multiple sequential calls", async () => {
		const harness = new GatekeeperHarness()
			.add("server", () => new Server())
			.add("client", ({ server }) => new Client(server));

		harness.raiseAllGates();

		const call1Promise = harness.client.call.makeDummyCall({ count: 1 });
		const call2Promise = harness.client.call.makeDummyCall({ count: 2 });

		const serverCall1 = await harness.server.waitForCall("makeDummyCallToServer");
		expect(serverCall1.args).toEqual([{ count: 1 }]);
		await serverCall1.proceed();
		await serverCall1.deliverActual();

		const serverCall2 = await harness.server.waitForCall("makeDummyCallToServer");
		expect(serverCall2.args).toEqual([{ count: 2 }]);
		await serverCall2.proceed();
		await serverCall2.deliverActual();

		expect(await call1Promise).toBe(2);
		expect(await call2Promise).toBe(4);
	});

	it("should throw if deliverActual is called before proceed", async () => {
		const harness = new GatekeeperHarness()
			.add("server", () => new Server())
			.add("client", ({ server }) => new Client(server));

		harness.raiseAllGates();

		harness.client.call.makeDummyCall({ count: 5 });

		const serverCall = await harness.server.waitForCall("makeDummyCallToServer");

		await expect(serverCall.deliverActual()).rejects.toThrow(
			"Must call proceed() before deliverActual()"
		);
	});
});
