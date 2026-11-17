// progress.js: the % roll-up.
// material % = completed pages / total pages
// topic %    = 100 if the topic is checked, otherwise the average of its materials (0 if none)
// week %     = average of its topics
// overall %  = average of all topics in the roadmap
import { get, getAll, getAllByIndex } from './db.js';

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

export async function materialPercent(material) {
  if (!material?.totalPages) return 0;
  const rows = await getAllByIndex('page_progress', 'materialId', material.id);
  const completed = rows.filter((r) => r.completed).length;
  return Math.min(100, (completed / material.totalPages) * 100);
}

export async function getActivePath() {
  const paths = await getAll('paths');
  return paths.find((p) => p.active) || paths.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

// Full progress picture for one roadmap.
export async function pathProgress(pathId) {
  const path = await get('paths', pathId);
  if (!path) return null;
  const topics = (await getAllByIndex('topics', 'pathId', pathId)).sort((a, b) => a.week - b.week || a.order - b.order);
  const materials = await getAllByIndex('materials', 'pathId', pathId);

  const materialPct = new Map();
  for (const m of materials) materialPct.set(m.id, await materialPercent(m));

  const topicPct = new Map();
  for (const t of topics) {
    const mats = materials.filter((m) => m.topicId === t.id);
    topicPct.set(t.id, t.done ? 100 : avg(mats.map((m) => materialPct.get(m.id))));
  }

  const weekNumbers = [...new Set(topics.map((t) => t.week))].sort((a, b) => a - b);
  const weeks = weekNumbers.map((n) => {
    const weekTopics = topics.filter((t) => t.week === n);
    const info = (path.weekInfo || []).find((w) => w.week === n) || {};
    return {
      week: n,
      title: info.title || `Week ${n}`,
      focus: info.focus || '',
      topics: weekTopics,
      percent: avg(weekTopics.map((t) => topicPct.get(t.id))),
    };
  });

  return {
    path,
    topics,
    materials,
    weeks,
    topicPct,
    materialPct,
    overall: avg(topics.map((t) => topicPct.get(t.id))),
  };
}
