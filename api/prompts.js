// How we "teach" the AI: no training or fine-tuning, just carefully written prompts.
// Each action has (1) a system prompt with clear rules, (2) the exact output shape,
// and (3) one short example input + output (a "few-shot" example) that shows the model
// exactly what a good answer looks like.

export const LANGUAGES = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  bn: 'Bengali',
  mr: 'Marathi',
};

// Shared reminder about language. JSON keys always stay in English so our code can read them.
function languageRule(language) {
  const name = LANGUAGES[language] || 'English';
  if (name === 'English') return 'Write all text in simple English.';
  return `Write all human-readable text values in ${name} (use the ${name} script). ` +
    'Keep JSON keys, numbers and the "correct" index exactly as in the example (in English/digits).';
}

// ---------- Roadmap ----------
const roadmapExampleInput = 'Goal: Learn the basics of Python\nLevel: beginner\nHours per week: 4\nNumber of weeks: 2';
const roadmapExampleOutput = {
  title: 'Python Basics in 2 Weeks',
  weeks: [
    {
      week: 1,
      title: 'Getting started',
      focus: 'Set up Python and learn variables, types and input/output.',
      topics: [
        { title: 'Install Python and run your first script', description: 'Install Python, use the terminal and print "Hello".', estHours: 1 },
        { title: 'Variables and data types', description: 'Numbers, strings, booleans and type conversion.', estHours: 1.5 },
        { title: 'Input, output and simple maths', description: 'Use input() and print() to build a tiny calculator.', estHours: 1.5 },
      ],
    },
    {
      week: 2,
      title: 'Making decisions and repeating',
      focus: 'Control flow with if-statements and loops.',
      topics: [
        { title: 'If, elif and else', description: 'Compare values and choose what code runs.', estHours: 1.5 },
        { title: 'For and while loops', description: 'Repeat work and loop over lists.', estHours: 1.5 },
        { title: 'Mini project: number guessing game', description: 'Combine everything in one small program.', estHours: 1 },
      ],
    },
  ],
};

function roadmapSystem(language) {
  return [
    'You are LearnPath, a friendly study planner for students.',
    'Create a realistic week-by-week study roadmap from the student details.',
    'Rules:',
    '- Reply with ONE JSON object only. No markdown, no code fences, no extra text.',
    '- Create exactly the number of weeks requested (week numbers start at 1).',
    '- Each week has 2 to 4 topics. Topic titles are short (max 8 words). Descriptions are one short sentence (max 12 words).',
    '- Keep "focus" to one short sentence (max 12 words).',
    '- estHours is a number. The topics of one week should add up to about the hours per week.',
    '- Order topics from basic to advanced and match the student level.',
    '- ' + languageRule(language),
    'JSON shape: {"title": string, "weeks": [{"week": number, "title": string, "focus": string, "topics": [{"title": string, "description": string, "estHours": number}]}]}',
  ].join('\n');
}

// ---------- Explain ----------
const explainExampleInput = 'Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to make glucose. Oxygen is released as a by-product. It takes place mainly in the chloroplasts of leaf cells, which contain the pigment chlorophyll.';
const explainExampleOutput = [
  '- Plants make their own food using sunlight; this is called photosynthesis.',
  '- They need three things: sunlight, water and carbon dioxide from the air.',
  '- The food they make is a sugar called glucose.',
  '- Oxygen is given out as a bonus, which is the oxygen we breathe.',
  '- It happens inside chloroplasts, the green parts of leaf cells (green because of chlorophyll).',
].join('\n');

function explainSystem(language) {
  return [
    'You are LearnPath Study Buddy. You explain one page of study material to a student in very simple words.',
    'Rules:',
    '- Reply with exactly 5 short bullet points. Each line starts with "- ".',
    '- Use plain, everyday language. Explain hard words. No more than 25 words per bullet.',
    '- Only use facts from the page. If the page has very little content, explain what is there.',
    '- No headings, no introduction, no closing line.',
    '- ' + languageRule(language),
  ].join('\n');
}

// ---------- Quiz ----------
const quizExampleOutput = {
  questions: [
    {
      question: 'What do plants mainly make during photosynthesis?',
      options: ['Protein', 'Glucose', 'Salt', 'Starch only at night'],
      correct: 1,
      explanation: 'The page says plants use sunlight, water and CO2 to make glucose.',
    },
    {
      question: 'Which gas is released as a by-product?',
      options: ['Carbon dioxide', 'Nitrogen', 'Oxygen', 'Hydrogen'],
      correct: 2,
      explanation: 'Oxygen is released as a by-product of photosynthesis.',
    },
    {
      question: 'Where does photosynthesis mainly happen?',
      options: ['In the roots', 'In chloroplasts of leaf cells', 'In the flowers', 'In the soil'],
      correct: 1,
      explanation: 'It takes place mainly in the chloroplasts of leaf cells.',
    },
  ],
};

function quizSystem(language) {
  return [
    'You are LearnPath Study Buddy. You write a short multiple-choice quiz about one page of study material.',
    'Rules:',
    '- Reply with ONE JSON object only. No markdown, no code fences, no extra text.',
    '- Exactly 3 questions. Each has exactly 4 options and exactly one correct answer.',
    '- "correct" is the index (0, 1, 2 or 3) of the right option. Vary which index is correct.',
    '- "explanation" is one short line saying why the answer is right.',
    '- Only ask about facts found on the page.',
    '- ' + languageRule(language),
    'JSON shape: {"questions": [{"question": string, "options": [string, string, string, string], "correct": number, "explanation": string}]}',
  ].join('\n');
}

// Build the chat messages for an action: system prompt + one example + the real input.
export function buildMessages(action, language, input) {
  if (action === 'roadmap') {
    return [
      { role: 'system', content: roadmapSystem(language) },
      { role: 'user', content: roadmapExampleInput },
      { role: 'assistant', content: JSON.stringify(roadmapExampleOutput) },
      { role: 'user', content: input },
    ];
  }
  if (action === 'explain') {
    return [
      { role: 'system', content: explainSystem(language) },
      { role: 'user', content: 'Page text:\n' + explainExampleInput },
      { role: 'assistant', content: explainExampleOutput },
      { role: 'user', content: 'Page text:\n' + input },
    ];
  }
  if (action === 'quiz') {
    return [
      { role: 'system', content: quizSystem(language) },
      { role: 'user', content: 'Page text:\n' + explainExampleInput },
      { role: 'assistant', content: JSON.stringify(quizExampleOutput) },
      { role: 'user', content: 'Page text:\n' + input },
    ];
  }
  throw new Error('Unknown action');
}

// A stricter reminder used when the first reply was not valid JSON.
export const RETRY_REMINDER =
  'Your last reply was not valid. Reply again with ONLY the JSON object in the exact shape described. No other text.';
