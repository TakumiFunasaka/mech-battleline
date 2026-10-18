// 表示用データ（data/units.json）の引き当て
import units from '../../data/units.json'
import type { CardId } from '../game/cards'
import { companyOf, numberOf } from '../game/cards'
import type { Attribute, CompanyEffect, GameConfig, TerrainId } from '../game/config'
import { DECK_CONFIG } from '../game/config'

export const ATTRIBUTE_NAME = units.attributes as Record<Attribute, string>
export const ATTRIBUTE_SHORT: Record<Attribute, string> = { ground: '', flying: '飛', crawler: '履' }
export const TERRAIN_NAME = Object.fromEntries(units.terrains.map((t) => [t.id, t.name])) as Record<TerrainId, string>

export const COLOR_NAME: Record<string, string> = {
  red: '赤',
  blue: '青',
  yellow: '黄',
  green: '緑',
  white: '白',
  black: '黒',
}

/** 社の短い表記（色の1文字） */
export const COMPANY_SHORT: string[] = units.companies.map((c) => COLOR_NAME[c.color])

export interface CardInfo {
  id: CardId
  number: number
  companyIndex: number
  companyId: string
  companyName: string
  color: string
  model: string
  name: string
  type: string
  attribute: Attribute
}

export function cardInfo(cfg: GameConfig, id: CardId): CardInfo {
  const ci = companyOf(cfg, id)
  const num = numberOf(cfg, id)
  const company = units.companies[ci]
  const unit = company.units.find((u) => u.number === num)!
  const type = units.unitTypes.find((t) => t.number === num)!
  return {
    id,
    number: num,
    companyIndex: ci,
    companyId: company.id,
    companyName: company.name,
    color: company.color,
    model: unit.model,
    name: unit.name,
    type: type.type,
    attribute: cfg.attributeOf[num],
  }
}

/** 「赤7」のような短い表記 */
export function cardShort(cfg: GameConfig, id: CardId): string {
  const info = cardInfo(cfg, id)
  return `${COLOR_NAME[info.color]}${info.number}`
}

/** デッキ制の陣営効果の説明（docs/SPEC_DECK.md） */
const EFFECT_TEXT: Partial<Record<CompanyEffect, [string, string]>> = {
  sumBonus: ['大火力', '合計に1機あたり+1'],
  flyingOnPlain: ['飛行技術', '飛行機（1・6）は空域以外でも有利機（同じ役で優先まで）'],
  handSeven: ['物量', `手札が${DECK_CONFIG.factionHandBonus}枚多い`],
  scout: ['索敵', '補充のとき山札の上2枚から1枚を選ぶ（残りは山札の下へ）'],
  eliteTie: ['精度', '同じ役なら優先（地形の有利機と同じ扱い）'],
  lowSum: ['奇襲', '同じ役なら合計が小さいほうが強い'],
}

export interface FactionInfo {
  index: number
  name: string
  shortName: string
  color: string
  colorName: string
  /** 効果の見出し（例：大火力） */
  effectShort: string
  effectText: string
  /** デッキの中身（例：7・8・9 ×3 ／ 2・3・4・5 ×2 ／ 6 ×1） */
  deckText: string
}

const deckText = (nums: number[]) => {
  const count = new Map<number, number>()
  for (const n of nums) count.set(n, (count.get(n) ?? 0) + 1)
  return [3, 2, 1]
    .map((k) => {
      const ns = [...count].filter(([, c]) => c === k).map(([n]) => n)
      return ns.length ? `${ns.sort((a, b) => a - b).join('・')} ×${k}` : ''
    })
    .filter(Boolean)
    .join(' ／ ')
}

export const FACTIONS: FactionInfo[] = units.companies.map((c, i) => {
  const [head, body] = EFFECT_TEXT[DECK_CONFIG.factionEffects[i]] ?? ['', '']
  return {
    index: i,
    name: c.name,
    shortName: c.name.replace(/(重工|・ダイナミクス|運輸機工|開拓公社|精機|・ディフェンス)$/, ''),
    color: c.color,
    colorName: COLOR_NAME[c.color],
    effectShort: head,
    effectText: `${head}：${body}`,
    deckText: deckText(DECK_CONFIG.factionDecks[i]),
  }
})
