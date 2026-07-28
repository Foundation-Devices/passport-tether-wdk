import { WalletAccountReadOnlyBtc, type IBtcClient } from '@tetherto/wdk-wallet-btc';
import { address, networks, payments, Psbt, Transaction } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import {
  createRequestId,
  PASSPORT_BTC_ACCOUNT_PATH,
  type PassportBtcAccount,
  type PassportBtcTransport,
} from './protocol';

const DEFAULT_ESPLORA =
  process.env.EXPO_PUBLIC_BITCOIN_TESTNET_API ?? 'https://mempool.space/testnet/api';
const MAX_FEE_SATS = 1_000_000n;

type EsploraAddress = {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
};

type EsploraUtxo = {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number };
};

class EsploraTestnetClient implements IBtcClient {
  constructor(private readonly baseUrl = DEFAULT_ESPLORA.replace(/\/+$/, '')) {}

  async connect() {}
  async close() {}
  async reconnect() {}

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`Bitcoin testnet request failed (${response.status})`);
    return (await response.json()) as T;
  }

  async getBalance(bitcoinAddress: string) {
    const result = await this.getJson<EsploraAddress>(`/address/${bitcoinAddress}`);
    return {
      confirmed: result.chain_stats.funded_txo_sum - result.chain_stats.spent_txo_sum,
      unconfirmed: result.mempool_stats.funded_txo_sum - result.mempool_stats.spent_txo_sum,
    };
  }

  async listUnspent(bitcoinAddress: string) {
    const result = await this.getJson<EsploraUtxo[]>(`/address/${bitcoinAddress}/utxo`);
    return result.map((utxo) => ({
      tx_hash: utxo.txid,
      tx_pos: utxo.vout,
      value: utxo.value,
      height: utxo.status.confirmed ? (utxo.status.block_height ?? 1) : 0,
    }));
  }

  async getHistory(bitcoinAddress: string) {
    const result = await this.getJson<
      { txid: string; status: { confirmed: boolean; block_height?: number } }[]
    >(`/address/${bitcoinAddress}/txs`);
    return result.map((transaction) => ({
      tx_hash: transaction.txid,
      height: transaction.status.confirmed ? (transaction.status.block_height ?? 1) : 0,
    }));
  }

  async getTransaction(hash: string) {
    const response = await fetch(`${this.baseUrl}/tx/${hash}/hex`);
    if (!response.ok) throw new Error(`Could not load Bitcoin transaction (${response.status})`);
    return response.text();
  }

  async broadcast(rawTransaction: string) {
    const response = await fetch(`${this.baseUrl}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawTransaction,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `Bitcoin broadcast failed (${response.status})`);
    }
    return response.text();
  }

  async estimateFee(blocks: number) {
    const result = await this.getJson<Record<string, number>>('/v1/fees/recommended');
    const satPerVbyte =
      blocks <= 1
        ? result.fastestFee
        : blocks <= 3
          ? result.halfHourFee
          : blocks <= 6
            ? result.hourFee
            : result.economyFee;
    return Math.max(satPerVbyte || 1, 1) / 100_000;
  }
}

type PlannedUtxo = {
  tx_hash: string;
  tx_pos: number;
  value: number | bigint;
};

type SpendPlan = {
  utxos: PlannedUtxo[];
  fee: number | bigint;
  changeValue: number | bigint;
};

class PassportReadOnlyBtcAccount extends WalletAccountReadOnlyBtc {
  async planSpend(to: string, amount: bigint, feeRate: bigint): Promise<SpendPlan> {
    return this._planSpend({
      fromAddress: await this.getAddress(),
      toAddress: to,
      amount,
      feeRate,
    }) as unknown as SpendPlan;
  }

  async recommendedFeeRate(): Promise<bigint> {
    await this._ensureConnected();
    const btcPerKb = await this._client.estimateFee(3);
    return BigInt(Math.max(Math.round(btcPerKb * 100_000), 1));
  }

  async broadcastRaw(rawTransaction: string): Promise<string> {
    await this._ensureConnected();
    return this._client.broadcast(rawTransaction);
  }
}

export type PreparedBtcTransfer = {
  recipient: string;
  amountSats: bigint;
  feeSats: bigint;
  psbt: string;
};

export type PassportBtcSession = {
  passport: PassportBtcAccount;
  account: PassportReadOnlyBtcAccount;
  getBalance(): Promise<bigint>;
  prepareTransfer(recipient: string, amountSats: bigint): Promise<PreparedBtcTransfer>;
  signAndBroadcast(prepared: PreparedBtcTransfer): Promise<{ hash: string; fee: bigint }>;
  dispose(): void;
};

function assertTestnetRecipient(recipient: string): string {
  const script = address.toOutputScript(recipient, networks.testnet);
  return address.fromOutputScript(script, networks.testnet);
}

function assertSignedTransactionMatchesPsbt(psbt: Psbt, rawTransaction: string): Transaction {
  const signed = Transaction.fromHex(rawTransaction);
  if (
    signed.version !== 2 ||
    signed.ins.length !== psbt.txInputs.length ||
    signed.outs.length !== psbt.txOutputs.length
  ) {
    throw new Error('Passport returned a different Bitcoin transaction');
  }
  signed.ins.forEach((input, index) => {
    const expected = psbt.txInputs[index];
    if (
      !Buffer.from(input.hash).equals(Buffer.from(expected.hash)) ||
      input.index !== expected.index ||
      input.sequence !== expected.sequence ||
      input.witness.length !== 2
    ) {
      throw new Error('Passport changed a Bitcoin transaction input');
    }
  });
  signed.outs.forEach((output, index) => {
    const expected = psbt.txOutputs[index];
    if (
      output.value !== expected.value ||
      !Buffer.from(output.script).equals(Buffer.from(expected.script))
    ) {
      throw new Error('Passport changed a Bitcoin transaction output');
    }
  });
  return signed;
}

export async function createPassportBtcSession(
  transport: PassportBtcTransport,
  client: IBtcClient = new EsploraTestnetClient()
): Promise<PassportBtcSession> {
  const passport = await transport.getBtcAccount(PASSPORT_BTC_ACCOUNT_PATH);
  const expectedScript = address.toOutputScript(passport.address, networks.testnet);
  const publicKey = Buffer.from(passport.publicKey.replace(/^0x/, ''), 'hex');
  const publicKeyAddress =
    publicKey.length === 33
      ? payments.p2wpkh({ pubkey: publicKey, network: networks.testnet }).address
      : undefined;
  if (!publicKeyAddress || publicKeyAddress !== passport.address) {
    throw new Error('Passport returned invalid Bitcoin account material');
  }

  const account = new PassportReadOnlyBtcAccount(passport.address, {
    network: 'testnet',
    client,
  });

  return {
    passport,
    account,
    getBalance: () => account.getBalance(),
    async prepareTransfer(recipient, amountSats) {
      const canonicalRecipient = assertTestnetRecipient(recipient);
      if (amountSats <= 0n) throw new Error('Enter a Bitcoin amount greater than zero');
      const feeRate = await account.recommendedFeeRate();
      const plan = await account.planSpend(canonicalRecipient, amountSats, feeRate);
      const feeSats = BigInt(plan.fee);
      if (feeSats <= 0n || feeSats > MAX_FEE_SATS) {
        throw new Error('The Bitcoin network fee exceeds the Passport safety limit');
      }

      const psbt = new Psbt({ network: networks.testnet });
      psbt.setVersion(2);
      for (const utxo of plan.utxos) {
        psbt.addInput({
          hash: utxo.tx_hash,
          index: utxo.tx_pos,
          witnessUtxo: {
            script: expectedScript,
            value: BigInt(utxo.value),
          },
        });
      }
      psbt.addOutput({
        address: canonicalRecipient,
        value: amountSats,
      });
      const change = BigInt(plan.changeValue);
      if (change > 0n) {
        psbt.addOutput({
          address: passport.address,
          value: change,
        });
      }

      return {
        recipient: canonicalRecipient,
        amountSats,
        feeSats,
        psbt: `0x${Buffer.from(psbt.toBuffer()).toString('hex')}`,
      };
    },
    async signAndBroadcast(prepared) {
      const response = await transport.signBtcPsbt({
        protocolVersion: 1,
        requestId: createRequestId(),
        path: PASSPORT_BTC_ACCOUNT_PATH,
        psbt: prepared.psbt,
      });
      if (response.address !== passport.address) {
        throw new Error('Passport signed with an unexpected Bitcoin account');
      }
      const psbt = Psbt.fromBuffer(Buffer.from(prepared.psbt.replace(/^0x/, ''), 'hex'), {
        network: networks.testnet,
      });
      const raw = response.signedTransaction.replace(/^0x/, '');
      assertSignedTransactionMatchesPsbt(psbt, raw);
      const hash = await account.broadcastRaw(raw);
      return { hash, fee: prepared.feeSats };
    },
    dispose: () => account.dispose(),
  };
}
