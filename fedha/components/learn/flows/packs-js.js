import { R, S, chain, fallback, register } from './engine';
const JS = ['javascript'];

const express = chain({ id: 'js-express', langs: JS, detect: /\bexpress\b|require\(["']http["']\)/, steps: [
  S('xapp', 'Set up the Express app', /express\(\)/, R`const express = require("express");

const app = express();
app.use(express.json());
`),
  S('xget', 'GET routes', /app\.get\(/, R`const items = [{ id: 1, name: "«1:first item»" }];

app.get("/api/«2:items»", (req, res) => {
  res.json(items);
});

app.get("/api/«2:items»/:id", (req, res) => {
  const item = items.find((i) => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "not found" });
  res.json(item);
});
`),
  S('xpost', 'POST with validation', /app\.post\(/, R`app.post("/api/«1:items»", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  const item = { id: items.length + 1, name };
  items.push(item);
  res.status(201).json(item);
});
`),
  S('xerr', 'Error handler', /\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/, R`// Must come after the routes
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "something went wrong" });
});
`),
  S('xlisten', 'Start the server', /app\.listen\(/, R`const PORT = process.env.PORT || «1:3000»;
app.listen(PORT, () => console.log("listening on " + PORT));
`),
] });

const react = chain({ id: 'js-react', langs: JS, detect: /from\s+["']react["']|\buseState\b|\bReact\./, steps: [
  S('rcomp', 'A component', /function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=\s*\(/, R`import { useState, useEffect } from "react";

export default function «1:App»() {
  return (
    <main>
      <h1>«2:Hello»</h1>
    </main>
  );
}
`),
  S('rstate', 'State', /useState\(/, R`const [«1:count», set«2:Count»] = useState(0);
// then, inside the JSX:
// <button onClick={() => set«2:Count»(«1:count» + 1)}>{«1:count»}</button>
`),
  S('reffect', 'Load data (useEffect)', /useEffect\(/, R`const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  fetch("«1:/api/items»")
    .then((res) => res.json())
    .then(setData)
    .catch(setError)
    .finally(() => setLoading(false));
}, []);
`),
  S('rlist', 'Render a list', /\.map\(\s*\(?\w+\)?\s*=>\s*\(?\s*<|\.map\(.*<\w+[^>]*key=/s, R`if (loading) return <p>Loading...</p>;
if (error) return <p>Something went wrong.</p>;

return (
  <ul>
    {data.map((item) => (
      <li key={item.id}>{item.«1:name»}</li>
    ))}
  </ul>
);
`),
  S('rform', 'A form', /onSubmit/, R`const [text, setText] = useState("");

function handleSubmit(event) {
  event.preventDefault();
  if (!text.trim()) return;
  // save it, then clear the box
  setText("");
}

// <form onSubmit={handleSubmit}>
//   <input value={text} onChange={(e) => setText(e.target.value)} />
//   <button type="submit">Add</button>
// </form>
`),
] });

const dom = chain({ id: 'js-dom', langs: JS, detect: /\bdocument\.|querySelector|addEventListener|innerHTML|getElementById/, steps: [
  S('dselect', 'Select the elements', /querySelector|getElementById/, R`const «1:input» = document.querySelector("#«2:task-input»");
const «3:button» = document.querySelector("#«4:add-button»");
const «5:list» = document.querySelector("#«6:task-list»");
`),
  S('devent', 'Handle a click', /addEventListener\(/, R`«1:button».addEventListener("click", () => {
  const value = «2:input».value.trim();
  if (!value) return;
  // add it, then clear the box
  «2:input».value = "";
});
`),
  S('drender', 'Render to the page', /createElement|innerHTML|textContent/, R`function render(items) {
  «1:list».innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    «1:list».appendChild(li);
  }
}
`),
  S('dsave', 'Remember it (localStorage)', /localStorage/, R`function load() {
  try {
    return JSON.parse(localStorage.getItem("«1:items»")) || [];
  } catch {
    return [];
  }
}

function save(items) {
  localStorage.setItem("«1:items»", JSON.stringify(items));
}
`),
] });

const fetchPack = chain({ id: 'js-fetch', langs: JS, detect: /\bfetch\(|\baxios\b/, steps: [
  S('ffetch', 'Fetch JSON', /await\s+fetch\(|\.then\(/, R`async function load«1:Data»() {
  const response = await fetch("«2:https://api.example.com/data»");
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}
`),
  S('fstates', 'Loading and error states', /\.catch\(|catch\s*\(/, R`async function show«1:Data»() {
  try {
    console.log("loading...");
    const data = await load«1:Data»();
    console.log(data);
  } catch (err) {
    console.error("failed:", err.message);
  }
}
`),
  S('fretry', 'Retry with backoff', /retries|attempt/i, R`async function withRetry(fn, attempts = «1:3») {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2 ** i * 500));
    }
  }
}
`),
] });

const chainJs = chain({ id: 'blockchain-js', langs: JS, detect: /\bethers\b|\bweb3\b|\bWeb3\b|hardhat|\bclass\s+Block\b|blockchain|createHash/i, steps: [
  S('bjs', 'Block class (SHA-256)', /class\s+Block\b|ethers|web3/i, R`const crypto = require("crypto");

class Block {
  constructor(index, data, previousHash) {
    this.index = index;
    this.timestamp = Date.now();
    this.data = data;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.computeHash();
  }

  computeHash() {
    const content = JSON.stringify([this.index, this.timestamp, this.data, this.previousHash, this.nonce]);
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  mine(difficulty = «1:4») {
    const prefix = "0".repeat(difficulty);
    while (!this.hash.startsWith(prefix)) {
      this.nonce++;
      this.hash = this.computeHash();
    }
  }
}
`),
  S('bchain', 'Chain and validation', /class\s+Blockchain\b|isValid/, R`class Blockchain {
  constructor() {
    this.chain = [new Block(0, "genesis", "0")];
  }

  add(data) {
    const block = new Block(this.chain.length, data, this.chain.at(-1).hash);
    block.mine();
    this.chain.push(block);
  }

  isValid() {
    return this.chain.every((block, i) =>
      block.hash === block.computeHash() && (i === 0 || block.previousHash === this.chain[i - 1].hash));
  }
}
`),
  S('bprovider', 'Connect to a network (ethers)', /JsonRpcProvider|BrowserProvider/, R`const { ethers } = require("ethers");

// A local test network (e.g. Hardhat or Anvil), never a real wallet's key
const provider = new ethers.JsonRpcProvider("«1:http://127.0.0.1:8545»");
provider.getBlockNumber().then((n) => console.log("block", n));
`),
  S('bwallet', 'Wallet and balance', /ethers\.Wallet|getSigner/, R`const wallet = new ethers.Wallet("«1:TEST private key from your local node»", provider);
provider.getBalance(wallet.address).then((b) => console.log(ethers.formatEther(b), "ETH"));
`),
  S('bcontract', 'Call a contract', /new\s+ethers\.Contract/, R`const abi = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
const token = new ethers.Contract("«1:0xContractAddress»", abi, wallet);
token.balanceOf(wallet.address).then((b) => console.log(b.toString()));
`),
  S('bsend', 'Send a transaction and wait', /\.wait\(/, R`async function send(to, amount) {
  const tx = await token.transfer(to, ethers.parseUnits(String(amount), 18));
  const receipt = await tx.wait();
  console.log("mined in block", receipt.blockNumber);
}
`),
] });

const generalJs = fallback({ id: 'js-general', langs: JS, steps: [
  S('jfunc', 'A function', /\bfunction\s+\w+|=>/, R`function «1:name»(«2:value») {
  return «2:value»;
}
`),
  S('jarray', 'Array pipeline', /\.(map|filter|reduce)\(/, R`const numbers = [«1:1, 2, 3, 4, 5»];
const result = numbers
  .filter((n) => n % 2 === 0)
  .map((n) => n * 2)
  .reduce((sum, n) => sum + n, 0);
console.log(result);
`),
  S('jerr', 'Handle errors', /\btry\s*\{|\.catch\(/, R`try {
  const data = JSON.parse("«1:{"ok": true}»");
  console.log(data);
} catch (err) {
  console.error("bad input:", err.message);
}
`),
  S('jasync', 'Async / await', /\basync\b|\bawait\b|Promise/, R`const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await wait(«1:500»);
  console.log("done");
}
main();
`),
  S('jtest', 'Checks (tests)', /console\.assert|\bassert\(/, R`console.assert(«1:name»(«2:2») === «3:2», "«1:name»(2) should be 2");
console.log("checks finished");
`),
] });

register(express, react, dom, fetchPack, chainJs, generalJs);
