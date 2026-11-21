import { R, S, chain, fallback, register } from './engine';

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────────────
const tableOf = (code) => /create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/i.exec(code)?.[1] || '«1:customers»';
const sql = fallback({ id: 'sql', langs: ['sql'], steps: [
  S('qcreate', 'Create a table', /create\s+table/i, R`CREATE TABLE IF NOT EXISTS «1:customers» (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  city TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`),
  S('qinsert', 'Insert rows', /insert\s+into/i, (c) => R`INSERT INTO ${tableOf(c)} (name, email, city) VALUES
  ('«1:Amina»', '«2:amina@example.com»', '«3:Nairobi»'),
  ('«4:Brian»', '«5:brian@example.com»', '«6:Kericho»');
`),
  S('qselect', 'Select, filter, sort', /select[\s\S]*\bwhere\b/i, (c) => R`SELECT «1:name, city»
FROM ${tableOf(c)}
WHERE «2:city = 'Nairobi'»
ORDER BY «3:name»
LIMIT «4:10»;
`),
  S('qjoin', 'Join two tables', /\bjoin\b/i, (c) => R`SELECT a.«1:name», b.«2:total»
FROM ${tableOf(c)} AS a
JOIN «3:orders» AS b ON b.«4:customer_id» = a.id;
`),
  S('qgroup', 'Group and aggregate', /group\s+by/i, (c) => R`SELECT «1:city», COUNT(*) AS n
FROM ${tableOf(c)}
GROUP BY «1:city»
HAVING COUNT(*) >= «2:1»
ORDER BY n DESC;
`),
  S('qindex', 'Add an index', /create\s+(unique\s+)?index/i, (c) => R`CREATE INDEX IF NOT EXISTS idx_«1:customers»_«2:city» ON ${tableOf(c)} («2:city»);
`),
  S('qview', 'Make a view', /create\s+view/i, (c) => R`CREATE VIEW IF NOT EXISTS «1:city_counts» AS
SELECT «2:city», COUNT(*) AS n FROM ${tableOf(c)} GROUP BY «2:city»;
`),
] });

// ── Solidity ─────────────────────────────────────────────────────────────────────────────────────────────
const sol = fallback({ id: 'solidity', langs: ['solidity'], steps: [
  S('shead', 'Contract skeleton', /pragma\s+solidity/, R`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract «1:Bank» {
}
`),
  S('sstate', 'State and constructor', /constructor\s*\(/, R`    address public owner;
    mapping(address => uint256) public balances;

    constructor() {
        owner = msg.sender;
    }
`, '}'),
  S('sevent', 'Events', /\bevent\s+\w+/, R`    event Deposit(address indexed from, uint256 amount);
    event Withdrawal(address indexed to, uint256 amount);
`, '}'),
  S('smod', 'Access control modifier', /\bmodifier\s+\w+/, R`    modifier onlyOwner() {
        require(msg.sender == owner, "not the owner");
        _;
    }
`, '}'),
  S('sfunc', 'Deposit and withdraw', /\bpayable\b/, R`    function deposit() public payable {
        require(msg.value > 0, "send some ETH");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount, "insufficient balance");
        balances[msg.sender] -= amount; // update state BEFORE sending (stops reentrancy)
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawal(msg.sender, amount);
    }
`, '}'),
  S('sview', 'View functions', /\bview\b/, R`    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }

    function contractBalance() public view onlyOwner returns (uint256) {
        return address(this).balance;
    }
`, '}'),
] });

// ── Shell ────────────────────────────────────────────────────────────────────────────────────────────────
const shell = fallback({ id: 'shell', langs: ['shell'], steps: [
  S('bhead', 'Safe script header', /set\s+-[a-z]*e/, R`#!/usr/bin/env bash
set -euo pipefail
`),
  S('bargs', 'Check the arguments', /\$#|\$\{1/, R`if [ $# -lt «1:1» ]; then
  echo "usage: $0 «2:<file>»" >&2
  exit 1
fi
FILE="$1"
`),
  S('bfunc', 'A function', /\b\w+\s*\(\)\s*\{/, R`log() {
  echo "[$(date +%H:%M:%S)] $*"
}
`),
  S('bloop', 'Loop over files', /\bfor\s+\w+\s+in\b|\bwhile\b/, R`for f in «1:*.txt»; do
  [ -e "$f" ] || continue
  log "processing $f"
done
`),
  S('btrap', 'Clean up on exit', /\btrap\b/, R`cleanup() {
  rm -f "«1:/tmp/work.$$»"
}
trap cleanup EXIT
`),
] });

// ── Docker / YAML ────────────────────────────────────────────────────────────────────────────────────────
const docker = fallback({ id: 'dockerfile', langs: ['dockerfile'], steps: [
  S('dfrom', 'Base image and workdir', /^FROM\b/im, R`FROM «1:python:3.12-slim»
WORKDIR /app
`),
  S('ddeps', 'Install dependencies first (cached)', /requirements|package\.json|npm (ci|install)/i, R`COPY «1:requirements.txt» .
RUN «2:pip install --no-cache-dir -r requirements.txt»
`),
  S('dcopy', 'Copy the app', /^COPY\s+\.\s+\./m, R`COPY . .
`),
  S('duser', 'Run as a non-root user', /^USER\b/m, R`RUN useradd -m app
USER app
`),
  S('dport', 'Port and health check', /^(EXPOSE|HEALTHCHECK)\b/m, R`EXPOSE «1:8000»
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:«1:8000»/health || exit 1
`),
  S('dcmd', 'Start command', /^(CMD|ENTRYPOINT)\b/m, R`CMD ["«1:python»", "«2:main.py»"]
`),
] });

const compose = chain({ id: 'compose', langs: ['yaml'], name: /compose/i, detect: /^services:/m, domains: ['cloud'], steps: [
  S('cservices', 'Services', /^services:/m, R`services:
  web:
    build: .
    ports:
      - "«1:8000»:«1:8000»"
`),
  S('cenv', 'Environment', /environment:|env_file:/, R`    environment:
      - «1:APP_ENV»=production
`),
  S('chealth', 'Health check', /healthcheck:/, R`    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:«1:8000»/health"]
      interval: 30s
      timeout: 3s
      retries: 3
`),
  S('cvol', 'Database with a volume', /volumes:/, R`  db:
    image: «1:postgres:16»
    environment:
      - POSTGRES_PASSWORD=«2:change-me»
    volumes:
      - dbdata:/var/lib/postgresql/data

volumes:
  dbdata:
`),
  S('cdep', 'Start order', /depends_on:/, R`    depends_on:
      - db
`),
] });

const gha = chain({ id: 'github-actions', langs: ['yaml'], name: /workflows|\.github|ci\.ya?ml/i, detect: /^on:|runs-on:/m, domains: ['cloud'], steps: [
  S('gtrigger', 'Trigger and job', /runs-on:/, R`name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
`),
  S('gcheckout', 'Check out and set up', /actions\/checkout/, R`      - uses: actions/checkout@v4
      - uses: actions/setup-«1:python»@v5
        with:
          «1:python»-version: "«2:3.12»"
`),
  S('ginstall', 'Install dependencies', /pip install|npm (ci|install)/, R`      - run: «1:pip install -r requirements.txt»
`),
  S('gtest', 'Run the tests', /pytest|npm (run )?test|unittest/, R`      - run: «1:pytest»
`),
  S('gupload', 'Keep the results', /upload-artifact/, R`      - uses: actions/upload-artifact@v4
        with:
          name: «1:test-results»
          path: «2:reports/»
`),
] });

// ── Other languages: just a starting skeleton ────────────────────────────────────────────────────────────
const skeleton = (id, lang, done, text) => fallback({ id, langs: [lang], steps: [S(id + '-main', 'Program skeleton', done, text)] });
const java = skeleton('java', 'java', /static\s+void\s+main/, R`public class «1:Main» {
    public static void main(String[] args) {
        System.out.println("«2:Hello»");
    }
}
`);
const c = skeleton('c', 'c', /\bmain\s*\(/, R`#include <stdio.h>

int main(void) {
    printf("«1:Hello»\n");
    return 0;
}
`);
const cpp = skeleton('cpp', 'cpp', /\bmain\s*\(/, R`#include <iostream>

int main() {
    std::cout << "«1:Hello»" << std::endl;
    return 0;
}
`);
const go = skeleton('go', 'go', /func\s+main\s*\(/, R`package main

import "fmt"

func main() {
    fmt.Println("«1:Hello»")
}
`);
const rust = skeleton('rust', 'rust', /fn\s+main\s*\(/, R`fn main() {
    println!("«1:Hello»");
}
`);
const php = skeleton('php', 'php', /<\?php/, R`<?php
declare(strict_types=1);

echo "«1:Hello»\n";
`);

register(sql, sol, shell, docker, compose, gha, java, c, cpp, go, rust, php);
