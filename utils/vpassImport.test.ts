import { describe, expect, it } from 'vitest';
import { NotVpassStatementError, VpassMonth, guessStatementCard, parseVpassStatement } from './vpassImport';
import { categorizeMerchant, merchantBrand, normalizeMerchant } from './merchants';

// Made-up rows in the Vpass statement format.
const SAMPLE = [
  'テスト タロウ様,1234-****-****-5678,三井住友カード',
  "2026/9/28,ＡＭＡＺＯＮ．ＣＯ．ＪＰ,ご本人,１回払い,,'26/10,1500,1500,,,,,",
  "2026/9/20,業務ス－パ－  中央店,ご本人,リボ払い,,'26/10,800,800,,,,,",
  "2026/9/18,ＯＶＥＲＳＥＡＳ  ＳＨＯＰ,ご本人,リボ払い,,'26/10,2000,,,12.34,USD,162.07,09/18",
  "2026/8/31,西部ガス利用料金２０２６／０８,ご本人,リボ払い,,'26/10,3000,3000,,,,,",
  ",リボ払いお支払い,ご本人,,,'26/10,6300,6300,,,,,",
].join('\r\n');

describe('Vpass statement', () => {
  it('reads purchases, the bill and revolving lines', () => {
    const [month] = parseVpassStatement(SAMPLE);
    expect(month).toMatchObject({
      billingMonth: '2026-10',
      usageMonth: '2026-09',
      firstDate: '2026-08-31',
      lastDate: '2026-09-28',
      purchases: 7_300,
      count: 4,
      foreignCount: 1,
      revolving: true,
      billed: 6_300, // The overseas line isn't in this payment
    });
    expect(month.categories.map((category) => category.label)).toEqual(['Utilities', 'Other', 'Shopping', 'Groceries']);
    expect(month.places.map((place) => place.label)).toContain('業務スーパー');
  });

  it('adds up the paid column when there is no total row', () => {
    const [month] = parseVpassStatement(SAMPLE.split('\r\n').slice(0, -1).join('\n'));
    expect(month.billed).toBe(5_300);
  });

  it('rejects other files', () => {
    expect(() => parseVpassStatement('date,amount\n2026-09-01,100')).toThrow(NotVpassStatementError);
  });
});

describe('statement shop names', () => {
  it('normalizes full-width text and katakana dashes', () => {
    expect(normalizeMerchant('ＡＭＡＺＯＮ．ＣＯ．ＪＰ')).toBe('AMAZON.CO.JP');
    expect(normalizeMerchant('業務ス－パ－')).toBe('業務スーパー');
    expect(normalizeMerchant('ラクテンブロ―ドバンド')).toBe('ラクテンブロードバンド');
    expect(normalizeMerchant('セブン-イレブン')).toBe('セブン-イレブン'); // A real hyphen stays
    expect(merchantBrand('セブン-イレブン - 本町')).toBe('セブン-イレブン');
  });

  it('groups statement shops', () => {
    expect(categorizeMerchant('ＪＲ東日本モバイルＳｕｉｃａ●')).toBe('Transport');
    expect(categorizeMerchant('ラクテンモバイルツウシンリヨウ')).toBe('Phone and internet');
    expect(categorizeMerchant('Ａｍａｚｏｎプライム会費')).toBe('Subscriptions');
    expect(categorizeMerchant('ＡＭＡＺＯＮ．ＣＯ．ＪＰ')).toBe('Shopping');
    expect(categorizeMerchant('ユナイテッド・シネマ  中央／ＮＦＣ')).toBe('Entertainment');
    expect(categorizeMerchant('ゆめマ－ト  中央店（食')).toBe('Groceries');
    expect(merchantBrand('イオン九州  ＳＳＭ')).toBe('イオン九州');
    expect(merchantBrand('西部ガス利用料金２０２６／０９')).toBe('西部ガス利用料金');
  });
});

describe('which card a statement belongs to', () => {
  const amazon = { id: 'amazon', name: 'Amazon Mastercard' };
  const olive = { id: 'olive', name: 'Olive' };
  const paypay = { id: 'paypay', name: 'PayPay Card' };
  const cards = [amazon, olive, paypay];
  const month = (places: [string, number][]): VpassMonth => ({
    billingMonth: '2026-11', usageMonth: '2026-10', firstDate: '2026-10-01', lastDate: '2026-10-30', count: places.length, foreignCount: 0,
    revolving: false, billed: null, purchases: places.reduce((sum, [, amount]) => sum + amount, 0),
    categories: [], places: places.map(([label, amount]) => ({ label, amount, count: 1 })),
  });

  it('does not pick the Amazon card for one Amazon order among other shops', () => {
    expect(guessStatementCard([month([['ニトリ', 8000], ['西部ガス利用料金', 4000], ['AMAZON.CO.JP', 1500]])], cards, [])).toBe(olive);
    expect(guessStatementCard([month([['AMAZON.CO.JP', 5000], ['空手', 600]])], cards, [])).toBe(amazon);
  });

  it('prefers the card whose earlier statements had the same shops', () => {
    const earlier = [{ cardId: 'amazon', usageMonth: '2026-09', source: 'vpass', places: [{ label: '西部ガス利用料金', amount: 4000, count: 1 }] }];
    expect(guessStatementCard([month([['西部ガス利用料金', 4100], ['AMAZON.CO.JP', 900]])], cards, earlier)).toBe(amazon);
  });

  it('prefers a card not imported yet for the month', () => {
    const done = [{ cardId: 'olive', usageMonth: '2026-10', source: 'vpass', places: [{ label: 'ニトリ', amount: 1, count: 1 }] }];
    expect(guessStatementCard([month([['ドトール', 500]])], cards, done)).toBe(amazon);
  });
});
