import { R, S, chain, fallback, mlPack, register } from './engine';
const PY = ['python'];

// ── Cybersecurity (labs run on synthetic data, on the learner's own machine) ──────────────────────────────
const cyberLog = chain({ id: 'cyber-log', langs: PY, domains: ['cyber'], detect: /failed password|invalid user|auth\.log|access\.log|\.log["')]|syslog/i, steps: [
  S('readlog', 'Read the log file', /\bwith open\(|read_csv\(/, R`# Read the log file
with open("«1:auth.log»") as f:
    lines = f.read().splitlines()
print(len(lines), "lines")
print(lines[:5])
`),
  S('parselog', 'Pull out the IP addresses', /re\.(compile|findall|search|match)\(/, R`import re

# Pull the IP address out of each failed login
ip_pattern = re.compile(r"(\d{1,3}(?:\.\d{1,3}){3})")
failed = [line for line in lines if "«1:Failed password»" in line]
ips = [m.group(1) for line in failed if (m := ip_pattern.search(line))]
print(len(failed), "failed logins from", len(set(ips)), "addresses")
`),
  S('countlog', 'Count failures per IP', /Counter\(/, R`from collections import Counter

# Count failures per IP address
by_ip = Counter(ips)
for ip, n in by_ip.most_common(5):
    print(ip, n)
`),
  S('flaglog', 'Flag brute-force attackers', /THRESHOLD|suspicious/, R`# Flag likely brute-force attackers
THRESHOLD = «1:5»
suspicious = {ip: n for ip, n in by_ip.items() if n >= THRESHOLD}
print("Suspicious IPs:", suspicious)
`),
  S('reportlog', 'Write the incident report', /report|\.write\(|json\.dump/i, R`# Write a short incident report
report = [f"{ip}: {n} failed logins" for ip, n in sorted(suspicious.items(), key=lambda item: -item[1])]
print("\n".join(report))
with open("«1:incident_report.txt»", "w") as f:
    f.write("\n".join(report))
`),
] });

const cyberHash = chain({ id: 'cyber-hash', langs: PY, domains: ['cyber'], detect: /hashlib|wordlist|rockyou|\bcrack/i, steps: [
  S('wordlist', 'Load the wordlist', /wordlist|words\s*=/i, R`# Load the wordlist
with open("«1:wordlist.txt»") as f:
    words = f.read().split()
print(len(words), "words")
`),
  S('hashfn', 'Hash helper', /def\s+hash_|hashlib\.\w+\(/, R`import hashlib

def hash_word(word):
    return hashlib.«1:sha256»(word.encode()).hexdigest()
`),
  S('crack', 'Crack the hash', /for\s+\w+\s+in\s+words/, R`# Try every word until one matches the target hash
target = "«1:paste the hash here»"
found = None
for word in words:
    if hash_word(word) == target:
        found = word
        break
print("Cracked:", found)
`),
  S('variations', 'Try word variations', /def\s+variations|\.capitalize\(/, R`# People tweak words: a capital letter, a number on the end
def variations(word):
    yield word
    yield word.capitalize()
    for n in range(10):
        yield word + str(n)
`),
  S('salted', 'The defence: salt + slow hash', /pbkdf2|bcrypt|scrypt|\bsalt\b/i, R`import os

# The defence: a random salt and a deliberately slow hash
salt = os.urandom(16)
digest = hashlib.pbkdf2_hmac("sha256", b"«1:password»", salt, 200_000)
print(salt.hex(), digest.hex())
`),
] });

const cyberCipher = chain({ id: 'cyber-cipher', langs: PY, domains: ['cyber'], detect: /caesar|cipher|rot13|base64|\bxor\b|vigenere/i, steps: [
  S('caesar', 'Caesar cipher', /def\s+(caesar|shift|encrypt|decrypt)/i, R`def caesar(text, shift):
    out = []
    for ch in text:
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            out.append(chr((ord(ch) - base + shift) % 26 + base))
        else:
            out.append(ch)
    return "".join(out)
`),
  S('brute', 'Brute-force all 26 shifts', /range\(26\)/, R`# Brute force: try every shift and read the results
cipher_text = "«1:Khoor Zruog»"
for shift in range(26):
    print(shift, caesar(cipher_text, -shift))
`),
  S('freq', 'Letter frequency analysis', /Counter\(/, R`from collections import Counter

# Frequency analysis: in English, "e" is the most common letter
letters = [c.lower() for c in cipher_text if c.isalpha()]
print(Counter(letters).most_common(5))
`),
  S('b64xor', 'Base64 and XOR', /b64decode|\^/, R`import base64

# Base64 and a single-byte XOR
decoded = base64.b64decode("«1:SGVsbG8=»")
print(decoded)
print(bytes(b ^ «2:42» for b in decoded))
`),
] });

const cyberNet = chain({ id: 'cyber-net', langs: PY, domains: ['cyber'], detect: /\bsocket\b|ipaddress|\bnmap\b|banner|open[_ ]ports|port[_ ]scan/i, steps: [
  S('scanload', 'Load the scan results', /DictReader|read_csv\(/, R`import csv

# Load the (simulated) scan results
with open("«1:scan.csv»") as f:
    rows = list(csv.DictReader(f))
print(rows[:3])
`),
  S('openports', 'Open ports per host', /defaultdict|open_ports/, R`from collections import defaultdict

# Group the open ports by host
open_ports = defaultdict(list)
for row in rows:
    open_ports[row["«1:host»"]].append(int(row["«2:port»"]))
for host, ports in open_ports.items():
    print(host, sorted(ports))
`),
  S('risky', 'Flag risky services', /RISKY/, R`# Services that should not be exposed
RISKY = {21: "FTP", 23: "Telnet", 445: "SMB", 3389: "RDP"}
for host, ports in open_ports.items():
    for port in ports:
        if port in RISKY:
            print("RISK:", host, port, RISKY[port])
`),
  S('riskscore', 'Score each host', /risk_score|score/i, R`# A simple risk score per host
def risk_score(ports):
    return sum(10 for p in ports if p in RISKY) + len(ports)

ranked = sorted(open_ports.items(), key=lambda item: -risk_score(item[1]))
for host, ports in ranked[:5]:
    print(host, risk_score(ports))
`),
] });

const cyberFix = chain({ id: 'cyber-fix', langs: PY, detect: /\bexecute\(|\beval\(|\bexec\(|shell\s*=\s*True|pickle\.loads|yaml\.load\(/, steps: [
  S('sqli', 'Fix SQL injection (parameters)', /execute\([^)\n]*\?[^)\n]*,|execute\([^)\n]*,\s*\(/, R`# Never build SQL with f-strings or +. Pass the values separately:
cur.execute("SELECT * FROM «1:users» WHERE «2:name» = ?", (user_input,))
`),
  S('validate', 'Validate the input', /fullmatch|isalnum\(|isdigit\(|def\s+validate/, R`import re

def validate_«1:username»(value):
    # allow only what you expect, reject everything else
    if not re.fullmatch(r"[A-Za-z0-9_]{3,20}", value):
        raise ValueError("invalid «1:username»")
    return value
`),
  S('subproc', 'Run commands safely', /shell\s*=\s*False|shlex/, R`import subprocess

# A list of arguments, never a shell string built from user input
result = subprocess.run(["«1:ping»", "-c", "1", host], capture_output=True, text=True, timeout=5)
print(result.stdout)
`),
  S('exploittest', 'Prove the exploit is blocked', /\bassert\b|unittest|pytest/, R`# Prove the fix: the attack string must now be harmless
attack = "«1:' OR '1'='1»"
try:
    validate_«2:username»(attack)
    print("FAIL: attack got through")
except ValueError:
    print("OK: attack rejected")
`),
] });

// ── Blockchain (Python: build a chain from scratch) ────────────────────────────────────────────────────
const blockchainPy = chain({ id: 'blockchain-py', langs: PY, detect: /\bclass\s+Block\b|blockchain|merkle|\bnonce\b|proof.of.work/i, steps: [
  S('block', 'Block class', /class\s+Block\b/, R`import hashlib
import json
import time


class Block:
    def __init__(self, index, data, previous_hash):
        self.index = index
        self.timestamp = time.time()
        self.data = data
        self.previous_hash = previous_hash
        self.nonce = 0
        self.hash = self.compute_hash()

    def compute_hash(self):
        content = json.dumps({"index": self.index, "timestamp": self.timestamp, "data": self.data,
                              "previous_hash": self.previous_hash, "nonce": self.nonce}, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()
`),
  S('chain', 'Blockchain class', /class\s+Blockchain\b/, R`class Blockchain:
    def __init__(self):
        self.chain = [Block(0, "genesis", "0")]

    def add_block(self, data):
        block = Block(len(self.chain), data, self.chain[-1].hash)
        self.chain.append(block)
        return block
`),
  S('mine', 'Proof of work (mining)', /difficulty|def\s+mine/, R`def mine(block, difficulty=«1:4»):
    # find a nonce that makes the hash start with several zeros (the difficulty)
    prefix = "0" * difficulty
    while not block.hash.startswith(prefix):
        block.nonce += 1
        block.hash = block.compute_hash()
    return block.hash
`),
  S('valid', 'Validate the chain', /def\s+is_(chain_)?valid|def\s+validate/, R`def is_chain_valid(chain):
    for i in range(1, len(chain)):
        current, previous = chain[i], chain[i - 1]
        if current.hash != current.compute_hash():
            return False
        if current.previous_hash != previous.hash:
            return False
    return True
`),
  S('tamper', 'Tamper test', /tamper/i, R`# Tamper test: change old data and the chain must break
bc = Blockchain()
for item in ["«1:Alice pays Bob 5»", "«2:Bob pays Carol 2»"]:
    mine(bc.add_block(item))
print("valid before:", is_chain_valid(bc.chain))
bc.chain[1].data = "Alice pays Bob 500"
print("valid after tampering:", is_chain_valid(bc.chain))
`),
  S('wallet', 'Transactions and balances', /balance|transaction/i, R`# Transactions and balances
transactions = [{"from": "«1:alice»", "to": "«2:bob»", "amount": «3:5»}]

def balance(name, transactions):
    total = 0
    for tx in transactions:
        if tx["to"] == name:
            total += tx["amount"]
        if tx["from"] == name:
            total -= tx["amount"]
    return total

print(balance("bob", transactions))
`),
] });

// ── Cloud / DevOps scripts ─────────────────────────────────────────────────────────────────────────────
const cloudPy = chain({ id: 'cloud-py', langs: PY, domains: ['cloud'], detect: /health.?check|urlopen|requests\.get|\bboto3\b|\bdocker\b|systemctl/i, steps: [
  S('health', 'Health check function', /def\s+(check|health)/i, R`import urllib.request


def check(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False
`),
  S('retry', 'Retry with backoff', /backoff|retries|attempt/i, R`import time


def check_with_retry(url, attempts=«1:3»):
    for attempt in range(attempts):
        if check(url):
            return True
        time.sleep(2 ** attempt)  # wait 1s, 2s, 4s...
    return False
`),
  S('many', 'Check every service', /for\s+\w+\s+in\s+(services|urls)/, R`services = ["«1:http://localhost:8000/health»"]
results = {url: check_with_retry(url) for url in services}
for url, ok in results.items():
    print("OK  " if ok else "DOWN", url)
`),
  S('exitcode', 'Exit code for automation', /sys\.exit/, R`import sys

# Automation (cron, CI) reads the exit code: 0 = healthy
sys.exit(0 if all(results.values()) else 1)
`),
] });

// ── Maths (check the code against the maths) ───────────────────────────────────────────────────────────
const mathPy = chain({ id: 'math-py', langs: PY, domains: ['math'], detect: /\b(sympy|scipy|numpy\.(linalg|polyfit)|np\.(linalg|polyfit|linspace))\b/, steps: [
  S('mfunc', 'Define the function', /\bdef\s+\w+\(/, R`import math


def «1:f»(x):
    return «2:x ** 2 - 2»
`),
  S('mcheck', 'Check against a known answer', /isclose|allclose|assert\s+abs/, R`# Verify the code against an answer you can work out by hand
expected = «1:2 ** 0.5»
assert math.isclose(«2:f»(expected), 0, abs_tol=1e-9), "does not match the hand calculation"
print("matches the hand calculation")
`),
  S('mplot', 'Plot it', /plt\./, R`import numpy as np
import matplotlib.pyplot as plt

xs = np.linspace(«1:-3», «2:3», 200)
plt.plot(xs, [«3:f»(x) for x in xs])
plt.axhline(0, color="gray")
plt.grid(True)
plt.show()
`),
  S('merror', 'Error against step size', /for\s+\w+\s+in\s+\[[^\]]*1e-|step.?size|\bh\s+in\b/i, R`# How does the error shrink as the step gets smaller?
for h in [1e-1, 1e-2, 1e-3, 1e-4]:
    approx = («1:f»(«2:1» + h) - «1:f»(«2:1»)) / h
    print(h, abs(approx - «3:2.0»))
`),
] });

// ── General Python: a checklist for any project ────────────────────────────────────────────────────────
const generalPy = fallback({ id: 'python-general', langs: PY, steps: [
  S('func', 'A function', /\bdef\s+\w+\(/, R`def «1:name»(«2:value»):
    """«3:What this does, in one line.»"""
    return «2:value»
`),
  S('errors', 'Handle errors', /\btry:/, R`try:
    result = «1:int(input("Number: "))»
except ValueError:
    print("That was not a number")
`),
  S('tests', 'Tests', /\bassert\b|unittest|pytest/, R`# Tests: small checks that prove it works, including the awkward cases
assert «1:name»(«2:1») == «3:1»
assert «1:name»(«4:0») == «5:0»
print("all tests passed")
`),
  S('cli', 'Command-line arguments', /argparse|sys\.argv/, R`import argparse

parser = argparse.ArgumentParser(description="«1:What this program does»")
parser.add_argument("«2:filename»")
parser.add_argument("--verbose", action="store_true")
args = parser.parse_args()
`),
  S('main', 'Main guard', /__name__\s*==/, R`def main():
    «1:pass»


if __name__ == "__main__":
    main()
`),
  S('logging', 'Logging', /\blogging\./, R`import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.info("«1:started»")
`),
] });

register(mlPack, cyberLog, cyberHash, cyberCipher, cyberNet, cyberFix, blockchainPy, cloudPy, mathPy, generalPy);
