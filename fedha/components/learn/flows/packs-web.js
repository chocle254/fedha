import { R, S, fallback, register } from './engine';

const html = fallback({ id: 'html', langs: ['html'], steps: [
  S('hskel', 'Page skeleton', /<!DOCTYPE/i, R`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>«1:Page title»</title>
</head>
<body>
</body>
</html>
`),
  S('hhead', 'Link the stylesheet', /<link[^>]+stylesheet/i, `  <link rel="stylesheet" href="«1:style.css»">\n`, '</head>'),
  S('hnav', 'Header and navigation', /<nav|<header/i, R`  <header>
    <nav>
      <a href="#«1:home»">«2:Home»</a>
      <a href="#«3:about»">«4:About»</a>
      <a href="#«5:contact»">«6:Contact»</a>
    </nav>
  </header>
`, '</body>'),
  S('hmain', 'Main sections', /<main|<section/i, R`  <main>
    <section id="«1:home»">
      <h1>«2:Welcome»</h1>
      <p>«3:One sentence about this page.»</p>
    </section>
    <section id="«4:about»">
      <h2>«5:About»</h2>
      <p>«6:More detail.»</p>
    </section>
  </main>
`, '</body>'),
  S('hform', 'A form', /<form/i, R`  <form id="«1:contact-form»">
    <label for="«2:email»">«3:Email»</label>
    <input type="email" id="«2:email»" name="«2:email»" required>
    <label for="«4:message»">«5:Message»</label>
    <textarea id="«4:message»" name="«4:message»" rows="4" required></textarea>
    <button type="submit">«6:Send»</button>
  </form>
`, '</body>'),
  S('hfoot', 'Footer', /<footer/i, R`  <footer>
    <p>&copy; «1:2026» «2:Your name»</p>
  </footer>
`, '</body>'),
  S('hscript', 'Link the script', /<script/i, `  <script src="«1:app.js»"></script>\n`, '</body>'),
] });

const css = fallback({ id: 'css', langs: ['css'], steps: [
  S('cvars', 'Reset and variables', /:root|--[\w-]+\s*:/, R`:root {
  --bg: «1:#0f1115»;
  --text: «2:#e6e6e6»;
  --accent: «3:#4f9cff»;
  --radius: 10px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}
`),
  S('clayout', 'Layout (flex and grid)', /display\s*:\s*(flex|grid)/, R`.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 1rem;
}

nav { display: flex; gap: 1rem; align-items: center; }

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
`),
  S('ccomp', 'Buttons and cards', /\.(btn|button|card)\b/, R`.card {
  background: #1a1d24;
  border-radius: var(--radius);
  padding: 1rem;
}

.btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: var(--radius);
  padding: 0.6rem 1.2rem;
  cursor: pointer;
}
.btn:hover { filter: brightness(1.1); }
`),
  S('cmedia', 'Responsive (mobile first)', /@media/, R`@media (max-width: «1:600px») {
  nav { flex-direction: column; align-items: flex-start; }
  .container { padding: 0.75rem; }
}
`),
  S('cdark', 'Respect light / dark mode', /prefers-color-scheme/, R`@media (prefers-color-scheme: light) {
  :root { --bg: #ffffff; --text: #111111; }
}
`),
] });

const readme = fallback({ id: 'readme', langs: ['md'], steps: [
  S('mtitle', 'Title and summary', /^#\s+\S/m, R`# «1:Project name»

«2:One sentence: what it does and who it is for.»
`),
  S('mwhy', 'What and why', /^##\s*(about|overview|what|why|background)/im, R`## About

«1:The problem this solves, and how.»
`),
  S('minstall', 'Install', /^##\s*(install|setup|getting started)/im, R`## Install

1. «1:Clone or download the project»
2. «2:Install what it needs»
`),
  S('musage', 'Usage', /^##\s*usage/im, '## Usage\n\n' + '`'.repeat(3) + '\n«1:command or code that shows it working»\n' + '`'.repeat(3) + '\n'),
  S('mresults', 'Results', /^##\s*(results|demo|screenshots|findings)/im, R`## Results

«1:What it found or produced, with one number or screenshot.»
`),
  S('mlicense', 'License', /^##\s*licen[sc]e/im, R`## License

«1:MIT»
`),
] });

register(html, css, readme);
