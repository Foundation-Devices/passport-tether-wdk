#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  parseEther,
  parseUnits,
} from 'ethers';

const CHAIN_ID = 11155111n;
const NETWORK_NAME = 'Ethereum Sepolia';
const DEFAULT_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const USDT_ADDRESS = '0xd077a400968890eacc75cdc901f0356c943e4fdb';
const USDT_DECIMALS = 6;
const KEYCHAIN_SERVICE = 'com.foundationdevices.passport-tether-wdk.sepolia-treasury';
const KEYCHAIN_ACCOUNT = 'passport-tether-wdk';
const SECURITY_BIN = '/usr/bin/security';
const CONFIRM_FLAG = '--yes';

const USDT_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address recipient, uint256 amount) returns (bool)',
];

function usage() {
  console.log(`Passport Tether WDK Sepolia treasury

Usage:
  npm run treasury:init
  npm run treasury:status
  npm run treasury:send-usdt -- <recipient> <amount> --yes
  npm run treasury:send-eth -- <recipient> <amount> --yes

Environment:
  SEPOLIA_RPC_URL       Optional Sepolia RPC override

Safety:
  This utility is locked to ${NETWORK_NAME} (${CHAIN_ID}) and test USD₮
  ${USDT_ADDRESS}. Never send mainnet or other real assets to this wallet.`);
}

function keychainItemExists() {
  const result = spawnSync(
    SECURITY_BIN,
    ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', KEYCHAIN_SERVICE],
    { stdio: 'ignore' }
  );
  return result.status === 0;
}

function readPrivateKey() {
  if (!keychainItemExists()) {
    throw new Error('Treasury is not initialized. Run: npm run treasury:init');
  }

  try {
    return execFileSync(
      SECURITY_BIN,
      ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    throw new Error('The treasury key exists, but macOS Keychain did not allow access.');
  }
}

function treasuryWallet(provider) {
  return new Wallet(readPrivateKey(), provider);
}

function initTreasury() {
  if (keychainItemExists()) {
    const existing = treasuryWallet();
    console.log('Existing Sepolia treasury found; no key was changed.');
    console.log(`Address: ${existing.address}`);
    return;
  }

  const wallet = Wallet.createRandom();
  execFileSync(
    SECURITY_BIN,
    [
      'add-generic-password',
      '-a',
      KEYCHAIN_ACCOUNT,
      '-s',
      KEYCHAIN_SERVICE,
      '-l',
      'Passport Tether WDK Sepolia Treasury',
      '-w',
      wallet.privateKey,
    ],
    { stdio: 'ignore' }
  );

  console.log('Created a new testnet-only treasury in macOS Keychain.');
  console.log(`Address: ${wallet.address}`);
}

async function checkedProvider() {
  const rpcUrl =
    process.env.SEPOLIA_RPC_URL ?? process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL ?? DEFAULT_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  if (network.chainId !== CHAIN_ID) {
    throw new Error(
      `Refusing to continue: RPC returned chain ${network.chainId}, expected Sepolia ${CHAIN_ID}.`
    );
  }

  return provider;
}

async function status() {
  const provider = await checkedProvider();
  const wallet = treasuryWallet(provider);
  const usdt = new Contract(USDT_ADDRESS, USDT_ABI, provider);
  const [ethBalance, usdtBalance] = await Promise.all([
    provider.getBalance(wallet.address),
    usdt.balanceOf(wallet.address),
  ]);

  console.log(`Network:  ${NETWORK_NAME} (${CHAIN_ID})`);
  console.log(`Address:  ${wallet.address}`);
  console.log(`ETH:      ${formatEther(ethBalance)}`);
  console.log(`Test USD₮: ${formatUnits(usdtBalance, USDT_DECIMALS)}`);
  console.log(`Contract: ${USDT_ADDRESS}`);
}

function parseTransferArgs(kind) {
  const positional = process.argv.slice(3).filter((argument) => argument !== CONFIRM_FLAG);
  if (positional.length !== 2) {
    throw new Error(`Usage: npm run treasury:send-${kind} -- <recipient> <amount> --yes`);
  }

  const recipient = getAddress(positional[0]);
  const amountText = positional[1];
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amountText)) {
    throw new Error('Amount must be a positive decimal number.');
  }

  const amount = kind === 'usdt' ? parseUnits(amountText, USDT_DECIMALS) : parseEther(amountText);
  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero.');
  }

  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(`Transfer not sent. Review the recipient and rerun with ${CONFIRM_FLAG}.`);
  }

  return { recipient, amount, amountText };
}

async function sendUsdt() {
  const { recipient, amount, amountText } = parseTransferArgs('usdt');
  const provider = await checkedProvider();
  const wallet = treasuryWallet(provider);
  if (recipient === wallet.address) {
    throw new Error('Recipient is the treasury itself.');
  }

  const usdt = new Contract(USDT_ADDRESS, USDT_ABI, wallet);
  const balance = await usdt.balanceOf(wallet.address);
  if (balance < amount) {
    throw new Error(
      `Insufficient test USD₮: have ${formatUnits(balance, USDT_DECIMALS)}, need ${amountText}.`
    );
  }

  console.log(`Sending ${amountText} test USD₮ to ${recipient} on Sepolia…`);
  const transaction = await usdt.transfer(recipient, amount);
  console.log(`Submitted: https://sepolia.etherscan.io/tx/${transaction.hash}`);
  await transaction.wait();
  console.log('Confirmed.');
}

async function sendEth() {
  const { recipient, amount, amountText } = parseTransferArgs('eth');
  const provider = await checkedProvider();
  const wallet = treasuryWallet(provider);
  if (recipient === wallet.address) {
    throw new Error('Recipient is the treasury itself.');
  }

  const balance = await provider.getBalance(wallet.address);
  if (balance <= amount) {
    throw new Error(
      `Insufficient Sepolia ETH: have ${formatEther(balance)}, requested ${amountText} plus gas.`
    );
  }

  console.log(`Sending ${amountText} Sepolia ETH to ${recipient}…`);
  const transaction = await wallet.sendTransaction({ to: recipient, value: amount });
  console.log(`Submitted: https://sepolia.etherscan.io/tx/${transaction.hash}`);
  await transaction.wait();
  console.log('Confirmed.');
}

async function main() {
  const command = process.argv[2];
  switch (command) {
    case 'init':
      initTreasury();
      return;
    case 'status':
      await status();
      return;
    case 'send-usdt':
      await sendUsdt();
      return;
    case 'send-eth':
      await sendEth();
      return;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      usage();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Treasury error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
