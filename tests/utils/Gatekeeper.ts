type AnyFunction = (...args: any[]) => any;

type ExtractMethods<T> = {
	[K in keyof T]: T[K] extends AnyFunction ? K : never;
}[keyof T];

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: any) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

type CallRecord<TArgs extends any[] = any[], TReturn = any> = {
	id: string;
	method: string;
	args: TArgs;
	enterDeferred: Deferred<void>;
	exitDeferred: Deferred<void>;
	underlyingPromise?: Promise<TReturn>;
	underlyingPromiseReady?: Deferred<void>;
	resultContainer?: { success: true; value: TReturn } | { success: false; error: any };
};

export class CallHandle<TArgs extends any[] = any[], TReturn = any> {
	constructor(private record: CallRecord<TArgs, TReturn>) {}

	get args(): TArgs {
		return this.record.args;
	}

	get method(): string {
		return this.record.method;
	}

	get id(): string {
		return this.record.id;
	}

	async proceed(): Promise<void> {
		this.record.enterDeferred.resolve();
		
		// Wait for the underlying promise to be created
		if (this.record.underlyingPromiseReady) {
			await this.record.underlyingPromiseReady.promise;
		}
		
		if (this.record.underlyingPromise) {
			try {
				const value = await this.record.underlyingPromise;
				this.record.resultContainer = { success: true, value };
			} catch (error) {
				this.record.resultContainer = { success: false, error };
				throw error;
			}
		}
	}

	async deliverActual(): Promise<void> {
		if (!this.record.resultContainer) {
			throw new Error("Must call proceed() before deliverActual()");
		}
		if (this.record.resultContainer.success) {
			this.record.exitDeferred.resolve();
		} else {
			this.record.exitDeferred.reject(this.record.resultContainer.error);
		}
	}

	async fulfill(value: TReturn): Promise<void> {
		this.record.resultContainer = { success: true, value };
		if (this.record.underlyingPromiseReady) {
			// Signal that we don't need the underlying promise
			this.record.underlyingPromise = Promise.resolve(value);
			this.record.underlyingPromiseReady.resolve();
		}
		this.record.enterDeferred.resolve();
		this.record.exitDeferred.resolve();
	}

	async reject(error: any): Promise<void> {
		this.record.resultContainer = { success: false, error };
		if (this.record.underlyingPromiseReady) {
			// Signal that we don't need the underlying promise
			this.record.underlyingPromise = Promise.reject(error);
			this.record.underlyingPromiseReady.resolve();
		}
		this.record.enterDeferred.resolve();
		this.record.exitDeferred.reject(error);
	}
}

type HarnessInterface<T> = {
	call: T; // Direct access, no interception
	intercept: T; // Proxied access, calls can be intercepted with waitForCall
	waitForCall<K extends ExtractMethods<T>>(
		method: K,
		options?: { timeout?: number }
	): T[K] extends AnyFunction
		? Promise<CallHandle<Parameters<T[K]>, Awaited<ReturnType<T[K]>>>>
		: never;
};

type Factory<T, TContext> = (context: TContext) => T;

type HarnessApis<T extends Record<string, any>> = {
	[K in keyof T]: HarnessInterface<T[K]>;
};

export class GatekeeperHarness<TApis extends Record<string, any> = {}> {
	private factories = new Map<string, Factory<any, any>>();
	private instances = new Map<string, any>();
	private proxies = new Map<string, any>();
	private callQueues = new Map<string, CallRecord[]>();
	private pendingWaits = new Map<string, Array<(call: CallRecord) => void>>();
	private gatesRaised = false;

	add<TName extends string, TApi>(
		name: TName,
		factory: Factory<TApi, TApis>
	): GatekeeperHarness<TApis & Record<TName, TApi>> & HarnessApis<TApis & Record<TName, TApi>> {
		if (this.instances.size > 0) {
			throw new Error("Cannot add factories after instances have been built. Call add() before raiseAllGates() or lowerAllGates().");
		}
		this.factories.set(name, factory);
		return this as any;
	}

	private createInterceptProxy<T extends object>(name: string, instance: T): T {
		const callQueues = this.callQueues;
		const pendingWaits = this.pendingWaits;
		const gatesRaised = () => this.gatesRaised;

		// Create intercepting proxy for internal calls between components
		return new Proxy(instance, {
			get: (target, prop, receiver) => {
				const value = Reflect.get(target, prop, receiver);

				if (typeof value === "function") {
					return async (...args: any[]) => {
						const methodKey = `${name}.${String(prop)}`;

						if (!gatesRaised()) {
							return await value.apply(target, args);
						}

						const callId = `${methodKey}-${Date.now()}-${Math.random()}`;
						const enterDeferred = createDeferred<void>();
						const exitDeferred = createDeferred<void>();
						const underlyingPromiseReady = createDeferred<void>();

						const record: CallRecord = {
							id: callId,
							method: methodKey,
							args,
							enterDeferred,
							exitDeferred,
							underlyingPromiseReady,
						};

						const waiters = pendingWaits.get(methodKey) || [];
						if (waiters.length > 0) {
							const waiter = waiters.shift()!;
							waiter(record);
						} else {
							if (!callQueues.has(methodKey)) {
								callQueues.set(methodKey, []);
							}
							callQueues.get(methodKey)!.push(record);
						}

						await enterDeferred.promise;

						// Only create underlying promise if not already set (by fulfill/reject)
						if (!record.underlyingPromise) {
							record.underlyingPromise = Promise.resolve(value.apply(target, args));
							underlyingPromiseReady.resolve();
						}

						await exitDeferred.promise;

						if (!record.resultContainer) {
							throw new Error(
								`Exit gate resolved without result container for ${methodKey}. ` +
								`Call ID: ${callId}. This is likely a bug in GatekeeperHarness.`
							);
						}

						if (record.resultContainer.success) {
							return record.resultContainer.value;
						} else {
							throw record.resultContainer.error;
						}
					};
				}

				return value;
			},
		});
	}

	private createProxy<T extends object>(name: string, instance: T, interceptProxy: T): HarnessInterface<T> {
		return {
			call: instance, // Direct access to the raw instance, no interception
			intercept: interceptProxy, // Proxied access, calls can be intercepted
			waitForCall: (methodName: string, options?: { timeout?: number }) =>
				this.waitForCall(`${name}.${String(methodName)}`, options),
		} as HarnessInterface<T>;
	}

	private buildInstances() {
		const interceptContext: any = {};

		// First pass: create all instances with intercept proxies
		for (const [name, factory] of this.factories.entries()) {
			const instance = factory(interceptContext);
			this.instances.set(name, instance);

			// Create intercept proxy for internal calls
			const interceptProxy = this.createInterceptProxy(name, instance);
			
			// Create harness interface with direct .call access
			const harnessInterface = this.createProxy(name, instance, interceptProxy);
			this.proxies.set(name, harnessInterface);

			// Factories receive intercept proxies so internal calls are intercepted
			interceptContext[name] = interceptProxy;
		}

		// Second pass: define properties on harness
		for (const name of this.factories.keys()) {
			Object.defineProperty(this, name, {
				get: () => this.proxies.get(name),
				enumerable: true,
				configurable: true,
			});
		}
	}

	private async waitForCall(
		methodKey: string,
		options?: { timeout?: number }
	): Promise<CallHandle> {
		const timeout = options?.timeout ?? 5000;

		const queue = this.callQueues.get(methodKey) || [];
		if (queue.length > 0) {
			return new CallHandle(queue.shift()!);
		}

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				const waiters = this.pendingWaits.get(methodKey) || [];
				const index = waiters.indexOf(waiter);
				if (index !== -1) {
					waiters.splice(index, 1);
				}
				const pendingCount = this.pendingWaits.get(methodKey)?.length || 0;
				const queuedCount = this.callQueues.get(methodKey)?.length || 0;
				reject(
					new Error(
						`Timeout waiting for call to ${methodKey} after ${timeout}ms. ` +
						`Pending waiters: ${pendingCount}, Queued calls: ${queuedCount}`
					)
				);
			}, timeout);

			const waiter = (record: CallRecord) => {
				clearTimeout(timeoutId);
				resolve(new CallHandle(record));
			};

			if (!this.pendingWaits.has(methodKey)) {
				this.pendingWaits.set(methodKey, []);
			}
			this.pendingWaits.get(methodKey)!.push(waiter);
		});
	}

	raiseAllGates(): void {
		if (this.instances.size === 0) {
			this.buildInstances();
		}
		this.gatesRaised = true;
	}

	lowerAllGates(): void {
		if (this.instances.size === 0) {
			this.buildInstances();
		}
		this.gatesRaised = false;
	}

	reset(): void {
		this.callQueues.clear();
		this.pendingWaits.clear();
		this.gatesRaised = false;
	}
}
