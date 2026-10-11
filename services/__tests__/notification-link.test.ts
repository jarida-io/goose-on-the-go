/**
 * The open-link check. A notification can only open Uber or a maps app: any
 * other scheme or host, or a Google URL outside its maps path, is refused.
 */

import { allowedUrl, linkFromData } from '@/services/notification-link';

const UBER =
  'https://m.uber.com/ul/?action=setPickup&pickup=my_location' +
  '&dropoff[latitude]=-1.319167&dropoff[longitude]=36.927500';

describe('linkFromData', () => {
  it('reads a ride link', () => {
    expect(linkFromData({ action: 'open_url', kind: 'ride', url: UBER, label: 'Open Uber' })).toEqual({
      kind: 'ride',
      url: UBER,
      label: 'Open Uber',
    });
  });

  it('reads a directions link and fills in a missing label', () => {
    const url = 'https://maps.apple.com/?daddr=Kisumu&dirflg=d';
    expect(linkFromData({ action: 'open_url', kind: 'directions', url })).toEqual({
      kind: 'directions',
      url,
      label: 'Open directions',
    });
  });

  it('ignores data with no open_url action', () => {
    expect(linkFromData(undefined)).toBeNull();
    expect(linkFromData({ url: UBER })).toBeNull();
    expect(linkFromData({ action: 'open_app', url: UBER })).toBeNull();
  });

  it('refuses a link on a host it does not know', () => {
    expect(linkFromData({ action: 'open_url', kind: 'ride', url: 'https://evil.example/ul' })).toBeNull();
  });
});

describe('allowedUrl', () => {
  it('accepts the three hosts over https', () => {
    expect(allowedUrl(UBER)).toBe(UBER);
    expect(allowedUrl('https://maps.apple.com/?daddr=Kisumu')).not.toBeNull();
    expect(
      allowedUrl('https://www.google.com/maps/dir/?api=1&destination=Kisumu&travelmode=driving'),
    ).not.toBeNull();
  });

  it('refuses plain http, other schemes and look-alike hosts', () => {
    expect(allowedUrl('http://m.uber.com/ul/')).toBeNull();
    expect(allowedUrl('uber://?action=setPickup')).toBeNull();
    expect(allowedUrl('javascript:alert(1)')).toBeNull();
    expect(allowedUrl('https://m.uber.com.evil.example/ul/')).toBeNull();
    expect(allowedUrl('not a url')).toBeNull();
    expect(allowedUrl(42)).toBeNull();
  });

  it('refuses a google.com link outside maps', () => {
    expect(allowedUrl('https://www.google.com/search?q=x')).toBeNull();
  });

  // Checked as m.uber.com, but iOS opens the raw string on evil.example.
  it('returns the URL it checked, not the string it was given', () => {
    expect(allowedUrl('https://m.uber.com\\@evil.example/')).toBe('https://m.uber.com/@evil.example/');
  });
});
