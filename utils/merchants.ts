// Shop names from card statements and the PayPay app, grouped for
// "where the money went" breakdowns.

export interface MerchantGroup {
  label: string;
  amount: number;
  count: number;
}

/**
 * Comparable form of a shop name: full-width letters and digits become
 * half-width (ＡＭＡＺＯＮ → AMAZON) and the many dash characters used in
 * katakana become ー (業務ス－パ－ → 業務スーパー).
 */
const cleanWidthAndDashes = (name: string) =>
  // A long vowel never follows ン, ッ or ・, so a dash there is a real hyphen (セブン-イレブン).
  name.normalize('NFKC').replace(/([゠-ヿ])[-‐‑‒–—―−ｰ]/g, (_dash, before: string) => (/[ンッ・]/.test(before) ? `${before}-` : `${before}ー`));

export const normalizeMerchant = (name: string) => cleanWidthAndDashes(name).replace(/\s+/g, ' ').trim();

// First matching rule wins. Order matters: Suica top-ups are transport even
// though the name says "mobile", and Prime fees are subscriptions, not Amazon shopping.
const CATEGORY_RULES: [string, RegExp][] = [
  ['Food delivery', /rocket now|uber ?eats|出前館|wolt|\bmenu\b|demae/i],
  ['Convenience stores', /セブン[-ー]?イレブン|ローソン|ファミリーマート|ミニストップ|デイリーヤマザキ|セイコーマート|newdays|ポプラ/i],
  ['Groceries', /イオン|マックスバリュ|西友|ライフ|イトーヨーカドー|サニー|トライアル|ハローデイ|マルショク|ゆめタウン|ゆめマート|業務スーパー|スーパー|ドン・?キホーテ|成城石井|カルディ/i],
  ['Drugstores', /マツモトキヨシ|ウエルシア|ツルハ|サンドラッグ|コスモス|スギ薬局|ダイコク|ドラッグ|薬局/i],
  ['Restaurants and cafes', /マクドナルド|すき家|吉野家|松屋|ガスト|ロイヤル|サイゼリヤ|スターバックス|starbucks|ドトール|タリーズ|コメダ|ケンタッキー|モスバーガー|丸亀|一蘭|やよい軒|大戸屋|ココイチ|くら寿司|スシロー|はま寿司|caf|カフェ|食堂|ラーメン|そば|うどん|寿司|焼肉|居酒屋|亭/i],
  ['Transport', /\bjr\b|jr東日本|jr九州|suica|pasmo|西鉄|地下鉄|交通|タクシー|taxi|\bgo\b|駐車|パーキング|ガソリン|eneos|出光|\betc\b/i],
  ['Utilities', /ガス|電気|電力|でんき|水道|gas\b/i],
  ['Phone and internet', /モバイル|ブロードバンド|ドコモ|docomo|\bau\b|ワイモバイル|ahamo|povo|wimax|光回線|プロバイダ|ocn|nuro/i],
  ['Subscriptions', /プライム会費|prime|netflix|spotify|apple\.com|itunes|google|youtube|disney|hulu|u-next|dazn|adobe|icloud/i],
  ['Sports and hobbies', /空手|道場|武道|ジム|フィットネス|スポーツ|ゴルフ|ボウリング|プール|ヨガ|gym|sports/i],
  ['Entertainment', /ソフトバンクホークス|hub|カラオケ|映画|シネマ|cinema|ゲーム|ライブ|チケット/i],
  ['Shopping', /ダイソー|セリア|ユニクロ|\bgu\b|無印|ニトリ|amazon|楽天市場|ビックカメラ|ヨドバシ|ロフト|ハンズ/i],
  ['Vending machines', /ベンディング|自販機|vending/i],
];

export const categorizeMerchant = (merchant: string) => {
  const name = normalizeMerchant(merchant);
  return CATEGORY_RULES.find(([, rule]) => rule.test(name))?.[0] ?? 'Other';
};

/**
 * One name per place, so branches and monthly bills group together:
 * "ローソン - 平尾一丁目" → "ローソン", "イオン九州  ＳＳＭ" → "イオン九州",
 * "西部ガス利用料金２０２６／０９" → "西部ガス利用料金".
 */
export const merchantBrand = (merchant: string) => {
  const name = cleanWidthAndDashes(merchant);
  const head = name.split(/ - |\s{2,}|／|\//)[0].replace(/[\d\s/年月]+$/, '').trim();
  return head || name.trim();
};

/** Groups amounts by category and by place, largest first. */
export const groupMerchants = (items: { merchant: string; amount: number }[]) => {
  const categories = new Map<string, MerchantGroup>();
  const places = new Map<string, MerchantGroup>();
  for (const item of items) {
    for (const [groups, key] of [[categories, categorizeMerchant(item.merchant)], [places, merchantBrand(item.merchant)]] as const) {
      const group = groups.get(key) ?? { label: key, amount: 0, count: 0 };
      group.amount += item.amount;
      group.count += item.amount > 0 ? 1 : 0;
      groups.set(key, group);
    }
  }
  const rank = (groups: Map<string, MerchantGroup>) => [...groups.values()].filter((group) => group.amount > 0).sort((a, b) => b.amount - a.amount);
  return { categories: rank(categories), places: rank(places).slice(0, 8) };
};
