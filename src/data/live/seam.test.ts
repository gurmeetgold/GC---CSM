import { describe, it, expect } from 'vitest';
import { UnifiedApiDataSource } from './UnifiedApiDataSource';
import { MergeCrmSource } from './MergeCrmSource';
import { makeMergeClient, makeGongClient } from './__fixtures__/vendorFixtures';

/**
 * SEAM TEST. No vendor field name may leak past the adapter. The domain objects
 * that reach the app must be expressed purely in domain vocabulary — if a raw
 * vendor key ever appears in the serialized output, the adapter has a hole.
 */
const VENDOR_KEYS = [
  'custom_fields',
  'remote_id',
  'remote_created_at',
  'annual_revenue',
  'number_of_employees',
  'crm_account_id',
  'close_date',
  'due_date',
  'modified_at',
  'transcript_summary',
  'Licensed_Seats__c',
  'Active_Users__c',
  'Renewal_Date__c',
];

async function assertNoVendorKeys(source: { listAccounts(): Promise<unknown[]> }, label: string) {
  const accounts = await source.listAccounts();
  const blob = JSON.stringify(accounts);
  for (const key of VENDOR_KEYS) {
    expect(blob.includes(`"${key}"`), `${label}: leaked vendor key "${key}"`).toBe(false);
  }
}

describe('adapter seam (no vendor field names above the adapter)', () => {
  it('UnifiedApiDataSource emits only domain vocabulary', async () => {
    await assertNoVendorKeys(new UnifiedApiDataSource(makeMergeClient(), makeGongClient()), 'unified');
  });

  it('MergeCrmSource emits only domain vocabulary', async () => {
    await assertNoVendorKeys(new MergeCrmSource(makeMergeClient()), 'merge-crm');
  });
});
