#!/usr/bin/env node
// scripts/extract-abi.js
// Extracts the ABI from Foundry's compiled output and writes:
//   contracts/abi.js   (CommonJS-ish ESM for Node SDK)
//   docs/src/challengeAbi.ts (TypeScript const for frontend)

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const artifact = JSON.parse(
  readFileSync(join(root, 'out/contract.sol/GameEscrow.json'), 'utf-8')
);
const abi = artifact.abi;
const pretty = JSON.stringify(abi, null, 2);

// contracts/abi.js — default export for the Node SDK
writeFileSync(
  join(root, 'contracts/abi.js'),
  `const abi = ${pretty}\n\nexport default abi;\n`
);

// docs/src/challengeAbi.ts — typed const for the Viem frontend
writeFileSync(
  join(root, 'docs/src/challengeAbi.ts'),
  `const contractABI = ${pretty} as const\n\nexport default contractABI;\n`
);

console.log('✓ contracts/abi.js');
console.log('✓ docs/src/challengeAbi.ts');
