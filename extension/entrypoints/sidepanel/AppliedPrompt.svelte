<script lang="ts">
  import { Button, Card } from 'freehire-design-system';
  import type { AppliedJob } from './applied.svelte';

  let { job, saving, onConfirm, onDismiss }: {
    job: AppliedJob;
    saving: boolean;
    onConfirm: (title: string, company: string) => void;
    onDismiss: () => void;
  } = $props();

  let title = $state('');
  let company = $state('');
</script>

<Card class="applied-prompt">
  <p class="question">Did you submit your application?</p>
  {#if job.title && job.company}
    <p class="job">{job.title} · {job.company}</p>
  {:else}
    <div class="job-details">
      {#if !job.title}
        <label>Job title <input bind:value={title} maxlength="200" disabled={saving} /></label>
      {:else}
        <span>{job.title}</span>
      {/if}
      {#if !job.company}
        <label>Company <input bind:value={company} maxlength="200" disabled={saving} /></label>
      {:else}
        <span>{job.company}</span>
      {/if}
    </div>
  {/if}
  <div class="actions">
    <Button variant="ghost" size="sm" onclick={onDismiss} disabled={saving}>Not yet</Button>
    <Button
      variant="primary"
      size="sm"
      onclick={() => onConfirm(job.title || title, job.company || company)}
      disabled={saving || !(job.title || title.trim()) || !(job.company || company.trim())}
    >
      {saving ? 'Saving…' : 'Mark as applied'}
    </Button>
  </div>
</Card>

<style>
  /* Same inset as the other cards in the panel. */
  :global(.applied-prompt) {
    padding: 14px;
  }

  .question {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  .job {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--muted-foreground);
  }

  .job-details, .job-details label {
    display: grid;
    gap: 4px;
    margin-top: 6px;
    font-size: 12px;
  }

  .job-details input {
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--foreground);
    padding: 4px 6px;
  }

  .actions {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
