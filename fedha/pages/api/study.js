// pages/api/study.js — the Learning hub's AI: explanations, the study-mode tutor, fast quizzes, flashcards and
// recaps. Groq first; NVIDIA takes over when Groq is busy (same pairing as pages/api/ai.js).
// It works from your own notes when there are any, and says so when it falls back on general knowledge.
import { requireUser } from '../../lib/require-user';
import { nvidiaChat, nvidiaAvailable } from '../../lib/nvidia-client';
import { webSearch } from '../../lib/web-search';

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '4mb' } } }; // homework photos
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const clip = (v, n) => String(v ?? '').slice(0, n);

const TUTOR = `You are Luxe's study tutor. Teach like a sharp, patient senior engineer: plain English, short paragraphs, concrete examples, no fluff and no flattery.
If the learner is wrong or vague, say so plainly and correct them. Prefer the STUDY MATERIAL when it is given. If you go beyond it, keep it accurate and mark it "(beyond your notes)". Use Markdown. No emoji.`;

// Professor Byte, the animated tutor in Study mode: fun and cheeky, but still an honest teacher.
const BYTE = `You are Professor Byte, a brilliant, warm professor (a cartoon robot in a graduation cap behind the glass of the learner's phone) teaching ONE learner one-on-one, from a board beside you.
HOW YOU TEACH, like the best university lecturer and private tutor combined:
- Talk naturally, the way a great professor speaks in a small tutorial: "Okay, so here is the thing...", "Now watch what happens when...", "This is the part people get wrong." Never read notes out or list bullet points aloud; you understand the material and explain it in your own words.
- Build understanding in layers: first the intuition (what problem this solves and why it exists), then how it actually works step by step, then a real, worked example, then where it breaks or what people get wrong.
- Explain every technical word the moment you use it. Never skip a step in reasoning; if something follows from something else, say why.
- Examples must be REAL and correct: real tools, real code, real numbers, real-world situations from this field. No silly or forced analogies; use an analogy only when it genuinely clarifies, and say where it stops matching.
- When something is a process or pipeline, break it into its stages and make sure each stage is clear (what goes in, what happens, what comes out, why it is needed) before moving on.
- Accuracy matters more than anything: never state something you are not sure of; code you show must be correct and runnable; numbers must add up.
{{SASS}}
Plain English, no slang or local dialect, no emoji in spoken lines. Use the STUDY MATERIAL and your stored research as the source of truth.`;

const BOARD_HELP = `Boards (pick the one that teaches best; use one in most scenes):
{"type":"chart","title":"","kind":"line"|"bar","x":"x label","y":"y label","points":[[x,y],...]}  up to 12 points; x is a number for line, a short label for bar. Use whenever numbers, growth, trade-offs or a function would help (real data, or clearly illustrative).
{"type":"steps","title":"","items":["",""]}  up to 6 short items
{"type":"code","lang":"python","code":"...","focus":[3,4],"note":"what these lines do"}  up to 14 short lines of CORRECT, runnable code; "focus" = the line numbers you are explaining right now (highlighted); "note" = one line about them. When walking through code, keep the SAME code on the board and move "focus" scene by scene.
{"type":"table","title":"","headers":["step","i","total"],"rows":[["1","0","0"],["2","1","1"]]}  a trace or comparison table: up to 5 columns, 8 rows. Use it to TRACE code with real values (variables after each line or loop pass).
{"type":"big","text":"key term or formula","sub":"one line"}
{"type":"compare","left":{"title":"","items":[""]},"right":{"title":"","items":[""]}}
{"type":"flow","title":"","nodes":["",""],"active":0}  up to 7 nodes, top to bottom; "active" = the stage you are explaining now (highlighted). For a pipeline keep the whole pipeline on the board and move "active".
{"type":"story","title":"","text":"..."}  for a story tangent, under 70 words
{"type":"picture","title":"","items":[{"emoji":"🚗","label":"car","note":"what it stands for"}],"join":"→","wiki":"Car","scene":"a cartoon car stopping at a toll gate","caption":""}  SHOW what you are talking about: 1-4 items, each one emoji with a short label (and optional note); "join" between items is "→", "+", "vs", "=" or ""; "wiki" is the exact English Wikipedia article title when it is a real object or thing (Car, Padlock, Neuron, Router), else ""; "scene" is a one-line description to draw an illustration when a photo would not fit, else "".
{"type":"animate","title":"","actors":[{"id":"pkt","emoji":"📦","label":"packet"},{"id":"fw","emoji":"🧱","label":"firewall"}],"frames":[{"caption":"","pos":{"pkt":[10,50],"fw":[55,50]},"fx":{}},{"caption":"","pos":{"pkt":[45,50]},"fx":{"fw":"shake"}}]}  ACT AN EXAMPLE OUT: 2-6 actors, 3-6 frames played about 2 s apart. pos is [x,y] in 0-100 (only list actors that move); fx per actor: pulse, shake, spin, grow, fade, hide, show, bounce. Use it when something happens over time: data moving, a model learning, an attack, a loop running, money compounding.
MAKE IT VISUAL: whenever you say "take this car", "imagine a lock", use an analogy, or name a concrete thing, put a picture board up in that same scene so the learner SEES it. Use at least one picture or animate board in most answers, and animate the main example whenever it is a process.`;

// The sass dial (Learning → Byte → Sass): how hard he teases. Savage = playful rage-bait that pulls you into thinking.
const SASS = {
  chill: 'PERSONALITY: warm, patient and encouraging, with gentle humour. If the learner is wrong, say so kindly and plainly, then fix it. Never flatter.',
  cheeky: 'PERSONALITY: warm, witty, a little cheeky, encouraging but honest. Light teasing and humour, never at the cost of clarity. If the learner is wrong, say so plainly with a cheeky line, then fix it. Never flatter.',
  savage: `PERSONALITY, RAGE-BAIT PROFESSOR MODE (playful and educational): you provoke the learner into thinking hard. Use dares ("Bet you can't explain this without looking."), spicy hot takes they will want to argue with ("Recursion is just a loop with an ego. Change my mind.") and then show the real nuance, mock-arrogant boasts ("I have taught toasters faster than this."), theatrical disbelief at wrong answers ("Wrong. And so confidently wrong. Iconic."), and grudging respect when they are right ("Fine. That was good. Annoyingly good.").
Rules: roast the MISTAKE or the idea, never the person; nothing about their intelligence, looks, background or worth, never cruel or discouraging. Every tease leads straight into a clear, correct explanation: the bait is the hook, the teaching is the point. About one provocation every two scenes, never at the cost of clarity. Praise only what is truly right.`,
};
const byteSystem = (sass) => BYTE.replace('{{SASS}}', SASS[sass] || SASS.savage);
const sassLine = (sass) => (sass === 'chill' ? 'Tone: warm and encouraging.' : sass === 'cheeky' ? 'Tone: cheeky but kind.' : 'Tone: playful rage-bait (mock disbelief at mistakes, grudging respect when right; roast the mistake, never the person), then the real explanation.');

const STAGE_ASK = {
  start: 'The session is starting. If you have a lesson plan, open with a line that proves you read their notes, say what today\'s session covers, then start step 1.' + ' Otherwise: greet the learner with a cheeky opening, tease what is coming in this topic with one hook (a surprising fact or tiny story), and say what you will cover. Do not ask a question.',
  simple: 'Explain it simply: one everyday analogy, the idea in plain words, and one tiny example.',
  normal: 'Explain it clearly: what it is, why it matters, how it works step by step, and a worked example.',
  deep: 'Go deep: the mechanism, edge cases, how it connects to related ideas, and a worked example.',
  example: 'Show 2 concrete, realistic worked examples (code if it is a programming topic).',
  mistakes: 'Act out the most common mistakes people make with this (be dramatic about them), each with the right idea.',
  story: 'Tell a short, true and fun story from the history of this idea (or of the people behind it), then tie it back to what it teaches.',
  wrapup: 'Class is ending.',
  reteach: 'Re-teach.',
  homework_check: 'Homework check.',
  homework_grade: 'Grading homework.',
  homework_help: 'Homework catch-up.',
  hint: 'The learner has gone quiet after your question. Be playfully impatient about it (tease them, a little drama), then give a helpful hint and ask again, a bit simpler.',
  live_start: 'A live one-on-one voice class is starting. Greet the learner with a cheeky line and one hook about the topic, and say what you will cover. Do not ask a question.',
  quiz: 'Pop quiz! Ask the learner one good question that tests understanding (no answer yet). Be theatrical about it.',
};

const SPEAK = `SPEAKING CODE: "say" is read aloud by a voice, so NEVER put code, symbols or a copied line of code in "say" (it comes out as robotic gibberish). The code goes on the board; in "say" talk about it like a teacher: refer to lines by number and describe them in plain words ("line 2 makes an empty list called scores", "the colon at the end opens the loop's body", "this adds one to count").
`;

const STYLE = {
  simple: 'Explain it like I am new to the topic: one everyday analogy, then the idea in 3-5 short sentences, then one tiny example.',
  normal: 'Explain it clearly: what it is, why it matters, how it works step by step, and one worked example.',
  deep: 'Go deep: the mechanism, edge cases, common mistakes, how it connects to related ideas, and a worked example. Stay under 450 words.',
  example: 'Give 2 concrete, realistic worked examples (code if it is a programming topic), each with a one-line takeaway.',
  mistakes: 'List the 4-6 most common misunderstandings or mistakes about this, each with the correct idea.',
};

function prompt(b) {
  const material = clip(b.context, 14000).trim();
  const mat = material ? `STUDY MATERIAL:\n${material}\n\n` : 'There are no notes for this yet: use accurate general knowledge.\n\n';
  const topic = clip(b.topic, 300) || 'this material';
  switch (b.type) {
    case 'explain':
      return { json: false, max: 1600, text: `${mat}Topic: ${topic}\n\n${STYLE[b.level] || STYLE.normal}` };
    case 'tutor': {
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-8).map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${clip(m.text, 1500)}`).join('\n');
      return { json: false, max: 1400, text: `${mat}Topic: ${topic}\n${hist ? `\nConversation so far:\n${hist}\n` : ''}\nLearner: ${clip(b.question, 2000)}\n\nAnswer the learner directly. If they are explaining something back to you, grade their explanation honestly (what is right, what is missing or wrong), then fill the gap.` };
    }
    case 'quiz': {
      const n = Math.max(3, Math.min(15, Number(b.count) || 5));
      const diff = ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium';
      return { json: true, max: 3500, text: `${mat}Topic: ${topic}\nWrite ${n} ${diff} multiple-choice questions that test understanding (not trivia, not wording tricks). Each has exactly 4 options, one correct. Vary which option is correct. Distractors must be plausible.
${b.avoid?.length ? `Do not repeat these questions: ${b.avoid.slice(0, 20).map((q) => clip(q, 120)).join(' | ')}\n` : ''}Return JSON: {"questions":[{"q":"question","options":["A","B","C","D"],"answer":0,"why":"one-sentence explanation of the correct answer"}]}` };
    }
    case 'cards': {
      const n = Math.max(3, Math.min(25, Number(b.count) || 10));
      return { json: true, max: 3500, text: `${mat}Topic: ${topic}\nMake ${n} flashcards for spaced repetition. One idea per card. The question makes you recall (why/how/what is), the answer is short (under 40 words) and exact. Cover the most important ideas first. No yes/no questions.
${b.avoid?.length ? `Skip ideas already covered by these cards: ${b.avoid.slice(0, 40).map((q) => clip(q, 100)).join(' | ')}\n` : ''}Return JSON: {"cards":[{"q":"question","a":"answer"}]}` };
    }
    case 'recap':
      return { json: false, max: 1800, text: `${mat}This is what I studied ${clip(b.period, 40) || 'recently'}. Write a recap I can read in 2 minutes:
## Key ideas
5-8 bullets, the most important things, each one line.
## Connect the dots
2-3 sentences on how these ideas fit together.
## Revise next
The 2-3 weakest or most easily forgotten points${b.weak?.length ? ` (my weak spots from quizzes and cards: ${b.weak.slice(0, 10).map((w) => clip(w, 120)).join('; ')})` : ''}.
## Test yourself
3 short questions, answers hidden after "Answer:" on the same line.` };
    case 'summarize_note':
      return { json: false, max: 1500, text: `${mat}Turn this into clean revision notes: short summary, key concepts as bullets, terms with definitions, and one example. Keep all facts from the material, add nothing new.` };
    case 'project_ideas':
      return { json: true, max: 2500, text: `${mat}Topic: ${topic}\nSuggest 3 small portfolio projects that prove I can apply this (doable solo in 3-10 hours each, free tools only). For each: title, one-line goal, and 4-6 concrete milestones in order.
Return JSON: {"projects":[{"title":"","goal":"","milestones":["",""]}]}` };
    case 'quiz_pack': {
      const steps = (Array.isArray(b.plan?.steps) ? b.plan.steps : []).slice(0, 7);
      return { json: true, max: 2800, text: `${mat}Topic: ${topic}\nYou have just taught this lesson in ${steps.length} parts:\n${steps.map((x, k) => `${k + 1}. ${clip(x.title, 80)}: ${clip(x.goal, 160)} (check idea: ${clip(x.check, 160)})`).join('\n')}\nWrite the end-of-lesson oral quiz: exactly ONE question per part, in the same order. Each must be answerable out loud in one or two sentences from what was taught (understanding, not trivia).\nReturn JSON: {"questions":[{"ask":"the question as you would say it aloud, under 30 words, plain words","hint":"a clue said aloud, 1-2 sentences, that nudges toward the answer WITHOUT giving it away","answer":"the correct answer in 1-2 sentences: the key points a good answer must contain","simple":"the same answer explained in a much simpler way with a small everyday analogy, 2-4 short sentences, said aloud"}]}` };
    }
    case 'lab_project': {
      const DOM = {
        ai: 'Build something real with AI: a small model, an agent, a classifier, a RAG search, a prompt pipeline, using free tools and small data that ships with the lab.',
        cyber: 'A hands-on cybersecurity lab, legal and safe: everything runs on the learner\'s own machine on SYNTHETIC data shipped in the lab files (log files to investigate for attacks, a vulnerable snippet to find and fix, hashes to crack with a given wordlist, encodings and ciphers to break, a simulated port scan over a shipped list of hosts and banners, packet captures as CSV). It runs in Python in the phone\'s browser, which has NO network, sockets or shell: never open connections, call nmap or other tools, or use subprocess; simulate them with the shipped data (hashlib, hmac, base64, re, json, csv are all fine). Never target real systems or third parties.',
        data: 'A data project: clean, analyse and visualise a small dataset shipped in the lab files.',
        cloud: 'A DevOps / cloud lab that can run locally: config files, scripts, a small service with health checks, automation.',
        software: 'Build a working program or app feature with real structure: functions, tests, edge cases.',
        math: 'Implement the maths in code and verify it numerically.',
        business: 'A practical tool or analysis for the business idea in the unit, as code or a structured model.',
        other: 'A practical project that makes the learner apply the unit.',
      };
      return { json: true, max: 6000, temp: 0.55, text: `${mat}You are Professor Byte designing the PROJECT LAB that follows a finished unit. The learner just completed: course "${clip(b.course, 160)}", unit ${Number(b.unit) || 1}: "${clip(b.section, 120)}" (lessons: ${clip((b.lessons || []).join('; '), 1200)}).
${DOM[b.domain] || DOM.other}
${b.previous?.length ? `Labs they already built (make this one build on them, a step harder): ${clip(b.previous.join('; '), 600)}\n` : ''}${b.weak?.length ? `Their weak spots to work on: ${clip(b.weak.join('; '), 400)}\n` : ''}It must use exactly what this unit taught, take 1-3 hours in total, run on a phone (Python with the standard library plus numpy, pandas, scikit-learn or matplotlib if needed, which install automatically; no network, files outside the lab or shell commands; or plain JavaScript), and feel like a real project with a mission.
Return JSON: {"title":"","brief":"the mission in 2-3 sentences, exciting and concrete","why":"what real skill this proves","domain":"${clip(b.domain, 20) || 'other'}","lang":"python","files":[{"name":"main.py","content":"starter code with TODO comments, runnable"},{"name":"data.csv","content":"small synthetic data if needed"}],"milestones":[{"title":"","goal":"what must work","criteria":["a checkable requirement"],"hint":"a nudge, not the answer"}],"stretch":["a harder extra for later"]}
4-6 milestones in build order; 1-4 files, each under 6000 characters; all starter code must run.` };
    }
    case 'lab_review':
      return { json: true, max: 3000, text: `You are Professor Byte reviewing a learner's project lab like a sharp senior engineer and CS lecturer. ${sassLine(b.sass)}
Lab: "${clip(b.title, 120)}": ${clip(b.brief, 600)}
Milestone ${Number(b.n) || 1}: "${clip(b.milestone?.title, 120)}": ${clip(b.milestone?.goal, 400)}
It counts as done only if ALL of these hold: ${clip((b.milestone?.criteria || []).join(' | '), 800)}
${b.run ? `The app ran it. Output:\n${clip(b.run, 2500)}\n` : 'It was not run; mentally execute it.\n'}Their earlier review scores (oldest first): ${clip((b.history || []).join(', '), 200) || 'none yet'}.
Their files:
${clip((b.files || []).map((f) => `--- ${f.name}\n${f.content}`).join('\n'), 12000)}
Judge honestly. ${SPEAK}Return JSON: {"done":false,"score":7,"say":"what Byte says aloud, 2-4 sentences, in your tone, no code in it (point to file and line numbers instead): did this milestone work, and the one thing that matters most","good":["what is genuinely good"],"fixes":[{"file":"main.py","line":12,"note":"what is wrong and how to fix it"}],"growth":"one honest line comparing this with their earlier scores (sharper, same, or slipping, and why)","next":"what to do next"}
score: 0-10 for correctness, code quality and understanding together.` };
    case 'missed_check':
      return { json: true, max: 1500, text: `${mat}The learner skipped the lesson "${clip(b.lesson, 160)}" in "${clip(b.course, 120)}" and now has some explaining to do. Write 2 short questions they can only answer if they really know that lesson's key idea (understanding, answerable in 1-2 sentences).
Return JSON: {"questions":[{"ask":"","answer":"the key points a good answer must contain"}]}` };
    case 'code_task':
      return { json: true, max: 2600, text: `${mat}Topic: ${topic}\nWrite ONE coding exercise in ${clip(b.lang, 20) || 'python'} that makes the learner write the code taught in this lesson themselves (${clip(b.goal, 300) || 'the main idea'}). Level: ${['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'easy'}; a self-taught learner should finish it in 10-25 minutes.\nReturn JSON: {"title":"","prompt":"the task, clear and complete, with input/output format","lang":"${clip(b.lang, 20) || 'python'}","starter":"starter code: the function signature and a docstring/comment, no solution","examples":[{"input":"","output":""}],"hint":"one hint that does not give it away","solution":"a correct, clean, commented solution","fn":"the function name the tests call","tests":[{"args":[],"expected":null}]}\ntests: 3-5 cases as JSON values (args is the argument list) that the solution passes; include one edge case. Everything must be correct.` };
    case 'code_review':
      return { json: true, max: 2600, text: `You are Professor Byte, a sharp CS lecturer reviewing a learner's code. Be exact, never flatter. ${sassLine(b.sass)}\nTask: ${clip(b.prompt, 1500)}\nLanguage: ${clip(b.lang, 20) || 'python'}\nExamples: ${clip(JSON.stringify(b.examples || []), 800)}\n${b.results ? `The app ran their code against the tests: ${clip(JSON.stringify(b.results), 1200)}\n` : 'The app could not run this language, so mentally execute their code on each example, line by line, before judging.\n'}A correct reference solution (do not paste it unless they failed badly): ${clip(b.solution, 1500)}\nTheir code:\n${clip(b.code, 4000)}\n${SPEAK}Return JSON: {"verdict":"pass|almost|fail","say":"what Byte says aloud, 2-4 sentences, no code in it: whether it works and the single most important thing to fix or to be proud of","lines":[{"line":1,"note":"what is wrong or good on this line and why"}],"fixed":"their code with the minimum changes to make it correct (empty if it already passes)","next":"one tip to write better code next time"}` };
    case 'leetcode':
      return { json: true, max: 1200, text: `Suggest 3 real LeetCode problems that practise "${topic}" (${clip(b.goal, 200)}) for a self-taught learner, easy to medium, in increasing difficulty. Use only problems you are sure exist, with their exact URL slug (the part after leetcode.com/problems/).\nReturn JSON: {"problems":[{"title":"","slug":"two-sum","difficulty":"Easy","why":"what it practises, one line"}]}` };
    case 'quiz_grade':
      return { json: true, max: 450, text: `You are Professor Byte, a fair tutor marking one answer said out loud or typed. ${sassLine(b.sass)}\n${b.part ? `What was just taught: ${clip(b.part, 400)}\n` : ''}${b.recent ? `What you just said in class: ${clip(b.recent, 900)}\n` : ''}Question: "${clip(b.ask, 300)}"\nModel answer (the full version, more than a learner needs to say): "${clip(b.answer, 500)}"\nThe learner said (speech recognition or typed, so forgive spelling and transcription slips): "${clip(b.reply, 1200)}"\nRead their answer IN THE CONTEXT of the question and of what you just taught: short, informal or vague answers count when the idea is right ("it splits the data so the test is fair" is right for why we hold out a test set). Never mark an answer down for being brief or for missing detail the model answer has. "right" = the core idea is correct, in any words, however short. "partial" = they said something actually wrong, or missed the ONE central idea. "wrong" = off, or they say they do not know. Do not repeat their answer back in a longer polished form.\nReturn JSON: {"verdict":"right","say":"what Byte says next, under 40 words, plain words, no markdown. Right: confirm it is right in one line in your tone; if it was brief you may add ONE short extra fact, as a bonus, not a correction. Partial: say what was right, then give the missing piece. Wrong: say plainly it is not right and give the correct answer in simple words. Do not ask a question.","mood":"proud"}\nmood is one of: proud, happy, cheeky, serious, thinking.` };
    case 'lesson_kb':
      return { json: true, max: 5000, text: `${mat}You are Professor Byte, preparing to teach ONE lesson. Research it properly once; your notes are stored and reused every time this lesson is taught, so make them complete, accurate and deep.
Course: ${clip(b.course, 160)}
Section: ${clip(b.section, 120)}
LESSON: ${clip(b.lesson, 200)}
Where it sits in the curriculum (before -> after): ${clip(b.outline, 1500)}
${b.web ? `Web research (use for accuracy and current facts; ignore anything off-topic):\n${clip(b.web, 5000)}\n` : ''}
Cover what this lesson teaches in THIS course at the right level, then go deeper than a typical video does.
Return JSON: {"summary":"3-4 sentence overview","keyterms":[{"term":"","def":"one line"}],"concepts":[{"name":"","idea":"plain explanation, 2-4 sentences","deep":"the mechanism, edge cases and why it works, 3-6 sentences","example":"a concrete worked example (code if it is a programming topic)","mistakes":["common mistake and the right idea"],"check":"a question that proves understanding","answer":"its answer"}],"prerequisites":["what to know first"],"connects":["how it links to other lessons or real work"]}
3-7 concepts, most important first. Plain English.` };
    case 'plan': {
      const slow = b.pace === 'slow'; const quick = b.pace === 'quick';
      const pacing = slow
        ? `- PACE: STEP BY STEP. This learner missed a lot, is not sure what code to write or what each line does, and wants to go slowly and deeply. Assume nothing: if the lesson relies on earlier basics, start with 1-2 short refresher steps on them. 6-10 small steps, each ONE tiny idea (one keyword, one line pattern, one concept) that can be taught in 4-6 minutes.
- For CODING lessons: build the code up a line or two per step (step 1 the first line(s), the next step adds to it), and make every check a small WRITE-IT-YOURSELF task ("write the line that ...", "write a function that ..."), with the correct code as the answer.`
        : quick ? '- PACE: QUICK REVISION. 3-5 steps covering the key ideas briskly, for someone who mostly knows this.'
          : '- 4-7 steps, each one idea that can be taught properly in 3-5 minutes.';
      return { json: true, max: slow ? 3200 : 2200, text: `${mat}Topic: ${topic}
You are about to tutor this learner one-on-one. You have read everything above: their material and the brief on them. Plan the session the way a great private tutor would.
- Teach what THEIR material covers, in a sensible order, starting where they are (${slow ? 'do not skip basics: they asked to start from the ground up' : 'skip what is marked solid'}, revisit their weak spots and quiz misses).
${pacing}
- Each step has one check question that proves they truly got it (understanding, not recall of a word) and its answer.
- If the lesson is a PROCESS or PIPELINE (data pipeline, ML training loop, request lifecycle, attack chain, compiler stages...), make each stage its own step, in order, and list the stages in "pipeline".
- "mode": "coding" if the lesson is about writing or understanding code (programming, algorithms, data structures, implementing ML in code); "math" if it is mainly maths or derivations; "lab" if it is hands-on tools or commands (cybersecurity tools, Linux, cloud consoles); otherwise "concept".
- "lang": for coding, the language this course uses (python if unsure).
- "known": 1-3 things they already seem solid on. "weak": 1-4 things to fix, from the brief.
- "opener": one cheeky line showing you actually read their notes (mention something specific from them).
Return JSON: {"title":"short session title","mode":"concept","lang":"","pipeline":[""],"opener":"","known":[""],"weak":[""],"steps":[{"title":"","goal":"what they will understand","check":"question to test it","answer":"what a good answer contains"}]}` };
    }
    case 'stage': {
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-10).map((m) => `${m.role === 'user' ? 'Learner' : 'Byte'}: ${clip(m.text, 900)}`).join('\n');
      const cut = b.interrupted ? `\nThe learner just INTERRUPTED you while you were saying: "${clip(b.interrupted, 400)}". React to being interrupted in one funny line first, then deal with what they said.` : '';
      const ask = b.level && STAGE_ASK[b.level] ? STAGE_ASK[b.level] : `The learner says: "${clip(b.question, 2000)}"${cut}\nAnswer them in plain easy words, point by point, with a board when it helps. If they are explaining something back to you, grade it honestly first (what is right, what is missing or wrong), then fill the gap. Do not quiz them.`;
      const steps = Array.isArray(b.plan?.steps) ? b.plan.steps.slice(0, 8) : [];
      const at = Math.max(0, Math.min(steps.length, Number(b.step) || 0));
      const lecture = b.level === 'teach' && !!steps[at];
      const plan = steps.length && b.level !== 'homework_check' && !lecture ? `\nLESSON PLAN (context only, the class carries on by itself afterwards):\n${steps.map((x, k) => `${k + 1}. ${clip(x.title, 80)}: ${clip(x.goal, 160)}${k < at ? ' [taught]' : k === at ? ' <- next' : ''}`).join('\n')}` : '';
      const mode = ['coding', 'math', 'lab', 'concept'].includes(b.plan?.mode) ? b.plan.mode : 'concept';
      const pipe = Array.isArray(b.plan?.pipeline) ? b.plan.pipeline.slice(0, 8) : [];
      const HOW = {
        coding: `THIS IS A CODING CLASS: teach like a CS lecturer. Put a short, correct, runnable ${clip(b.plan?.lang, 20) || 'python'} snippet (max 12 lines) on a code board and walk through it LINE BY LINE: one or two lines per scene, using "focus" to highlight exactly the lines you are explaining, saying what each line does AND why it is written that way. Keep the same code on the board while you walk it. Then TRACE it with a real input on a table board (the variables after each line or loop pass) and state the exact output. Mention the time complexity when it matters, and the classic bug people write here. The learner must come away able to WRITE this code, not just read it.`,
        math: 'THIS IS A MATHS CLASS: derive it step by step with real numbers, one transformation per scene, saying why each step is allowed. Put the working on the board (big or steps). Then do one full worked example with numbers and check the result makes sense.',
        lab: 'THIS IS A HANDS-ON LAB: use the real commands or tools, on a code board, with realistic output, and explain every flag or field and what the output tells you. For security tools, add a one-line note on using them only on systems you own or are allowed to test.',
        concept: 'Build the idea in layers: why it exists (the problem it solves), how it works step by step, a real-world example from this field, then the subtle point people miss.',
      }[mode];
      const slow = b.pace === 'slow'; const quick = b.pace === 'quick';
      const PACE = slow
        ? (mode === 'coding'
          ? `PACE: STEP BY STEP, FOR A LEARNER WHO IS NEW TO THIS. Keep snippets short (max 6 lines) and BUILD THEM UP: put the first line on the board, explain EVERY word and symbol in it in plain words as if they have never coded (keywords, names, brackets, colons, indentation, quotes, operators, what = means), and what the computer actually does when it runs that line. Only then add the next line (keep the earlier lines on the board, focus on the new one). Give an everyday analogy for any new idea. Trace it with real values and say the exact output. Point out the classic beginner mistake on this line. Finish by showing the whole snippet once more and summing up each line in one short phrase, so they could write it themselves.`
          : 'PACE: STEP BY STEP, FOR A LEARNER WHO IS NEW TO THIS. One small idea per scene, plain words, define every term the first time you use it, one everyday analogy, a concrete example, and repeat the key point at the end in one line.')
        : quick ? 'PACE: QUICK REVISION. Brisk and to the point: the key idea, one example, the gotcha.' : '';
      const scenesN = slow ? '9-14' : quick ? '4-6' : '5-9';
      const lec = lecture ? `\nTEACH PART ${at + 1} of ${steps.length}: "${clip(steps[at].title, 80)}". By the end the learner must understand: ${clip(steps[at].goal, 200)}.\nThe whole lesson: ${steps.map((x, k) => `${k + 1}. ${clip(x.title, 60)}`).join('; ')}.${pipe.length ? `\nThis lesson is a PIPELINE: ${pipe.join(' -> ')}. Keep a flow board of the whole pipeline with "active" on the stage you are explaining, and for this stage cover what goes in, what happens inside, what comes out, and why the stage is needed.` : ''}\n${b.intro === 'new' ? `This is the very start of class. Scene 1: greet them naturally and say what today is about and why it matters (it comes in ${steps.length} parts). Then start teaching.` : b.intro === 'back' ? 'The learner is back for another class on this lesson. Scene 1: welcome them back and remind them in one line where you stopped. Then carry on.' : b.intro === 'jump' ? 'The learner jumped straight to this part. Scene 1: one line saying which part this is. Then teach it.' : b.intro === 'resume' ? 'The learner is back from a short Pomodoro break. Scene 1: welcome them back with a one-line recap of what you just covered. Then carry on.' : 'Carry on naturally from what you just said (see the conversation so far). Do not greet again.'}\n${HOW}${PACE ? `\n${PACE}` : ''}\nUse ${scenesN} scenes, each ONE idea in 25-60 spoken words, flowing like a real explanation (link each scene to the last). Put the right board up in most scenes, showing exactly what you are talking about.\nDo NOT ask the learner a question in these scenes: when you finish this part, the app will ask them a check question itself. End with a one-line takeaway of this part.` : '';
      const hw = b.homework && typeof b.homework === 'object' ? b.homework : null;
      let extra = '';
      if (b.level === 'reteach') extra = `\nThe learner just answered your check question for part ${at + 1} ("${clip(steps[at]?.title, 80)}") and did not fully get it.\nQuestion: "${clip(b.check, 300)}"\nGood answer: "${clip(b.answer, 400)}"\nThey said: "${clip(b.reply, 800)}"\nFirst, in one friendly line, name exactly what they got right and what is missing or mixed up. Then teach that piece AGAIN from a different angle than before: a clearer real example, a picture or flow board, or tracing code with real values.${slow ? ' Go slower and simpler than last time: smaller pieces, every symbol explained, and if it was a write-it-yourself task, build the correct code with them one line at a time.' : ''} ${slow ? '4-7' : '3-5'} scenes. Do not ask the question again yourself (the app will).`;
      if (b.level === 'wrapup') extra = `\nCLASS TIME IS ALMOST UP (about ${Math.max(1, Number(b.minutesLeft) || 5)} minutes left). Wrap up: a quick recap of what you covered today, say what you will do NEXT class (the next unfinished step of the plan, or the next topic), then set ONE homework assignment: a short practical task they must do alone, no AI (say so, cheekily), that takes 15-40 minutes and proves today's idea. It must be handed in INSIDE Luxe: a typed answer, code written in Luxe's code editor (for coding classes this is the default: a small program or function to write), or a photo of handwritten working (maths, diagrams). Never ask for paper they cannot submit. Tell them you will check it at the start of next class. ${b.quiz ? ` Their end-of-lesson quiz: ${clip(b.quiz, 400)}. Say the score and exactly what to revise.` : ''} Also return "homework":{"title":"","task":"exactly what to do","deliverable":"what to hand in","kind":"code|text|photo","lang":"python"}.`;
      if (b.level === 'homework_check' && hw) extra = `\nBEFORE TEACHING: check the homework you set last class. Assignment: "${clip(hw.title, 100)}": ${clip(hw.task, 400)} (show: ${clip(hw.deliverable, 200)}). ${Number(hw.misses) > 0 ? `They have already skipped it ${hw.misses} time(s): be properly stern about it (still funny, never cruel).` : ''} Ask them to show it now. 1-2 scenes, no teaching yet.`;
      if (b.level === 'homework_help' && hw) extra = `\nTHE LEARNER DID NOT DO THE HOMEWORK. Assignment: "${clip(hw.title, 100)}": ${clip(hw.task, 400)} (show: ${clip(hw.deliverable, 200)}).\nDo not scold for long: one cheeky, disappointed line, then say they will do it RIGHT NOW in class. Give them a fair number of minutes for it (5-20, about half the time it would take at home) and 2-4 hints that point the way without giving the answer away (the first one gentle, the last one a strong nudge). Say the time and the hints out loud, then tell them to start, hand it in when done. 2-3 scenes, no teaching yet. Also return "minutes":10 and "hints":["hint 1","hint 2"].`;
      if (b.level === 'homework_grade' && hw && b.catchUp) {
        const sig = b.signals || {};
        extra = `\nGO THROUGH THE HOMEWORK TOGETHER. They just did it in class with your hints. Assignment: "${clip(hw.title, 100)}": ${clip(hw.task, 400)} (show: ${clip(hw.deliverable, 200)}).\n${String(b.submission || '').trim() ? `What they handed in:\n<<<${clip(b.submission, 3000)}>>>\nTyping signals: ${Number(sig.pasted) || 0} characters pasted, ${Number(sig.typed) || 0} typed, ${Number(sig.seconds) || 0} seconds.` : 'Time ran out and they handed in nothing.'}\nWalk through it part by part: say what they got right (exactly, no flattery), fix what is wrong or missing, and show the full correct answer, with the model answer or code on the board. Encouraging but honest. Then say the homework is now done and you are moving on to today's lesson. 3-6 scenes. Also return "grade":{"done":true,"score":0,"ai_suspect":false,"note":"one line: what they got right and what to remember"} with score 0-10 for what they handed in.`;
      } else if (b.level === 'homework_grade' && hw) {
        const sig = b.signals || {};
        const work = b.skipped
          ? 'They say they DID NOT DO IT. Scold them: firm, disappointed, theatrical (mood "facepalm" or "impatient"), explain why skipping hurts them, tell them it carries over to next class, then move on.'
          : `What they handed in:\n<<<${clip(b.submission, 3000)}>>>\nTyping signals from the phone: ${Number(sig.pasted) || 0} characters pasted, ${Number(sig.typed) || 0} typed, ${Number(sig.seconds) || 0} seconds spent writing.\nJudge it honestly: is it done, is it right, and did they do it themselves? Signs of AI or copying: big pasted text, a long polished answer written in seconds, generic textbook tone with no personal voice or mistakes, buzzwords, over-neat structure. If it looks like AI or copied, call it out cheekily but firmly, do not claim certainty, and make them explain one part in their own words. If it is weak or not done properly, scold them and say exactly what is missing. If it is genuinely good, praise exactly what is good (no flattery).`;
        extra = `\nGRADE THE HOMEWORK. Assignment: "${clip(hw.title, 100)}": ${clip(hw.task, 400)} (show: ${clip(hw.deliverable, 200)}).\n${work}\nThen say you are moving on to today's lesson. 1-3 scenes. Also return "grade":{"done":true,"score":0,"ai_suspect":false,"note":"one line on the verdict"} with score 0-10.`;
      }
      const live = b.live && !lecture ? `\nTHIS IS A LIVE VOICE CLASS: they hear you, so speak naturally and never read lists aloud. Answer what they said in 1-3 scenes, each under 35 words, then stop. Do not quiz them. React like a person: delighted when they are right, cheeky when they are wrong. Their words come from speech recognition, so forgive small transcription errors.` : '';
      return { json: true, max: lecture ? (slow ? 6000 : 4200) : 3000, temp: lecture || b.level === 'reteach' ? 0.5 : 0.75, system: byteSystem(b.sass), text: `${mat}Topic: ${topic}\n${hist ? `\nConversation so far:\n${hist}\n` : ''}\n${lecture ? lec : ask}${plan}${extra}${live}

${SPEAK}Perform it as ${lecture ? '4-7' : b.live ? '1-3' : '3-6'} short scenes. Each scene is one spoken line plus how you act it.
${BOARD_HELP}
Moods: happy, cheeky, excited, thinking, surprised, serious, proud, facepalm, impatient.
Gestures: wave, point (at the board), explain, think, shrug, celebrate, lean (close to the glass), knock (on the glass), laugh, facepalm, tap (drumming fingers, impatient), none.
Use "point" when a board is up. Now and then slip in a short story or fun tangent tied to the topic (at most one per answer). Never end by quizzing the learner or asking a pop question unless the request above asks for it.
Return JSON: {"scenes":[{"say":"spoken line, under 45 words, no markdown","mood":"","gesture":"","board":null}],"chips":["2-3 short replies the learner might tap"]${steps.length ? ',"advance":false' : ''}}` };
    }
    case 'capstone_ideas':
      return { json: true, max: 4000, text: `${mat}What I am learning and have built:\n${clip(b.profile, 3000)}\n${b.avoid?.length ? `Already suggested or started, do not repeat: ${b.avoid.slice(0, 15).map((t) => clip(t, 100)).join(' | ')}\n` : ''}${b.focus ? `Focus area: ${clip(b.focus, 200)}\n` : ''}
Suggest 3 ambitious capstone projects: the kind that headline a portfolio, win a hackathon or start a small business. Each must combine skills from several of my courses, solve a real problem (Kenya or Africa where it fits), and be buildable solo with free tiers in 30-80 hours. Think big but stay concrete.
For each: title, pitch (one sentence a judge would remember), problem (who has it, why it matters), skills (which of my courses it proves), stack (free tools), hours (number), milestones (6-9 in order, each a shippable step), stretch (2-3 bigger next steps), demo (how to show it in 2 minutes).
Return JSON: {"projects":[{"title":"","pitch":"","problem":"","skills":[""],"stack":[""],"hours":40,"milestones":[""],"stretch":[""],"demo":""}]}` };
    default:
      return null;
  }
}

const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
async function visionRead(images, instruction) {
  const imgs = images.filter((x) => /^data:image\//.test(x)).slice(0, 4);
  if (!imgs.length) return '';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: VISION_MODEL, temperature: 0.1, max_tokens: 2500, messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, ...imgs.map((url) => ({ type: 'image_url', image_url: { url } }))] }] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || 'vision failed');
  return clip(d.choices?.[0]?.message?.content || '', 6000);
}

// Checks a LeetCode slug really exists (title and difficulty from LeetCode itself). null = could not check.
async function leetcodeCheck(slug) {
  try {
    const r = await fetch('https://leetcode.com/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify({ query: 'query q($s: String!) { question(titleSlug: $s) { title difficulty isPaidOnly } }', variables: { s: slug } }), signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.data ? (d.data.question || false) : null;
  } catch { return null; }
}

async function groq(key, text, json, max, system = TUTOR, temperature) {
  const body = { model: GROQ_MODEL, temperature: temperature ?? (json ? 0.5 : 0.4), max_tokens: max, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system + (json ? '\nOutput only valid JSON.' : '') }, { role: 'user', content: text }] };
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error?.message || 'Groq error'); e.status = r.status; throw e; }
  return d.choices?.[0]?.message?.content || '';
}

const parseJSON = (t) => {
  try { return JSON.parse(t); } catch { /* try the outermost object */ }
  const m = String(t).match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
};

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  if (b.type === 'lesson_kb' && b.research !== false) {
    try { const r = await webSearch(`${clip(b.lesson, 120)} ${clip(b.course, 80)} explained`, { limit: 5 }); b.web = r.map((x) => `- ${x.title}: ${x.snippet}`).join('\n'); } catch { /* teach from knowledge */ }
  }
  // Homework handed in as photos: read the handwriting first, then grade it like typed work.
  if (b.type === 'stage' && b.level === 'homework_grade' && Array.isArray(b.images) && b.images.length) {
    const read = await visionRead(b.images, 'Transcribe exactly what is written or drawn in these photos of homework (code, working, answers). Keep the code formatting. Describe any diagram briefly in [brackets]. Output only the transcription.').catch(() => '');
    b.submission = `${b.submission ? `${b.submission}\n\n` : ''}[From ${b.images.length} photo${b.images.length === 1 ? '' : 's'} of handwritten work]\n${read || '(the photos could not be read clearly)'}`;
  }
  const p = prompt(b);
  if (!p) return res.status(400).json({ error: 'Unknown request type' });
  if (b.type === 'tutor' && !String(b.question || '').trim()) return res.status(400).json({ error: 'Ask a question first.' });
  const key = process.env.GROQ_API_KEY;
  let raw = '';
  try {
    if (!key) throw Object.assign(new Error('GROQ_API_KEY not set'), { status: 500 });
    raw = await groq(key, p.text, p.json, p.max, p.system || TUTOR, p.temp ?? (p.system ? 0.75 : undefined));
  } catch (e) {
    console.warn('[fedha] study AI groq failed:', e.status, e.message);
    if (nvidiaAvailable()) {
      try { raw = await nvidiaChat({ system: (p.system || TUTOR) + (p.json ? '\nOutput only valid JSON.' : ''), prompt: p.text, temperature: 0.45, maxTokens: p.max, fallback: false }); } catch (e2) { console.warn('[fedha] study AI nvidia failed:', e2.status, e2.message); }
    }
    if (!raw) return res.status(e.status === 429 ? 429 : 500).json({ error: e.status === 429 ? 'The free AI tiers are busy right now. Try again in a minute.' : 'The AI could not answer right now.' });
  }
  if (!p.json) return res.status(200).json({ text: raw.trim() });
  const obj = parseJSON(raw);
  if (b.type === 'stage') {
    const scenes = cleanScenes(obj?.scenes);
    // Unreadable JSON still gets performed: the raw text becomes one scene.
    if (!scenes.length) return res.status(200).json({ scenes: [{ say: clip(String(raw).replace(/[{}\[\]"]/g, ' ').replace(/\s+/g, ' '), 400) || 'My circuits tangled. Ask me again?', mood: 'surprised', gesture: 'shrug', board: null }], chips: [] });
    const homework = obj.homework && obj.homework.task ? { title: clip(obj.homework.title, 100) || 'Homework', task: clip(obj.homework.task, 600), deliverable: clip(obj.homework.deliverable, 240), kind: ['code', 'text', 'photo'].includes(obj.homework.kind) ? obj.homework.kind : 'text', lang: clip(obj.homework.lang, 20) } : null;
    const grade = obj.grade && typeof obj.grade === 'object' ? { done: obj.grade.done === true, score: Math.max(0, Math.min(10, Math.round(Number(obj.grade.score) || 0))), ai_suspect: obj.grade.ai_suspect === true, note: clip(obj.grade.note, 200) } : null;
    const minutes = b.level === 'homework_help' ? Math.max(5, Math.min(20, Math.round(Number(obj.minutes) || 10))) : undefined;
    const hints = b.level === 'homework_help' ? (Array.isArray(obj.hints) ? obj.hints : []).map((h) => clip(h, 220)).filter(Boolean).slice(0, 4) : undefined;
    return res.status(200).json({ advance: obj.advance === true, homework, grade, minutes, hints, scenes, chips: (Array.isArray(obj.chips) ? obj.chips : []).map((c) => clip(c, 60)).filter(Boolean).slice(0, 3) });
  }
  if (!obj) return res.status(500).json({ error: 'The AI answer could not be read. Try again.' });
  if (b.type === 'quiz') {
    const questions = (obj.questions || []).filter((q) => q?.q && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(Number(q.answer)) && Number(q.answer) < q.options.length)
      .map((q) => ({ q: clip(q.q, 500), options: q.options.slice(0, 4).map((o) => clip(o, 240)), answer: Number(q.answer), why: clip(q.why, 400) }));
    return questions.length ? res.status(200).json({ questions }) : res.status(500).json({ error: 'No usable questions came back. Try again.' });
  }
  if (b.type === 'quiz_pack') {
    const say = (v, n) => clip(String(v ?? '').replace(/[*_#`]/g, ''), n).trim();
    const questions = (Array.isArray(obj.questions) ? obj.questions : []).filter((q) => q?.ask && q?.answer).slice(0, 7)
      .map((q) => ({ ask: say(q.ask, 260), hint: say(q.hint, 300), answer: say(q.answer, 400), simple: say(q.simple, 500) }));
    return questions.length ? res.status(200).json({ questions }) : res.status(500).json({ error: 'No quiz came back.' });
  }
  if (b.type === 'quiz_grade') {
    const verdict = ['right', 'partial', 'wrong'].includes(obj.verdict) ? obj.verdict : 'partial';
    const sayText = clip(String(obj.say || '').replace(/[*_#`]/g, ''), 420).trim();
    if (!sayText) return res.status(500).json({ error: 'No verdict came back.' });
    return res.status(200).json({ verdict, say: sayText, mood: MOODS.includes(obj.mood) ? obj.mood : verdict === 'right' ? 'proud' : 'serious' });
  }
  if (b.type === 'cards') {
    const cards = (obj.cards || []).filter((c) => c?.q && c?.a).map((c) => ({ q: clip(c.q, 400), a: clip(c.a, 600) }));
    return cards.length ? res.status(200).json({ cards }) : res.status(500).json({ error: 'No usable flashcards came back. Try again.' });
  }
  if (b.type === 'project_ideas') return res.status(200).json({ projects: (obj.projects || []).slice(0, 3) });
  if (b.type === 'lab_project') {
    const ms = (Array.isArray(obj.milestones) ? obj.milestones : []).filter((m) => m?.title).slice(0, 6).map((m) => ({ title: clip(m.title, 100), goal: clip(m.goal, 400), criteria: (Array.isArray(m.criteria) ? m.criteria : []).map((c) => clip(c, 200)).slice(0, 5), hint: clip(m.hint, 300) }));
    if (!ms.length) return res.status(500).json({ error: 'Byte could not design the lab. Try again.' });
    return res.status(200).json({ title: clip(obj.title, 100), brief: clip(obj.brief, 800), why: clip(obj.why, 300), domain: clip(obj.domain, 20), lang: clip(obj.lang, 20).toLowerCase() || 'python', files: (Array.isArray(obj.files) ? obj.files : []).filter((f) => f?.name).slice(0, 4).map((f) => ({ name: clip(f.name, 60), content: clip(f.content, 7000) })), milestones: ms, stretch: (obj.stretch || []).map((x) => clip(x, 200)).slice(0, 3) });
  }
  if (b.type === 'lab_review') {
    return res.status(200).json({ review: { done: obj.done === true, score: Math.max(0, Math.min(10, Math.round(Number(obj.score) || 0))), say: clip(obj.say, 700), good: (obj.good || []).map((x) => clip(x, 200)).slice(0, 4), fixes: (Array.isArray(obj.fixes) ? obj.fixes : []).slice(0, 8).map((f) => ({ file: clip(f?.file, 60), line: Number(f?.line) || null, note: clip(f?.note, 300) })), growth: clip(obj.growth, 300), next: clip(obj.next, 300) } });
  }
  if (b.type === 'missed_check') {
    const qs = (obj.questions || []).filter((q) => q?.ask).slice(0, 2).map((q) => ({ ask: clip(q.ask, 300), answer: clip(q.answer, 400) }));
    return qs.length ? res.status(200).json({ questions: qs }) : res.status(500).json({ error: 'No questions came back.' });
  }
  if (b.type === 'leetcode') {
    const list = (Array.isArray(obj.problems) ? obj.problems : []).filter((x) => x?.slug && /^[a-z0-9-]+$/.test(x.slug)).slice(0, 4);
    const checked = await Promise.all(list.map(async (x) => {
      const q = await leetcodeCheck(x.slug);
      if (q === false || q?.isPaidOnly) return null; // made up, or premium-only
      return { title: clip(q?.title || x.title, 100), difficulty: clip(q?.difficulty || x.difficulty, 12), why: clip(x.why, 200), url: `https://leetcode.com/problems/${x.slug}/`, verified: !!q };
    }));
    const problems = checked.filter(Boolean).slice(0, 3);
    return res.status(200).json({ problems, search: `https://leetcode.com/problemset/?search=${encodeURIComponent(clip(topic, 60))}` });
  }
  if (b.type === 'code_task') {
    if (!obj.prompt) return res.status(500).json({ error: 'No exercise came back. Try again.' });
    return res.status(200).json({ task: { title: clip(obj.title, 100), prompt: clip(obj.prompt, 2000), lang: clip(obj.lang || b.lang, 20).toLowerCase() || 'python', starter: clip(obj.starter, 1500), examples: (Array.isArray(obj.examples) ? obj.examples : []).slice(0, 4).map((e) => ({ input: clip(e?.input, 300), output: clip(e?.output, 300) })), hint: clip(obj.hint, 400), solution: clip(obj.solution, 3000), fn: clip(obj.fn, 60), tests: (Array.isArray(obj.tests) ? obj.tests : []).slice(0, 6).filter((t) => Array.isArray(t?.args)) } });
  }
  if (b.type === 'code_review') {
    return res.status(200).json({ review: { verdict: ['pass', 'almost', 'fail'].includes(obj.verdict) ? obj.verdict : 'almost', say: clip(obj.say, 600), lines: (Array.isArray(obj.lines) ? obj.lines : []).filter((l) => Number(l?.line) > 0).slice(0, 12).map((l) => ({ line: Number(l.line), note: clip(l.note, 240) })), fixed: clip(obj.fixed, 4000), next: clip(obj.next, 300) } });
  }
  if (b.type === 'lesson_kb' && obj?.concepts?.length) {
    // A second pass, once per lesson (it is stored): a strict reviewer fixes wrong facts, broken code and wrong outputs.
    try {
      const rev = await groq(key, `You are a strict technical reviewer. Below are a professor's teaching notes for the lesson "${clip(b.lesson, 160)}" (course: ${clip(b.course, 120)}). Check every fact, definition, number, code example and stated output. Fix anything wrong, outdated, misleading or not runnable; make examples realistic; keep everything that is right. Return the SAME JSON structure, corrected.\n\n${JSON.stringify(obj).slice(0, 14000)}`, true, 5000, 'You review technical teaching material for accuracy. Output only valid JSON.', 0.2);
      const fixed = parseJSON(rev);
      if (fixed?.concepts?.length) { obj.summary = fixed.summary || obj.summary; obj.keyterms = fixed.keyterms || obj.keyterms; obj.concepts = fixed.concepts; obj.prerequisites = fixed.prerequisites || obj.prerequisites; obj.connects = fixed.connects || obj.connects; }
    } catch { /* keep the first version */ }
  }
  if (b.type === 'lesson_kb') {
    const arr = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
    const concepts = (Array.isArray(obj.concepts) ? obj.concepts : []).filter((c) => c?.name).slice(0, 7).map((c) => ({
      name: clip(c.name, 100), idea: clip(c.idea, 700), deep: clip(c.deep, 1200), example: clip(c.example, 1200), mistakes: arr(c.mistakes, 4, 260), check: clip(c.check, 300), answer: clip(c.answer, 500),
    }));
    if (!concepts.length) return res.status(500).json({ error: 'Byte could not study this lesson. Try again.' });
    return res.status(200).json({ kb: { summary: clip(obj.summary, 900), keyterms: (Array.isArray(obj.keyterms) ? obj.keyterms : []).filter((k) => k?.term).slice(0, 10).map((k) => ({ term: clip(k.term, 60), def: clip(k.def, 200) })), concepts, prerequisites: arr(obj.prerequisites, 5, 160), connects: arr(obj.connects, 5, 200), at: new Date().toISOString() } });
  }
  if (b.type === 'plan') {
    const steps = (Array.isArray(obj.steps) ? obj.steps : []).filter((x) => x?.title).slice(0, 8).map((x) => ({ title: clip(x.title, 80), goal: clip(x.goal, 200), check: clip(x.check, 220), answer: clip(x.answer, 400) }));
    if (!steps.length) return res.status(500).json({ error: 'No lesson plan came back.' });
    const mode = ['coding', 'math', 'lab', 'concept'].includes(obj.mode) ? obj.mode : 'concept';
    return res.status(200).json({ plan: { title: clip(obj.title, 80), mode, lang: mode === 'coding' ? clip(obj.lang, 20).toLowerCase() || 'python' : '', pipeline: (Array.isArray(obj.pipeline) ? obj.pipeline : []).map((x) => clip(x, 50)).filter(Boolean).slice(0, 8), opener: clip(obj.opener, 300), known: (obj.known || []).map((x) => clip(x, 120)).slice(0, 3), weak: (obj.weak || []).map((x) => clip(x, 120)).slice(0, 4), steps } });
  }
  if (b.type === 'capstone_ideas') return res.status(200).json({ projects: (obj.projects || []).filter((x) => x?.title).slice(0, 3) });
  return res.status(200).json(obj);
}

// Keeps only well-formed scenes and boards, so the stage never draws garbage.
const MOODS = ['happy', 'cheeky', 'excited', 'thinking', 'surprised', 'serious', 'proud', 'facepalm', 'impatient'];
const GESTURES = ['wave', 'point', 'explain', 'think', 'shrug', 'celebrate', 'lean', 'knock', 'laugh', 'facepalm', 'tap', 'none'];
const strs = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
function cleanBoard(bd) {
  if (!bd || typeof bd !== 'object') return null;
  switch (bd.type) {
    case 'chart': {
      const points = (Array.isArray(bd.points) ? bd.points : []).filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[1])))
        .map((p) => [typeof p[0] === 'number' ? p[0] : clip(p[0], 14), Number(p[1])]).slice(0, 12);
      return points.length >= 2 ? { type: 'chart', kind: bd.kind === 'bar' ? 'bar' : 'line', title: clip(bd.title, 60), x: clip(bd.x, 30), y: clip(bd.y, 30), points } : null;
    }
    case 'steps': { const items = strs(bd.items, 6, 140); return items.length ? { type: 'steps', title: clip(bd.title, 60), items } : null; }
    case 'code': {
      if (!bd.code) return null;
      const code = String(bd.code).split('\n').slice(0, 18).join('\n').slice(0, 1100);
      const n = code.split('\n').length;
      const focus = (Array.isArray(bd.focus) ? bd.focus : []).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= n).slice(0, 6);
      return { type: 'code', lang: clip(bd.lang, 20), code, focus, note: clip(bd.note, 160) };
    }
    case 'table': {
      const headers = strs(bd.headers, 5, 24);
      const rows = (Array.isArray(bd.rows) ? bd.rows : []).filter(Array.isArray).slice(0, 8).map((r) => r.slice(0, headers.length || 5).map((c) => clip(c, 28)));
      return headers.length && rows.length ? { type: 'table', title: clip(bd.title, 60), headers, rows } : null;
    }
    case 'big': return bd.text ? { type: 'big', text: clip(bd.text, 80), sub: clip(bd.sub, 120) } : null;
    case 'compare': {
      const side = (x) => (x && x.title ? { title: clip(x.title, 40), items: strs(x.items, 5, 90) } : null);
      const l = side(bd.left), r = side(bd.right); return l && r ? { type: 'compare', left: l, right: r } : null;
    }
    case 'flow': { const nodes = strs(bd.nodes, 7, 60); const active = Number.isInteger(Number(bd.active)) && Number(bd.active) >= 0 && Number(bd.active) < nodes.length ? Number(bd.active) : -1; return nodes.length >= 2 ? { type: 'flow', title: clip(bd.title, 60), nodes, active } : null; }
    case 'story': return bd.text ? { type: 'story', title: clip(bd.title, 60), text: clip(bd.text, 600) } : null;
    case 'animate': {
      const actors = (Array.isArray(bd.actors) ? bd.actors : []).filter((a) => a && a.id && a.emoji).slice(0, 6).map((a) => ({ id: clip(a.id, 16), emoji: clip(a.emoji, 8), label: clip(a.label, 20) }));
      const ids = new Set(actors.map((a) => a.id));
      const FXS = ['pulse', 'shake', 'spin', 'grow', 'fade', 'hide', 'show', 'bounce'];
      const num = (v) => Math.max(4, Math.min(96, Number(v) || 50));
      const frames = (Array.isArray(bd.frames) ? bd.frames : []).slice(0, 6).map((f) => ({
        caption: clip(f?.caption, 100),
        pos: Object.fromEntries(Object.entries(f?.pos || {}).filter(([k, v]) => ids.has(k) && Array.isArray(v)).map(([k, v]) => [k, [num(v[0]), num(v[1])]])),
        fx: Object.fromEntries(Object.entries(f?.fx || {}).filter(([k, v]) => ids.has(k) && FXS.includes(v))),
      }));
      return actors.length && frames.length >= 2 ? { type: 'animate', title: clip(bd.title, 60), actors, frames } : null;
    }
    case 'picture': {
      const items = (Array.isArray(bd.items) ? bd.items : []).filter((x) => x && x.emoji).slice(0, 4).map((x) => ({ emoji: clip(x.emoji, 8), label: clip(x.label, 28), note: clip(x.note, 60) }));
      if (!items.length) return null;
      return { type: 'picture', title: clip(bd.title, 60), items, join: ['→', '+', 'vs', '=', '←', '↔'].includes(bd.join) ? bd.join : '', wiki: clip(String(bd.wiki || '').replace(/[^\w\s()'.,-]/g, ''), 60), scene: clip(bd.scene, 200), caption: clip(bd.caption, 120) };
    }
    default: return null;
  }
}
function cleanScenes(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && String(x.say || '').trim()).slice(0, 7).map((x) => ({
    say: clip(String(x.say).replace(/[*_#`]/g, ''), 420),
    mood: MOODS.includes(x.mood) ? x.mood : 'happy',
    gesture: GESTURES.includes(x.gesture) ? x.gesture : 'none',
    board: cleanBoard(x.board),
  }));
}
