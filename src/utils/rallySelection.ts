import type {TimelineItem} from "../api/types";

export function rallySelection(items: TimelineItem[], selected: ReadonlySet<string>) {
  const rallies = items.filter(item => item.type === "RALLY").sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms || a.item_id.localeCompare(b.item_id));
  const indices = rallies.flatMap((item, index) => selected.has(item.item_id) ? [index] : []);
  const chosen = indices.map(index => rallies[index]);
  const adjacent = chosen.length > 0 && chosen.length === selected.size && indices.every((index, offset) => index === indices[0] + offset);
  return {items: chosen, adjacent, startMs: chosen[0]?.start_ms ?? 0, endMs: Math.max(0, ...chosen.map(item => item.end_ms))};
}
