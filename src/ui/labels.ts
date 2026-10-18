// 表示用データ（data/units.json）の引き当て
import units from '../../data/units.json'
import type { CardId } from '../game/cards'
import { companyOf, numberOf } from '../game/cards'
import type { Attribute, GameConfig, TerrainId } from '../game/config'

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
