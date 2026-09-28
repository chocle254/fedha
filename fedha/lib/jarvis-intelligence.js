export function detectJarvisRole(message = '') {
  const m = String(message).toLowerCase();
  if (/startup|venture|investor|business model|market|customer|traction|funding|pitch/.test(m)) return 'startup_advisor';
  if (/code|coding|bug|debug|deploy|github|git|api|database|frontend|backend|react|python|technical|architecture/.test(m)) return 'technical_assistant';
  if (/cv|resume|job|career|interview|internship|portfolio|certificate/.test(m)) return 'career_coach';
  if (/money|budget|balance|expense|income|loan|saving|financial/.test(m)) return 'financial_manager';
  if (/meeting|presentation|demo|nervous|anxious|scared|overwhelmed|deadline/.test(m)) return 'situation_coach';
  return 'personal_assistant';
}

export function detectJarvisSituation(message = '') {
  const m = String(message).toLowerCase();
  if (/about to pitch|pitching|presentation|presenting|demo/.test(m)) return 'pitch_or_demo';
  if (/meeting|call with|interview|about to join|joining/.test(m)) return 'meeting_or_interview';
  if (/nervous|anxious|scared|panicking|overwhelmed|stressed/.test(m)) return 'high_pressure_moment';
  if (/deadline|due today|due tomorrow|running out of time/.test(m)) return 'deadline_pressure';
  if (/decide|decision|should i|what should i do|stuck|confused/.test(m)) return 'decision_point';
  return 'normal';
}

export function getJarvisRoleGuidance(role, situation) {
  const guidance = {
    startup_advisor: 'Startup advisor mode: test assumptions, challenge weak business logic, examine customers, economics, competition and evidence, then give concrete next steps.',
    technical_assistant: 'Technical assistant mode: use known project context, diagnose before changing things, protect working functionality, and give concrete implementation steps.',
    career_coach: 'Career coach mode: ground advice in actual projects, certificates and achievements.',
    financial_manager: 'Financial manager mode: use live Fedha numbers, protect cash flow, and turn goals into measurable actions.',
    situation_coach: 'Situation coach mode: focus first on what is happening now and the smallest useful next action.',
    personal_assistant: 'Personal assistant mode: connect the request to relevant memories, goals, projects and live Fedha state.',
  };
  return (guidance[role] || guidance.personal_assistant) + (situation !== 'normal' ? ' Current situation: ' + situation + '.' : '');
}
