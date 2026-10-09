// 문항 은행 (공개용). 정답 키와 서술형 채점 기준표는 answer-key.*.data.ts 에만 둔다.
// 이 파일은 응시 화면(클라이언트)에서도 import 되므로 정답을 넣지 않는다.
// 문항은 버전(시험의 item_set_version)별로 둔다. 응시가 시작된 버전은 고치지 않고 새 버전을 만든다.

import type { ChapterId, MidFactorId, SubFactorId } from "./factors";
import { ITEMS_V1 } from "./items.v1";

export const LIKERT_LABELS = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];

interface BaseItem {
  id: string;
  mid: MidFactorId;
  chapter: ChapterId;
  prompt: string;
}

export interface ChoiceItem extends BaseItem {
  type: "choice";
  sub: SubFactorId;
  options: string[];
}

export interface SelfItem extends BaseItem {
  type: "self";
}

export interface EssayItem extends BaseItem {
  type: "essay";
  title: string;
  scenario: string;
  minLength: number;
}

export type Item = ChoiceItem | SelfItem | EssayItem;

/** 한 버전의 문항 세트. 표시 순서: 자기평가 → 객관식 → 서술형 */
export interface ItemSet {
  version: string;
  choice: ChoiceItem[];
  self: SelfItem[];
  essay: EssayItem[];
  /** 자기평가 → 객관식 → 서술형 순 */
  all: Item[];
}

function build(def: { version: string; choice: readonly ChoiceItem[]; self: readonly SelfItem[]; essay: readonly EssayItem[] }): ItemSet {
  const choice = [...def.choice];
  const self = [...def.self];
  const essay = [...def.essay];
  return { version: def.version, choice, self, essay, all: [...self, ...choice, ...essay] };
}

const SETS: Record<string, ItemSet> = Object.fromEntries([ITEMS_V1].map((d) => [d.version, build(d)]));

/** 새로 만드는 시험에 쓰는 버전 */
export const ITEM_SET_VERSION = ITEMS_V1.version;
export const ITEM_SET_VERSIONS = Object.keys(SETS);

/** 시험의 item_set_version 에 맞는 문항 세트. 모르는 버전이면 오류 */
export function itemSet(version: string): ItemSet {
  const s = SETS[version];
  if (!s) throw new Error(`unknown item set version: ${version}`);
  return s;
}

/** 모든 버전에 걸친 서술형 문항 id (채점 목록처럼 여러 시험을 함께 보여 줄 때) */
export const ESSAY_ITEM_IDS: string[] = [...new Set(Object.values(SETS).flatMap((s) => s.essay.map((e) => e.id)))];

/** 새 시험에 쓰는 현재 문항 세트 */
export const currentItemSet = (): ItemSet => itemSet(ITEM_SET_VERSION);
