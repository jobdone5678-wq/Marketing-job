import { describe, it, expect, vi } from 'vitest';
import { startWalk, nextStep, applyStep, skipStep, stopWalk } from './walk';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }));
import { walkFills } from './formWalk';

describe('walk', () => {
  it('offers the labels in the order it was given them', () => {
    let walk = startWalk(['First name', 'Email', 'City']);

    const seen: string[] = [];
    for (;;) {
      const step = nextStep(walk);
      if (!step) break;
      seen.push(step);
      walk = applyStep(walk, step);
    }

    expect(seen).toEqual(['First name', 'Email', 'City']);
  });

  it('is done once every label has been applied', () => {
    let walk = startWalk(['Email']);
    walk = applyStep(walk, 'Email');

    expect(nextStep(walk)).toBeNull();
    expect(walk.done).toEqual(['Email']);
  });

  // The user pressed Stop. What is already on the page stays there — this ends the
  // walk, it does not undo it.
  it('offers nothing more once stopped, and keeps what it applied', () => {
    let walk = startWalk(['First name', 'Email', 'City']);
    walk = applyStep(walk, 'First name');
    walk = applyStep(walk, 'Email');
    walk = stopWalk(walk);

    expect(nextStep(walk)).toBeNull();
    expect(walk.done).toEqual(['First name', 'Email']);
    expect(walk.stopped).toBe(true);
  });

  // A form re-renders mid-walk and drops a question. Skipping it is not the end of
  // the walk — the questions after it are still there to answer.
  it('records a skip and carries on', () => {
    let walk = startWalk(['First name', 'Gone', 'City']);
    walk = applyStep(walk, 'First name');
    walk = skipStep(walk, 'Gone');

    expect(nextStep(walk)).toBe('City');
    walk = applyStep(walk, 'City');
    expect(walk.done).toEqual(['First name', 'City']);
    expect(walk.skipped).toEqual(['Gone']);
  });

  it('has nothing to offer for an empty plan', () => {
    const walk = startWalk([]);

    expect(nextStep(walk)).toBeNull();
    expect(walk.done).toEqual([]);
  });

  it('skips requiresReview fills without writing and passes fieldId on answered hook', async () => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ kind: 'FILL_OUTCOMES', outcomes: [{ fieldId: 'f0:email', label: 'Email', status: 'filled' }] });
    const answered = vi.fn();
    vi.useFakeTimers();
    try {
      const pending = walkFills(
        [
          { fieldId: 'f0:review', label: 'Citizen check', value: 'Yes', requiresReview: true },
          { fieldId: 'f0:email', label: 'Email', value: 'a@b.io', frame: 0, form: 0 },
        ],
        { filling: vi.fn(), stopped: () => false, wrote: vi.fn(), answered },
      );
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(answered).toHaveBeenCalledWith('Email', 0, 0, 'f0:email');
      expect(result.skipped).toHaveLength(1);
      expect(result.done).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
