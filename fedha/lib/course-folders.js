// lib/course-folders.js — sorts courses into folders by subject (AI, Cybersecurity, Data, Cloud, Software, Maths,
// Business, Other). Picked automatically from the course's name, provider and description; a course can be put in a
// folder by hand (course.folder), which always wins.
export const FOLDERS = [
  { id: 'ai', name: 'AI & Machine Learning', icon: '🤖', color: '#A78BFA', words: /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|deep learning|neural|llm|gpt|transformer|nlp|computer vision|agents?|generative|genai|prompt|reinforcement|pytorch|tensorflow|keras|hugging ?face|langchain|rag|diffusion|chatbot)\b/i },
  { id: 'cyber', name: 'Cybersecurity', icon: '🛡️', color: '#F87171', words: /\b(cyber\w*|security|secure|hack\w*|ethical hack|pentest\w*|penetration|malware|forensic\w*|soc\b|siem|threat|vulnerab|exploit|ctf|cryptograph|network security|comptia|security\+|cissp|ceh|osint|incident response|blue team|red team|kali|nmap|wireshark)\b/i },
  { id: 'data', name: 'Data', icon: '📊', color: '#60A5FA', words: /\b(data science|data analy|analytics|sql|database|pandas|numpy|statistics|excel|power ?bi|tableau|big data|spark|etl|visuali[sz]ation|data engineer)\b/i },
  { id: 'cloud', name: 'Cloud & DevOps', icon: '☁️', color: '#22D3EE', words: /\b(cloud|aws|azure|gcp|google cloud|devops|docker|kubernetes|k8s|terraform|ci\/cd|linux|sysadmin|networking|ccna|serverless)\b/i },
  { id: 'software', name: 'Software & Web', icon: '💻', color: '#34D399', words: /\b(cs50|computer science|programming|coding|code|python|javascript|typescript|java\b|c\+\+|c#|golang|rust|react|next\.?js|node|web dev|frontend|backend|full ?stack|html|css|api|algorithms?|data structures|leetcode|software|mobile|android|ios|flutter|git)\b/i },
  { id: 'math', name: 'Maths', icon: '📐', color: '#FBBF24', words: /\b(math|maths|mathematics|calculus|algebra|linear algebra|probability|discrete)\b/i },
  { id: 'business', name: 'Business & Money', icon: '💼', color: '#F59E0B', words: /\b(business|startup|marketing|finance|trading|invest|forex|accounting|sales|entrepreneur|product management|economics)\b/i },
  { id: 'other', name: 'Other', icon: '📁', color: '#94A3B8', words: /$^/ },
];
export const folderOf = (c) => {
  if (c?.folder && FOLDERS.some((f) => f.id === c.folder)) return c.folder;
  const text = `${c?.title || ''} ${c?.provider || ''} ${c?.description || ''}`;
  // Title first (a "Python for AI" course is AI), then everything.
  for (const src of [c?.title || '', text]) { const hit = FOLDERS.find((f) => f.id !== 'other' && f.words.test(src)); if (hit) return hit.id; }
  return 'other';
};
export const folderInfo = (id) => FOLDERS.find((f) => f.id === id) || FOLDERS[FOLDERS.length - 1];
