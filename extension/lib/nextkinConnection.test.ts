import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeMessage } from "./protocol";

const { session, local, tabs, onMessage } = vi.hoisted(() => ({
  session: new Map<string, unknown>(),
  local: new Map<string, unknown>(),
  tabs: new Map<number, { id: number; url: string }>(),
  onMessage: vi.fn(),
}));

vi.mock("wxt/browser", () => {
  const storageArea = (values: Map<string, unknown>) => ({
    get: async (key: string) => ({ [key]: values.get(key) }),
    set: async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) values.set(key, value);
    },
    remove: async (key: string) => {
      values.delete(key);
    },
  });
  return {
    browser: {
      runtime: {
        getURL: (path: string) => "chrome-extension://extension-id" + path,
        onMessage: { addListener: onMessage },
      },
      storage: { session: storageArea(session), local: storageArea(local) },
      tabs: {
        create: async ({ url }: { url: string }) => {
          const tab = { id: 1, url };
          tabs.set(tab.id, tab);
          return tab;
        },
        get: async (id: number) => tabs.get(id),
        update: async (id: number, details: { url?: string }) => {
          const tab = tabs.get(id);
          if (tab && details.url) tab.url = details.url;
        },
        remove: async (id: number) => {
          tabs.delete(id);
        },
        onRemoved: { addListener: vi.fn() },
      },
    },
  };
});

import { registerNextKinConnection } from "./nextkinConnection";
import { CONNECTED_PATH, CONNECTION_KEY, NEXTKIN_ORIGIN, SESSION_KEY } from "./nextkinhr";

const token = "a".repeat(43);
const pair: RuntimeMessage = { kind: "NEXTKINHR_PAIRED", token };
const sidePanel = { url: "chrome-extension://extension-id/sidepanel.html" };
const sender = { tab: { id: 1 }, frameId: 0, origin: NEXTKIN_ORIGIN };
const send = (message: RuntimeMessage, from: object) => onMessage.mock.calls[0]![0](message, from);

beforeEach(() => {
  session.clear();
  local.clear();
  tabs.clear();
  onMessage.mockReset();
  registerNextKinConnection();
});

afterEach(() => vi.unstubAllGlobals());

describe("NextKinHR connection", () => {
  it("accepts a verified credential from the sign-in tab and closes that tab", async () => {
    const fetch = vi.fn(async () => Response.json({ actorId: "candidate", candidates: [] }));
    vi.stubGlobal("fetch", fetch);

    await send({ kind: "CONNECT_NEXTKINHR" }, sidePanel);
    expect(tabs.get(1)?.url).toBe(NEXTKIN_ORIGIN + "/auth/jobseeker");
    tabs.set(1, { id: 1, url: NEXTKIN_ORIGIN + CONNECTED_PATH });
    await send(pair, sender);

    expect(fetch).toHaveBeenCalledWith(
      NEXTKIN_ORIGIN + "/api/extension/candidates?savedOnly=true",
      expect.objectContaining({ headers: { Authorization: "Bearer " + token } }),
    );
    expect(local.get(SESSION_KEY)).toEqual({ token, userId: "candidate" });
    expect(session.has(CONNECTION_KEY)).toBe(false);
    expect(tabs.has(1)).toBe(false);
  });

  it("ignores the handoff outside the sign-in tab, trusted origin, and connected page", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await send({ kind: "CONNECT_NEXTKINHR" }, sidePanel);
    tabs.set(2, { id: 2, url: NEXTKIN_ORIGIN + CONNECTED_PATH });
    await send(pair, { ...sender, tab: { id: 2 } });
    await send(pair, sender);
    tabs.set(1, { id: 1, url: NEXTKIN_ORIGIN + CONNECTED_PATH });
    await send(pair, { ...sender, origin: "https://other.example" });
    await send(pair, { ...sender, frameId: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(local.has(SESSION_KEY)).toBe(false);
  });

  it("keeps the extension disconnected when the server rejects the credential", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "Expired" }, { status: 401 }));
    await send({ kind: "CONNECT_NEXTKINHR" }, sidePanel);
    tabs.set(1, { id: 1, url: NEXTKIN_ORIGIN + CONNECTED_PATH });
    await send(pair, sender);
    expect(local.has(SESSION_KEY)).toBe(false);
    expect(session.get(CONNECTION_KEY)).toMatchObject({ error: expect.any(String) });
  });
});
