import { describe, expect, it } from 'vitest';
import { NotPaypayHistoryError, creditMethodsIn, parseCsv, parsePaypayHistory, summarizePaypayHistory } from './paypayImport';
import { categorizeMerchant, merchantBrand } from './merchants';

const HEADER = 'Date & Time,Amount Outgoing (Yen),Amount Incoming (Yen),Amount Outgoing Overseas,Currency,Exchange Rate (Yen),Country Paid In,Transaction Type,Business Name,Method,Payment Option,User,Transaction ID';

// Made-up rows in the export's format.
const SAMPLE = [
  HEADER,
  '2026/09/28 18:33:51,780,-,-,-,-,-,Payment,マクドナルド - 駅前店,"PayPay Point (1yen), Credit VISA 1234 (779yen)",-,-,1',
  '2026/09/27 16:43:19,"1,290",-,-,-,-,-,Payment,Rocket Now,Credit VISA 1234,One-time Payment,-,2',
  '2026/09/20 09:40:00,600,-,-,-,-,-,Payment,ファミリーマート - 本町店,"PayPay Point (14yen), PayPay Balance (586yen)",-,-,3',
  '2026/09/15 10:55:52,198,-,-,-,-,-,Payment,ファミリーマート - 本町店,Credit VISA 1234,-,-,4',
  '2026/09/08 22:07:29,-,46,-,-,-,-,"Points, Balance Earned",ガスト,PayPay Point,-,-,5',
  '2026/09/04 19:29:28,-,600,-,-,-,JP,Money Received,someone,PayPay Balance,-,-,6',
  '2026/09/03 12:00:00,-,500,-,-,-,-,Refund,Rocket Now,Credit VISA 1234,-,-,7',
  '2026/08/31 12:00:00,"2,000",-,-,-,-,-,Payment,ローソン - 西口,Credit VISA 1234,-,-,8',
].join('\r\n');

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes and a byte order mark', () => {
    expect(parseCsv('﻿a,"b,c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'say "hi"'], ['1', '2', '3']]);
  });
});

describe('PayPay history', () => {
  const payments = parsePaypayHistory(SAMPLE);

  it('keeps payments and refunds, and splits each payment by method', () => {
    expect(payments).toHaveLength(6); // Points earned and money received are not spending
    expect(payments[0]).toMatchObject({ date: '2026-09-28', amount: 780, credit: 779, other: 1, creditMethod: 'Credit VISA 1234' });
    expect(payments[1]).toMatchObject({ amount: 1_290, credit: 1_290, other: 0 });
    expect(payments[2]).toMatchObject({ credit: 0, other: 600, creditMethod: null });
    expect(payments[4]).toMatchObject({ amount: -500, credit: -500 });
    expect(creditMethodsIn(payments)).toEqual(['Credit VISA 1234']);
  });

  it('summarizes each month for the chosen card', () => {
    const [august, september] = summarizePaypayHistory(payments, 'Credit VISA 1234');
    expect(august).toMatchObject({ usageMonth: '2026-08', charged: 2_000, payments: 1 });
    expect(september).toMatchObject({
      usageMonth: '2026-09', firstDate: '2026-09-03', lastDate: '2026-09-28',
      charged: 779 + 1_290 + 198 - 500, paidOtherWays: 1 + 600, payments: 3,
    });
    expect(september.categories).toEqual([
      { label: 'Restaurants and cafes', amount: 779, count: 1 },
      { label: 'Food delivery', amount: 790, count: 1 },
      { label: 'Convenience stores', amount: 198, count: 1 },
    ].sort((a, b) => b.amount - a.amount));
    expect(september.places.map((place) => place.label)).toEqual(['Rocket Now', 'マクドナルド', 'ファミリーマート']);
  });

  it('reads the Japanese export too', () => {
    const japanese = [
      '取引日,出金金額（円）,入金金額（円）,海外出金金額,通貨,変換レート（円）,利用国,取引内容,取引先,取引方法,支払い区分,利用者,取引番号',
      '2026/09/28 18:33:51,780,-,-,-,-,-,支払い,セブン-イレブン - 本町,"PayPayポイント (1円), クレジット VISA 1234 (779円)",-,-,1',
    ].join('\n');
    expect(parsePaypayHistory(japanese)[0]).toMatchObject({ credit: 779, other: 1, creditMethod: 'クレジット VISA 1234' });
  });

  it('rejects other files', () => {
    expect(() => parsePaypayHistory('date,amount\n2026-09-01,100')).toThrow(NotPaypayHistoryError);
  });
});

describe('merchants', () => {
  it('groups common chains', () => {
    expect(categorizeMerchant('セブン-イレブン - 本町')).toBe('Convenience stores');
    expect(categorizeMerchant('ロイヤルフードサービス - ロイヤルホスト')).toBe('Restaurants and cafes');
    expect(categorizeMerchant('SDベンディング')).toBe('Vending machines');
    expect(categorizeMerchant('空手道場 - 本部')).toBe('Sports and hobbies');
    expect(categorizeMerchant('福岡ソフトバンクホークス - ドーム')).toBe('Entertainment');
    expect(categorizeMerchant('Unknown shop')).toBe('Other');
    expect(merchantBrand('ローソン - 西口')).toBe('ローソン');
  });
});
