// sample-plan.js: a simple built-in plan, used when the AI is busy, offline or not set up.
// It follows a common learning arc: foundations -> core -> practice -> projects -> review.

const STAGES = [
  { title: 'Foundations', focus: 'Understand the key ideas and words.', topics: ['Overview and key terms of {goal}', 'Core building blocks', 'Simple worked examples'] },
  { title: 'Core concepts', focus: 'Learn the main concepts step by step.', topics: ['Main concept 1 of {goal}', 'Main concept 2 of {goal}', 'Practice exercises'] },
  { title: 'Practice', focus: 'Use what you learned on real problems.', topics: ['Solve beginner problems', 'Solve mixed problems', 'Review your mistakes'] },
  { title: 'Going deeper', focus: 'Explore harder topics and connections.', topics: ['Advanced topic in {goal}', 'Common pitfalls and tips', 'Summary notes'] },
  { title: 'Project', focus: 'Build or write something with {goal}.', topics: ['Plan a small project', 'Build the project', 'Present or explain your project'] },
  { title: 'Review', focus: 'Revise and test yourself.', topics: ['Revise weak areas', 'Timed self-test', 'Plan your next goal'] },
];

export function samplePlan({ goal, weeks, hoursPerWeek }) {
  const g = goal.trim().slice(0, 60) || 'your subject';
  const n = Math.max(1, Math.min(24, Number(weeks) || 4));
  const plan = { title: `${g}: ${n}-week plan`, weeks: [] };
  for (let i = 0; i < n; i++) {
    // Spread the stages across the weeks (first week = Foundations, last = Review).
    const stageIndex = n === 1 ? 0 : Math.round((i / (n - 1)) * (STAGES.length - 1));
    const stage = STAGES[stageIndex];
    const perTopic = Math.max(0.5, Math.round(((Number(hoursPerWeek) || 5) / stage.topics.length) * 2) / 2);
    plan.weeks.push({
      week: i + 1,
      title: stage.title,
      focus: stage.focus.replace('{goal}', g),
      topics: stage.topics.map((t) => ({ title: t.replace('{goal}', g), description: '', estHours: perTopic })),
    });
  }
  return plan;
}
