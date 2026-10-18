// バランスに関わる定数はすべてここに置く（docs/SPEC.md, docs/BALANCE.md）。
// 属性・地形の割り当ては data/units.json を正とする。
import units from '../../data/units.json'

export type Attribute = 'ground' | 'flying' | 'crawler'
export type TerrainId = 'plain' | 'sky' | 'rough'

export interface GameConfig {
  /** 1試合で使う社数 */
  companies: number
  /** 社の総数。companies より多ければ、毎試合この中から companies 社をランダムに選ぶ */
  companyPool: number
  /** 機種番号の上限（1..maxNumber） */
  maxNumber: number
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

export const DEFAULT_CONFIG: GameConfig = {
  // 2026-10-19 6→5：5戦場（30枠）に54枚は多く、ほしい札が最後まで出ないため。6社から毎試合5社を選ぶ
  companies: 5,
  companyPool: 6,
  maxNumber: 9,
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
  attributeOf,
  favoredOf,
}
