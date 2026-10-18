// バランスに関わる定数はすべてここに置く（docs/SPEC.md, docs/BALANCE.md）。
// 属性・地形の割り当ては data/units.json を正とする。
import units from '../../data/units.json'

export type Attribute = 'ground' | 'flying' | 'crawler'
export type TerrainId = 'plain' | 'sky' | 'rough'

/**
 * 契約企業の効果（実験中。docs/SPEC.md 未決事項）
 * - sumBonus: 自分の契約社の機体は合計値の比較で1機につき+1
 * - flyingOnPlain: 自分の契約社の飛行機は平原でも有利機として扱う
 * - drawTwo: 自分の契約社の機体を置いた手番は2枚引く（手札の上限 contractHandLimit）
 * - scout: 自分の契約社の機体を置いた手番は、山札の上2枚から1枚を選び、残りを山札の下へ
 * - eliteTie: 自分の契約社の機体を2機以上含む編成は、同じ役なら有利機と同じく優先
 */
export type CompanyEffect =
  | 'none'
  | 'sumBonus'
  | 'flyingOnPlain'
  | 'drawTwo'
  | 'scout'
  | 'eliteTie'
  // ここから下はデッキ制（variant = 'decks'）の陣営効果。docs/SPEC_DECK.md
  | 'handSeven' // 手札を factionHandBonus 枚多く持って始める
  | 'straightUp' // 連携編成は役が1段上がる
  | 'tieWin' // 値が同じなら、先に完成させた側ではなく自分が勝つ
  | 'lowSum' // 同じ役なら合計が小さいほうを強いとする（自分の編成の合計を反転して比べる）

/** カード1枚の中身（デッキ制で使う。cardTable[id]） */
export interface CardSpec {
  company: number
  number: number
}

export interface GameConfig {
  /**
   * ルールの型
   * - shared: 共有山札（docs/SPEC.md）
   * - decks: 各自が自社のデッキを使う（docs/SPEC_DECK.md、試作）
   */
  variant: 'shared' | 'decks'
  /** decks：社（インデックス）ごとのデッキの番号 */
  factionDecks: number[][]
  /** decks：社ごとの陣営効果 */
  factionEffects: CompanyEffect[]
  /** decks：陣営効果 handSeven で増える手札の枚数 */
  factionHandBonus: number
  /** 効果 sumBonus で、1機につき合計に足す値 */
  sumBonusPerUnit: number
  /** decks：役の順位（大きいほど強い）。キーは evaluate.ts の Formation */
  deckFormationRank: Record<string, number>
  /** decks：その試合のカード表（newGame が作る。shared では null） */
  cardTable: CardSpec[] | null
  /** 1試合で使う社数 */
  companies: number
  /** 社の総数。companies より多ければ、毎試合この中から companies 社をランダムに選ぶ */
  companyPool: number
  /** 機種番号の上限（1..maxNumber） */
  maxNumber: number
  /**
   * 社ごとの番号の並び（各社同じ枚数）。null なら全社が 1..maxNumber を1枚ずつ持つ。
   * 社ごとに製品の傾向を変える案（実験中。docs/SPEC.md 未決事項）
   */
  companyNumbers: number[][] | null
  /** 戦場数 */
  flagCount: number
  /** 初期手札枚数 */
  handSize: number
  /** 戦場の片側に置ける枚数 */
  slotsPerSide: number
  /** 特殊地形の個数の候補（この中から等確率で選ぶ） */
  specialTerrainCounts: number[]
  /** 特殊地形の種類の候補（重複可で等確率に選ぶ） */
  specialTerrains: TerrainId[]
  /** この数の戦場を確保したら勝利 */
  winMajority: number
  /** 隣接するこの数の戦場を連続で確保したら勝利 */
  winAdjacent: number
  /**
   * 特殊地形の効果（いずれも同じ役どうしなら有利属性を含む側が勝つ）
   * - tiebreak: それだけ
   * - rankUp: 有利属性を含む編成は役が1段上がる
   * - wildCompany: 有利属性の機体はどの社としても数える（純正系が作りやすい）
   * - countRankUp: 有利属性を2枚以上含む編成は役が上がる
   */
  terrainEffect: 'tiebreak' | 'rankUp' | 'wildCompany' | 'countRankUp'
  /** terrainEffect = 'rankUp' / 'countRankUp' で上がる段数 */
  terrainRankBonus: number
  /** 開始時に各プレイヤーへ契約企業をランダムに割り当てるか（実験中） */
  contracts: boolean
  /** 社（インデックス）ごとの契約効果 */
  companyEffects: CompanyEffect[]
  /** drawTwo の手札の上限 */
  contractHandLimit: number
  /** 証明による確保（片側だけ完成でも、相手が上回れなければ確保）を使うか */
  proofSecuring: boolean
  /** 番号 → 属性 */
  attributeOf: Record<number, Attribute>
  /** 地形 → 有利属性 */
  favoredOf: Record<TerrainId, Attribute | null>
}

const attributeOf: Record<number, Attribute> = Object.fromEntries(
  units.unitTypes.map((t) => [t.number, t.attribute as Attribute]),
)
const favoredOf = Object.fromEntries(
  units.terrains.map((t) => [t.id, t.favored as Attribute | null]),
) as Record<TerrainId, Attribute | null>

const EFFECT_BY_COMPANY_ID: Record<string, CompanyEffect> = {
  GOE: 'sumBonus',
  CLD: 'flyingOnPlain',
  TRL: 'drawTwo',
  GHC: 'scout',
  ALB: 'eliteTie',
  NMS: 'none', // 裏向き配置は未実装
}
const companyEffects = units.companies.map((c) => EFFECT_BY_COMPANY_ID[c.id] ?? 'none')

// デッキ制のたたき台 v9（docs/SPEC_DECK.md、BALANCE は同ファイルの検証の節）
// 各社18枚。同じ番号は3枚まで、3枚入れられるのは3機種まで（同型機は最大3組＝5戦場より少ない）
const DECK_BY_COMPANY_ID: Record<string, number[]> = {
  GOE: [2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9], // 看板 7・8・9（砲撃・重装甲・要塞）。偵察ドローンなし
  CLD: [1, 1, 1, 2, 2, 3, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9], // 看板 1・6・8（偵察・空戦・コンドル）
  TRL: [1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 8, 8, 9], // 看板 3・4・5（工兵・輸送・主力）
  GHC: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 7, 7, 8, 8], // 看板 1・6（偵察・空戦）。要塞なし
  ALB: [1, 2, 3, 4, 4, 5, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9], // 看板 5・7・8（騎士・弩・聖騎士）
  NMS: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8], // 看板 1・2・3（軽量）。要塞なし
}
const FACTION_EFFECT_BY_COMPANY_ID: Record<string, CompanyEffect> = {
  GOE: 'sumBonus', // 大火力：合計+1/機
  CLD: 'flyingOnPlain', // 飛行技術：飛行機は空域以外でも有利機（同じ役で優先まで）
  TRL: 'handSeven', // 物量：手札+2枚
  GHC: 'scout', // 索敵：補充は2枚見て1枚
  ALB: 'eliteTie', // 精度：同じ役なら優先
  NMS: 'lowSum', // 奇襲：同じ役なら合計が小さいほうが強い
}
const factionDecks = units.companies.map((c) => DECK_BY_COMPANY_ID[c.id])
const factionEffects = units.companies.map((c) => FACTION_EFFECT_BY_COMPANY_ID[c.id] ?? 'none')

export const DEFAULT_CONFIG: GameConfig = {
  variant: 'shared',
  // デッキ制の役。同型機を最大3組に制限したデッキで、同型機 > 連携 > 二機 > 寄せ集め
  deckFormationRank: { mixed: 0, pair: 1, straight: 2, triple: 3 },
  factionDecks,
  factionEffects,
  factionHandBonus: 1,
  sumBonusPerUnit: 1,
  cardTable: null,
  // 2026-10-19 6→5：5戦場（30枠）に54枚は多く、ほしい札が最後まで出ないため。6社から毎試合5社を選ぶ
  companies: 5,
  companyPool: 6,
  maxNumber: 9,
  companyNumbers: null,
  // 2026-10-19 7→5：証明なしの7戦場は後手有利（先手勝率 約45%）。5戦場で 約48%（BALANCE.md）
  flagCount: 5,
  handSize: 6,
  slotsPerSide: 3,
  specialTerrainCounts: [1, 2],
  specialTerrains: ['sky', 'rough'],
  winMajority: 3,
  winAdjacent: 3,
  terrainEffect: 'countRankUp',
  terrainRankBonus: 1,
  // 2026-10-18 不採用：確保で空き枠が消え、置けなくなった側が有利になったため（SPEC 第5節）
  proofSecuring: false,
  contracts: false,
  companyEffects,
  contractHandLimit: 7,
  attributeOf,
  favoredOf,
}

/** デッキ制（試作）の設定。共有山札の設定を土台に、デッキ制の部分だけ変える */
export const DECK_CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  variant: 'decks',
  factionHandBonus: 2,
}
