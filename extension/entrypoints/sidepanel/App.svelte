<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import type { RuntimeMessage } from '../../lib/protocol';
  import type { PlanRefused } from '../../lib/planRefused';
  import { track } from '../../lib/analytics';
  import { signIn, signOut, getToken, fetchMe, type HireUser } from '../../lib/auth';
  import { getAutofillSettings, saveAutofillSettings, type AutofillSettings } from '../../lib/nextkinhr';
  import { normalizeLabel } from '../../lib/fieldKeys';
  import type { PlanItem } from '../../lib/applyPlan';
  import { runAutofill, saveChosenAnswers, type FillPanel } from '../../lib/formFill';
  import { FormPlan } from './formPlan.svelte';
  import { PageMatch } from './pageMatch.svelte';
  import { isApplicationPageUrl } from '../../lib/pageMatch';
  import { AppliedTracker, type CurrentTab } from './applied.svelte';
  import { answersToOffer, type AnswerOffer } from '../../lib/answerOffer';
  import MatchTab from './MatchTab.svelte';
  import PanelHeader from './PanelHeader.svelte';

  let notices = $state<string[]>([]);
  let user = $state<HireUser | null>(null);
  let authReady = $state(false);
  let authBusy = $state(false);
  let authError = $state('');
  let authGeneration = 0;
  let settingsGeneration = 0;
  let aiSettings = $state<AutofillSettings | null>(null);
  let settingsBusy = $state(false);
  let settingsError = $state('');

  let autofilling = $state(false);
  let walkStop = $state(false);
  let fillController: AbortController | null = null;
  let overrideFill = $state<((signal: AbortSignal) => Promise<void>) | null>(null);
  let autofillRefusal = $state<PlanRefused | null>(null);
  let savingAnswers = $state(false);

  const pageMatch = new PageMatch((notice) => notices.push(notice));
  const form = new FormPlan(() => applied.note());
  let currentTab = $state<CurrentTab>({ id: null, url: '' });
  const applied = new AppliedTracker(form, () => currentTab, (text) => notices.push(text));
  const asksApplied = $derived(applied.asks(autofilling));
  const answerOffers = $derived(autofilling ? [] : answersToOffer(form.formFields, form.autofilled, form.prefilled));

  $effect(() => { pageMatch.keepCard = form.easyApply; });
  $effect(() => {
    if (walkStop) fillController?.abort();
  });

  onMount(() => {
    track('panel_open');
    void restoreSession();

    const refresh = () => {
      cancelPageFill();
      if (user) reloadPage();
    };
    const onUpdated = (id: number, info: { status?: string; url?: string }) => {
      if (id !== currentTab.id) return;
      if (info.status === 'loading' || info.url) cancelPageFill();
      if (info.status === 'complete' || info.url) refresh();
    };
    const onPageMessage = (message: RuntimeMessage, sender: { tab?: { id?: number }; frameId?: number }) => {
      if (!user || sender.tab?.id !== currentTab.id) return;
      if (message.kind === 'FORM_CHANGED') void refreshPlan();
      if (message.kind === 'APPLICATION_SUBMITTING' && typeof sender.tab?.id === 'number') {
        applied.noteSubmitting(sender.tab.id, sender.frameId ?? 0, message.form, message.page, message.answers);
      }
    };
    const onFocus = () => {
      if (!user) return;
      void refreshPlan();
      if (!settingsBusy) void syncSettings();
    };
    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.runtime.onMessage.addListener(onPageMessage);
    window.addEventListener('focus', onFocus);
    return () => {
      authGeneration++;
      settingsGeneration++;
      cancelPageFill();
      applied.reset();
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.runtime.onMessage.removeListener(onPageMessage);
      window.removeEventListener('focus', onFocus);
    };
  });

  function cancelPageFill() {
    fillController?.abort();
    overrideFill = null;
  }

  function reloadPage() {
    form.resetPage();
    applied.tabChanged(null);
    autofillRefusal = null;
    notices = [];
    void pageMatch.load();
    void refreshPlan();
  }

  async function refreshPlan() {
    if (!user) return;
    const auth = authGeneration;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (auth !== authGeneration || !user) return;
    const id = tab?.id ?? null;
    const url = tab?.url ?? '';
    if (currentTab.id !== id) applied.tabChanged(id);
    currentTab = { id, url };
    if (id !== null && isApplicationPageUrl(url)) {
      await form.refresh({ tabId: id, url });
    } else {
      form.resetPage();
    }
  }

  async function restoreSession() {
    const auth = ++authGeneration;
    try {
      const token = await getToken();
      const account = token ? await fetchMe(token) : null;
      if (auth !== authGeneration || !account) return;
      user = account;
      reloadPage();
      void syncSettings();
    } catch (error) {
      if (auth === authGeneration) authError = error instanceof Error ? error.message : 'Could not load your account.';
    } finally {
      if (auth === authGeneration) authReady = true;
    }
  }

  async function handleSignIn() {
    const auth = ++authGeneration;
    authBusy = true;
    authError = '';
    try {
      const account = await fetchMe(await signIn());
      if (auth !== authGeneration) return;
      if (!account) throw new Error('Signed in, but could not load your account.');
      user = account;
      track('sign_in');
      reloadPage();
      void syncSettings();
    } catch (error) {
      if (auth === authGeneration) authError = error instanceof Error ? error.message : 'Sign-in failed.';
    } finally {
      if (auth === authGeneration) {
        authReady = true;
        authBusy = false;
      }
    }
  }

  async function handleSignOut() {
    const auth = ++authGeneration;
    settingsGeneration++;
    cancelPageFill();
    form.resetPage();
    pageMatch.reset();
    applied.reset();
    notices = [];
    user = null;
    aiSettings = null;
    settingsBusy = false;
    settingsError = '';
    authBusy = true;
    try {
      await signOut();
    } finally {
      if (auth === authGeneration) authBusy = false;
    }
  }

  async function syncSettings() {
    const generation = ++settingsGeneration;
    try {
      const token = await getToken();
      if (!token || !user || generation !== settingsGeneration) return;
      const result = await getAutofillSettings(token);
      if (generation === settingsGeneration) {
        aiSettings = result;
        settingsError = '';
      }
    } catch (error) {
      if (generation === settingsGeneration) {
        settingsError = error instanceof Error ? error.message : 'Could not load AI provider mode.';
      }
    }
  }

  async function changeMode(mode: 'server' | 'portal_byok') {
    if (!aiSettings || settingsBusy || autofilling || mode === aiSettings.mode) return;
    const generation = ++settingsGeneration;
    const auth = authGeneration;
    const version = aiSettings.configVersion;
    settingsBusy = true;
    settingsError = '';
    try {
      const token = await getToken();
      if (!token || generation !== settingsGeneration) return;
      const updated = await saveAutofillSettings(mode, version, token);
      if (generation === settingsGeneration) aiSettings = updated;
    } catch (error) {
      if (generation === settingsGeneration) {
        await syncSettings();
        if (auth === authGeneration) settingsError = error instanceof Error ? error.message : 'Could not save AI provider mode.';
      }
    } finally {
      if (auth === authGeneration) settingsBusy = false;
    }
  }

  const fillPanel: FillPanel = {
    notice: (text) => notices.push(text),
    offerOverride: (run) => (overrideFill = run),
    refreshPlan,
    known: (label) => form.autofilled.add(normalizeLabel(label)),
    refused: (error) => (autofillRefusal = error),
    walk: {
      filling: (label) => (form.fillingLabel = label),
      stopped: () => walkStop,
      wrote: () => (form.formFilled = true),
      answered: (label, frame, formIndex) => form.tickOff(label, frame, formIndex),
    },
  };

  async function startFill(run: (token: string, signal: AbortSignal) => Promise<void>) {
    if (autofilling || settingsBusy || !user) return;
    autofilling = true;
    walkStop = false;
    autofillRefusal = null;
    const controller = new AbortController();
    fillController = controller;
    try {
      const token = await getToken();
      if (!token || controller.signal.aborted) return;
      await run(token, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) notices.push(error instanceof Error ? error.message : 'Autofill failed.');
    } finally {
      fillController = null;
      autofilling = false;
    }
  }

  function autofill() {
    if (!user) return;
    void startFill((token, signal) => runAutofill(token, fillPanel, signal));
  }

  async function revealItem(item: PlanItem) {
    const reply = (await browser.runtime.sendMessage({
      kind: 'REVEAL_FIELD',
      request: { label: item.label, frame: item.frame, form: item.form, focus: true },
    } satisfies RuntimeMessage)) as RuntimeMessage | undefined;
    if (reply?.kind === 'REVEAL_RESULT' && !reply.found) {
      notices.push(`"${item.label}" is no longer on this page — the form may have moved on.`);
    }
  }

  async function saveAnswers(chosen: AnswerOffer[]) {
    const token = await getToken();
    if (!token || savingAnswers) return;
    savingAnswers = true;
    try {
      await saveChosenAnswers(chosen, token, {
        notice: (text) => notices.push(text),
        saved: (question) => form.autofilled.add(normalizeLabel(question)),
      });
    } finally {
      savingAnswers = false;
    }
  }

  function runOverrideFill() {
    const run = overrideFill;
    if (!run || autofilling) return;
    overrideFill = null;
    void startFill((_token, signal) => run(signal));
  }
</script>

<div class="app">
  <PanelHeader {user} {authReady} sending={autofilling} {authBusy} {authError} onSignIn={handleSignIn} onSignOut={handleSignOut} />
  <MatchTab
    {user}
    {authReady}
    {pageMatch}
    {form}
    {notices}
    {asksApplied}
    appliedCandidate={applied.candidate}
    savingApplication={applied.saving}
    onConfirmApplication={(title, company) => applied.confirm(title, company)}
    onDismissApplication={() => applied.dismiss()}
    {autofilling}
    bind:walkStop
    {answerOffers}
    {savingAnswers}
    {autofillRefusal}
    {aiSettings}
    {settingsBusy}
    {settingsError}
    hasOverrideFill={overrideFill !== null}
    onNotice={(text) => notices.push(text)}
    onReveal={revealItem}
    onSave={saveAnswers}
    onOverrideFill={runOverrideFill}
    onAutofill={autofill}
    onModeChange={changeMode}
  />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    font-size: 14px;
  }
</style>
