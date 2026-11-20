import { browser } from "wxt/browser";
import {
  CONNECTED_PATH,
  CONNECTION_KEY,
  NEXTKIN_ORIGIN,
  SESSION_KEY,
  TOKEN_PATTERN,
  readCandidate,
  type NextKinConnection,
} from "./nextkinhr";
import type { RuntimeMessage } from "./protocol";

const getConnection = async () =>
  (await browser.storage.session.get(CONNECTION_KEY))[CONNECTION_KEY] as
    | NextKinConnection
    | undefined;

export function registerNextKinConnection() {
  let connecting = false;
  let pairing = false;

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    if (
      message?.kind === "CONNECT_NEXTKINHR" &&
      sender.url === browser.runtime.getURL("/sidepanel.html")
    ) {
      return connect();
    }
    if (
      message?.kind === "NEXTKINHR_PAIRED" &&
      sender.tab?.id !== undefined &&
      sender.frameId === 0 &&
      (!sender.origin || sender.origin === NEXTKIN_ORIGIN)
    ) {
      return complete(sender.tab.id, message.token);
    }
    return undefined;
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    const connection = await getConnection();
    if (connection?.tabId === tabId && !pairing && !connection.error) {
      await browser.storage.session.remove(CONNECTION_KEY);
    }
  });

  async function connect() {
    if (connecting || pairing) return {};
    connecting = true;
    try {
      const pending = await getConnection();
      if (pending && !pending.error && pending.expiresAt > Date.now()) {
        const tab = await browser.tabs.get(pending.tabId).catch(() => null);
        if (tab) {
          await browser.tabs.update(pending.tabId, { active: true });
          return {};
        }
      }

      // Record the tab before loading NextKinHR, so even a fast sign-in can be matched.
      const { id } = await browser.tabs.create({ url: "about:blank", active: true });
      if (id === undefined) throw new Error("Chrome did not open a sign-in tab.");
      await browser.storage.session.set({
        [CONNECTION_KEY]: { tabId: id, expiresAt: Date.now() + 30 * 60_000 },
      });
      await browser.tabs.update(id, { url: `${NEXTKIN_ORIGIN}/auth/jobseeker` });
      return {};
    } catch {
      await browser.storage.session.remove(CONNECTION_KEY);
      return { error: "Could not open NextKinHR sign-in. Try again." };
    } finally {
      connecting = false;
    }
  }

  async function complete(tabId: number, token: string) {
    if (pairing || typeof token !== "string" || !TOKEN_PATTERN.test(token)) return;
    pairing = true;
    try {
      const connection = await getConnection();
      if (
        !connection ||
        connection.tabId !== tabId ||
        connection.expiresAt <= Date.now() ||
        connection.error
      )
        return;
      const tab = await browser.tabs.get(tabId).catch(() => null);
      if (!tab?.url) return;
      const url = new URL(tab.url);
      if (url.origin !== NEXTKIN_ORIGIN || url.pathname !== CONNECTED_PATH) return;

      try {
        const { actorId } = await readCandidate(token);
        if (!actorId) throw new Error("Missing candidate account.");
        await browser.storage.local.set({ [SESSION_KEY]: { token, userId: actorId } });
      } catch {
        await browser.storage.session.set({
          [CONNECTION_KEY]: {
            ...connection,
            error: "Could not verify your NextKinHR connection. Try again.",
          },
        });
        return;
      }
      await browser.storage.session.remove(CONNECTION_KEY);
      // Close only the sign-in tab opened for this connection, if still on the handoff page.
      if ((await browser.tabs.get(tabId).catch(() => null))?.url === tab.url) {
        await browser.tabs.remove(tabId).catch(() => {});
      }
    } finally {
      pairing = false;
    }
  }
}
