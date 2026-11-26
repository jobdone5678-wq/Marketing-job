import { describe, it, expect } from 'vitest';
import {
  US_STATE_CODES,
  extractCountryCodeFromLocation,
  matchesCountry,
  resolveCountryCode,
  resolveCountryName,
} from './countryResolver';

describe('countryResolver', () => {
  it('disambiguates US state codes from overlapping ISO country codes in location and state contexts', () => {
    expect(US_STATE_CODES.has('CA')).toBe(true);
    expect(US_STATE_CODES.has('IN')).toBe(true);

    // Location context: CA (California) and IN (Indiana) resolve to 'us', never Canada or India
    expect(resolveCountryCode('San Francisco, CA')).toBe('us');
    expect(resolveCountryCode('San Francisco, CA', { fieldKind: 'location' })).toBe('us');
    expect(resolveCountryCode('Indianapolis, IN')).toBe('us');
    expect(resolveCountryCode('Indianapolis, IN', { fieldKind: 'location' })).toBe('us');
    expect(resolveCountryCode('Wilmington, DE', { fieldKind: 'location' })).toBe('us');
    expect(resolveCountryCode('Boston, Massachusetts', { fieldKind: 'location' })).toBe('us');
    expect(resolveCountryCode('CA', { fieldKind: 'location' })).toBe('us');
    expect(resolveCountryCode('IN', { fieldKind: 'location' })).toBe('us');

    // State context: US state codes/names never resolve to countries
    expect(resolveCountryCode('CA', { fieldKind: 'state' })).toBeUndefined();
    expect(resolveCountryCode('IN', { fieldKind: 'state' })).toBeUndefined();
    expect(resolveCountryCode('California', { fieldKind: 'state' })).toBeUndefined();
    expect(resolveCountryCode('Indiana', { fieldKind: 'state' })).toBeUndefined();

    // Explicit country context or full country names resolve to the country ISO code
    expect(resolveCountryCode('CA', { fieldKind: 'country' })).toBe('ca');
    expect(resolveCountryCode('IN', { fieldKind: 'country' })).toBe('in');
    expect(resolveCountryCode('Canada', { fieldKind: 'location' })).toBe('ca');
    expect(resolveCountryCode('India', { fieldKind: 'location' })).toBe('in');
    expect(resolveCountryCode('Toronto, Canada')).toBe('ca');
    expect(resolveCountryCode('Toronto, ON, Canada')).toBe('ca');
    expect(resolveCountryCode('Bangalore, India')).toBe('in');
  });

  it('extracts country codes from location and deferred combobox strings accurately', () => {
    expect(extractCountryCodeFromLocation('San Francisco, CA')).toBe('us');
    expect(extractCountryCodeFromLocation('Indianapolis, IN')).toBe('us');
    expect(extractCountryCodeFromLocation('Austin, United States')).toBe('us');
    expect(extractCountryCodeFromLocation('[deferred combobox: Toronto, Canada]')).toBe('ca');
    expect(extractCountryCodeFromLocation('[deferred combobox: San Francisco, CA]')).toBe('us');
    expect(extractCountryCodeFromLocation('[deferred combobox]')).toBeUndefined();
    expect(extractCountryCodeFromLocation('Tokyo, JP')).toBe('jp');
    expect(extractCountryCodeFromLocation('Korea, Republic of')).toBe('kr');
    expect(extractCountryCodeFromLocation('Remote')).toBeUndefined();
  });

  it('resolves display names and matches explicit countries without substring collisions', () => {
    expect(resolveCountryName('US')).toBe('United States');
    expect(resolveCountryName('UK')).toBe('United Kingdom');
    expect(resolveCountryName('San Francisco, CA', { fieldKind: 'location' })).toBe('United States');
    expect(matchesCountry('United States of America', 'US')).toBe(true);
    expect(matchesCountry('United Kingdom', 'UK')).toBe(true);
    expect(matchesCountry('California', 'CA')).toBe(false);
    expect(matchesCountry('Indiana', 'IN')).toBe(false);
    expect(matchesCountry('Niger', 'NG')).toBe(false);
  });
});
