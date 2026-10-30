import type { FieldEvent } from '@setu/contract';

/** Spec categories mapped onto the CURRENT contract event types only (no new fields; see issue #15). */
export type ReportCategory =
  | 'water_level'
  | 'flooded_road'
  | 'blocked_road'
  | 'submerged_bridge'
  | 'road_cleared'
  | 'damaged_infrastructure'
  | 'other';

export interface CategoryDef {
  category: ReportCategory;
  label: string;
  hint: string;
  /** Contract event type this category produces; absent when the category is not expressible yet. */
  eventType?: FieldEvent['type'];
  /** Present when the category cannot be submitted; shown verbatim next to the disabled option. */
  blocked?: string;
  /** Road/bridge list filter for this category. */
  roadKind?: 'road' | 'bridge';
}

export const BLOCKED_15 = 'Blocked: issue #15';

export const CATEGORIES: CategoryDef[] = [
  { category: 'water_level', label: 'Water level', hint: 'A reading at a gauge or marker, in cm', eventType: 'water_level' },
  { category: 'flooded_road', label: 'Flooded road', hint: 'Water on a road: severity 1–5, optional depth', eventType: 'flood_report' },
  { category: 'blocked_road', label: 'Blocked road', hint: 'A road you cannot pass: partial or full', eventType: 'road_blockage', roadKind: 'road' },
  { category: 'submerged_bridge', label: 'Submerged bridge or crossing', hint: 'A bridge or crossing under water', eventType: 'road_blockage', roadKind: 'bridge' },
  { category: 'road_cleared', label: 'Road reopened', hint: 'A road or bridge is passable again', eventType: 'road_cleared' },
  { category: 'damaged_infrastructure', label: 'Damaged infrastructure', hint: 'Not available yet', blocked: BLOCKED_15 },
  { category: 'other', label: 'Other', hint: 'Not available yet', blocked: BLOCKED_15 },
];

export const categoryDef = (c: ReportCategory): CategoryDef => CATEGORIES.find((d) => d.category === c)!;

/** Category label for a stored event (used by the detail screen). */
export function categoryForEvent(e: FieldEvent): ReportCategory | undefined {
  switch (e.type) {
    case 'water_level': return 'water_level';
    case 'flood_report': return 'flooded_road';
    case 'road_cleared': return 'road_cleared';
    case 'road_blockage': return e.cause === 'submerged' ? 'submerged_bridge' : 'blocked_road';
    default: return undefined;
  }
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  water_level: 'Water level',
  flood_report: 'Flooded road',
  road_blockage: 'Road blockage',
  road_cleared: 'Road reopened',
  household_registration: 'Household registration',
};
