/**
 * `XMLHttpRequest`, for the live contract run only, built on `fetch`.
 *
 * The console's `uploadPhoto` is the one request that does not go through
 * `ApiClient`: it needs upload progress, which only `XMLHttpRequest` reports in
 * a browser. Node has `fetch` and no `XMLHttpRequest`, so without this the live
 * run could not call the gateway's real upload code at all — and replacing that
 * call with a hand-rolled `fetch` in the suite would test the suite, not the
 * gateway.
 *
 * Only what `uploadPhoto` touches is implemented: `open`, `setRequestHeader`,
 * `responseType` (`json` or text), `send`, `abort`, `status`, `response`, and
 * the `onload`/`onerror`/`onabort` callbacks. Progress events are never fired;
 * the gateway reports completion itself on load. Installed only when the
 * runtime has no `XMLHttpRequest` of its own.
 */
export function installFetchBackedXhr(): void {
  if (typeof (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest !== 'undefined') return;

  class FetchBackedXhr {
    responseType = '';
    status = 0;
    response: unknown = null;
    readonly upload: { onprogress: ((event: unknown) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;

    #method = 'GET';
    #url = '';
    readonly #headers = new Headers();
    readonly #controller = new AbortController();

    open(method: string, url: string): void {
      this.#method = method;
      this.#url = url;
    }

    setRequestHeader(name: string, value: string): void {
      this.#headers.set(name, value);
    }

    abort(): void {
      this.#controller.abort();
    }

    send(body?: BodyInit | null): void {
      fetch(this.#url, {
        method: this.#method,
        headers: this.#headers,
        body: body ?? null,
        signal: this.#controller.signal,
      }).then(
        async (response) => {
          this.status = response.status;
          const text = await response.text();
          if (this.responseType === 'json') {
            try {
              this.response = text.length > 0 ? JSON.parse(text) : null;
            } catch {
              this.response = null;
            }
          } else {
            this.response = text;
          }
          this.onload?.();
        },
        () => {
          if (this.#controller.signal.aborted) this.onabort?.();
          else this.onerror?.();
        },
      );
    }
  }

  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    value: FetchBackedXhr,
    configurable: true,
    writable: true,
  });
}
