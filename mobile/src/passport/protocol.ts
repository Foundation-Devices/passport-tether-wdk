import type { UnsignedEvmTransaction } from '@tetherto/wdk-wallet-evm/signers';
import { getAddress, hexlify, randomBytes } from 'ethers';

export const PASSPORT_EVM_ACCOUNT_PATH = "m/44'/60'/0'/0/0";
export const PASSPORT_BTC_ACCOUNT_PATH = "m/84'/1'/0'/0/0";
export const WDK_RELATIVE_ACCOUNT_PATH = "0'/0/0";
export const SEPOLIA_CHAIN_ID = 11_155_111;

export type PassportEvmAccount = {
  address: string;
  publicKey: string;
  path: typeof PASSPORT_EVM_ACCOUNT_PATH;
};

export type CanonicalEvmTransaction = {
  chainId: typeof SEPOLIA_CHAIN_ID;
  nonce: number;
  from: string;
  to: string;
  data: string;
  value: string;
  type: 2;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  accessList: [];
};

export type PassportSignEvmTransactionRequest = {
  protocolVersion: 1;
  requestId: string;
  path: typeof PASSPORT_EVM_ACCOUNT_PATH;
  transaction: CanonicalEvmTransaction;
};

export type PassportSignEvmTransactionResponse = {
  protocolVersion: 1;
  requestId: string;
  address: string;
  signedTransaction: string;
};

export interface PassportEvmTransport {
  getEvmAccount(path: typeof PASSPORT_EVM_ACCOUNT_PATH): Promise<PassportEvmAccount>;
  signEvmTransaction(
    request: PassportSignEvmTransactionRequest
  ): Promise<PassportSignEvmTransactionResponse>;
}

export type PassportBtcAccount = {
  address: string;
  publicKey: string;
  path: typeof PASSPORT_BTC_ACCOUNT_PATH;
};

export type PassportSignBtcPsbtRequest = {
  protocolVersion: 1;
  requestId: string;
  path: typeof PASSPORT_BTC_ACCOUNT_PATH;
  psbt: string;
};

export type PassportSignBtcPsbtResponse = {
  protocolVersion: 1;
  requestId: string;
  address: string;
  signedTransaction: string;
};

export interface PassportBtcTransport {
  getBtcAccount(path: typeof PASSPORT_BTC_ACCOUNT_PATH): Promise<PassportBtcAccount>;
  signBtcPsbt(request: PassportSignBtcPsbtRequest): Promise<PassportSignBtcPsbtResponse>;
}

export class PassportPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassportPolicyError';
  }
}

function requiredBigInt(value: number | bigint | undefined, field: string): bigint {
  if (value === undefined) {
    throw new PassportPolicyError(`${field} is required`);
  }

  const parsed = BigInt(value);
  if (parsed < 0n) {
    throw new PassportPolicyError(`${field} must not be negative`);
  }
  return parsed;
}

export function canonicalizeEvmTransaction(
  transaction: UnsignedEvmTransaction,
  expectedAddress: string
): CanonicalEvmTransaction {
  if (transaction.chainId !== SEPOLIA_CHAIN_ID) {
    throw new PassportPolicyError('Passport only signs Ethereum Sepolia transactions');
  }
  if (transaction.type !== 2) {
    throw new PassportPolicyError('Passport only signs EIP-1559 transactions');
  }
  if (!Number.isSafeInteger(transaction.nonce) || transaction.nonce < 0) {
    throw new PassportPolicyError('Transaction nonce must be a non-negative safe integer');
  }
  if (!transaction.to) {
    throw new PassportPolicyError('Contract creation is not supported');
  }
  if (getAddress(transaction.from) !== getAddress(expectedAddress)) {
    throw new PassportPolicyError('Transaction sender does not match the Passport account');
  }
  if (transaction.blobs?.length || transaction.blobVersionedHashes?.length) {
    throw new PassportPolicyError('Blob transactions are not supported');
  }
  if (transaction.authorizationList?.length) {
    throw new PassportPolicyError('EIP-7702 authorization transactions are not supported');
  }
  if (transaction.accessList?.length) {
    throw new PassportPolicyError('EIP-2930 access lists are not supported');
  }

  return {
    chainId: SEPOLIA_CHAIN_ID,
    nonce: transaction.nonce,
    from: getAddress(transaction.from),
    to: getAddress(transaction.to),
    data: transaction.data || '0x',
    value: requiredBigInt(transaction.value, 'value').toString(10),
    type: 2,
    gasLimit: requiredBigInt(transaction.gasLimit, 'gasLimit').toString(10),
    maxFeePerGas: requiredBigInt(transaction.maxFeePerGas, 'maxFeePerGas').toString(10),
    maxPriorityFeePerGas: requiredBigInt(
      transaction.maxPriorityFeePerGas,
      'maxPriorityFeePerGas'
    ).toString(10),
    accessList: [],
  };
}

export function createRequestId(): string {
  return hexlify(randomBytes(16)).slice(2);
}
