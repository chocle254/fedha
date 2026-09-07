// Workout coach: the per-rep shouting has to be instant (no network round
// trip while you're mid-pushup), so this is a local phrase bank + speech
// synthesis, not a live call to /api/jarvis. Jarvis DOES get involved for
// the pre-workout hype-up and the post-workout summary (components/
// PoseCamera.js calls /api/jarvis directly for those, where a couple
// seconds of latency before/after the set doesn't matter).

const REP_CALLOUTS = [
  "One more!", "Keep going!", "There it is!", "Good rep!", "Push!",
  "That's it!", "Stay strong!", "Don't stop now!", "Nice!", "Again!",
];

const MILESTONE_LINES = {
  halfway: ["Halfway there — don't quit on me now.", "Half done. This is where it counts.", "Halfway! Dig in."],
  nearEnd: ["Almost there — finish strong!", "Last few — give me everything!", "This is the set. Push through!"],
  final: ["Last rep — make it count!", "One more. All the way!", "Final rep — leave nothing left!"],
  done: ["That's it — set complete. Well done.", "Done! Shake it out.", "Set finished — good work."],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function speak(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.1;
    utter.pitch = 0.9; // slightly lower — reads more "coach", less "assistant"
    window.speechSynthesis.speak(utter);
  } catch {}
}

// Call this every time the rep counter increments. Fires an instant local
// callout, and a milestone line at the halfway point, near the end, and on
// the final rep — deliberately sparse so it doesn't talk over every single
// rep, only the moments that matter.
export function announceRep(reps, targetReps) {
  if (reps === targetReps) {
    speak(pick(MILESTONE_LINES.final));
  } else if (reps === targetReps - 1 && targetReps > 3) {
    speak(pick(MILESTONE_LINES.nearEnd));
  } else if (reps === Math.floor(targetReps / 2) && targetReps >= 6) {
    speak(pick(MILESTONE_LINES.halfway));
  } else {
    speak(pick(REP_CALLOUTS));
  }
}

export function announceSetComplete() {
  speak(pick(MILESTONE_LINES.done));
}

// Pre-workout hype and post-workout summary go through the real Jarvis API
// since they're not latency-sensitive and benefit from knowing the actual
// exercise/plan context — kept here as thin wrappers so PoseCamera.js
// doesn't need to know the request shape.
export async function getPreWorkoutHype(exerciseName, targetReps, setNum, totalSets) {
  try {
    const res = await fetch('/api/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `(Internal trigger — the user is about to start a workout set.) Give ONE short, punchy hype-up line (under 15 words) like a coach before a set of ${exerciseName}, ${targetReps} reps, set ${setNum} of ${totalSets}. No commentary, just the line.`,
        context: '', memory: '', history: [],
      }),
    });
    const data = await res.json();
    return data.reply || `Let's go — ${targetReps} ${exerciseName}. Set ${setNum} of ${totalSets}.`;
  } catch {
    return `Let's go — ${targetReps} ${exerciseName}. Set ${setNum} of ${totalSets}.`;
  }
}

export async function getPostWorkoutSummary(exerciseName, totalReps, totalSets) {
  try {
    const res = await fetch('/api/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `(Internal trigger — the user just finished their workout.) Give ONE short, genuine congratulations line (under 20 words) for finishing ${totalSets} sets of ${exerciseName} (${totalReps} total reps). Proud coach energy, not generic.`,
        context: '', memory: '', history: [],
      }),
    });
    const data = await res.json();
    return data.reply || `Great work — ${totalReps} reps of ${exerciseName} done across ${totalSets} sets.`;
  } catch {
    return `Great work — ${totalReps} reps of ${exerciseName} done across ${totalSets} sets.`;
  }
}
