// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FieldEvent } from '@setu/contract';
import { HouseholdScreen } from './HouseholdForm.js';

const tid = (id: string) => screen.getByTestId(id) as HTMLInputElement;
afterEach(cleanup);

describe('HouseholdScreen', () => {
  it('submits a household registration', async () => {
    const submit = vi.fn(async (e: FieldEvent) => (void e, undefined));
    render(<HouseholdScreen submit={submit} />);
    fireEvent.change(tid('household-headName'), { target: { value: 'Asha' } });
    fireEvent.change(tid('household-members'), { target: { value: '4' } });
    fireEvent.click(tid('household-vulnerable-elderly'));
    fireEvent.change(tid('household-needs'), { target: { value: 'water, medicine' } });
    fireEvent.change(tid('field-lat'), { target: { value: '26.14' } });
    fireEvent.change(tid('field-lng'), { target: { value: '91.73' } });
    fireEvent.click(tid('household-submit'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]![0]).toMatchObject({
      type: 'household_registration', headName: 'Asha', members: 4,
      vulnerable: { elderly: true, children: false }, needs: ['water', 'medicine'],
    });
  });

  it('requires a head name', async () => {
    const submit = vi.fn(async () => undefined);
    render(<HouseholdScreen submit={submit} />);
    fireEvent.change(tid('field-lat'), { target: { value: '26.14' } });
    fireEvent.change(tid('field-lng'), { target: { value: '91.73' } });
    fireEvent.click(tid('household-submit'));
    expect(await screen.findByTestId('form-error')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });
});
