/**
 * What a schedule or rule failure says on screen.
 *
 * A 400 from the scheduler names the field it refused, and that is the one
 * case where the Pond's own words are worth showing; the rest fall through to
 * the shared reading, which keeps status codes out of the UI.
 */

import { ApiError } from '@/services/api-client';
import i18n from '@/services/i18n';
import { describeApiError } from '@/view-models/describe-error';
import { describeScheduleError } from '@/view-models/use-schedules';

describe('describeScheduleError', () => {
  it('shows the sentence a 400 came with', () => {
    const e = new ApiError('POST /api/v1/schedules → 400', 400, null, 'invalid cron expression');
    expect(describeScheduleError(e)).toBe('invalid cron expression');
  });

  it('falls back to the shared reading for a 400 that said nothing', () => {
    const e = new ApiError('POST /api/v1/schedules → 400', 400, null);
    expect(describeScheduleError(e)).toBe(describeApiError(e));
  });

  it('says the schedule is gone on a 404', () => {
    expect(describeScheduleError(new ApiError('x', 404, null))).toBe(i18n.t('schedule.errors.gone'));
  });

  /** "scheduler not configured" is permanent, which "busy, try again" would not say. */
  it('says the Pond has no scheduler on a 503', () => {
    expect(describeScheduleError(new ApiError('x', 503, null))).toBe(i18n.t('schedule.errors.noScheduler'));
  });

  /** The connection banner already says it; see describeApiError. */
  it('leaves an unauthorised or unreachable Pond to the banner', () => {
    expect(describeScheduleError(new ApiError('x', 401, null))).toBeNull();
    expect(describeScheduleError(new TypeError('Network request failed'))).toBeNull();
  });
});
