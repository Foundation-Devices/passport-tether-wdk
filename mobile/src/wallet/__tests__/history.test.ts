import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeHistory,
  parseEsploraHistory,
  parseSepoliaNativeHistory,
  parseSepoliaTokenHistory,
  type HistoryEntry,
} from '../history';

const BTC = 'tb1qexampleaddress0000000000000000000000';
const PEER_BTC = 'tb1qcounterparty000000000000000000000000';
const EVM = '0x206438AE1e36a0A302E135106A311f34b9c426D0';
const PEER_EVM = '0x000000000000000000000000000000000000dEaD';
const USDT = '0xd077a400968890eacc75cdc901f0356c943e4fdb';
const NOW = 1_800_000_000_000;

test('reads an inbound Bitcoin transfer from Esplora', () => {
  const entries = parseEsploraHistory(
    [
      {
        txid: 'aa',
        fee: 210,
        vin: [{ prevout: { scriptpubkey_address: PEER_BTC, value: 200_000 } }],
        vout: [{ scriptpubkey_address: BTC, value: 150_000 }],
        status: { confirmed: true, block_time: 1_700_000_000 },
      },
    ],
    BTC,
    NOW
  );

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    hash: 'aa',
    asset: 'BTC',
    amount: '0.0015',
    recipient: PEER_BTC,
    direction: 'in',
    feeWei: '210',
    feeUnit: 'sats',
    timestamp: 1_700_000_000_000,
  });
});

test('measures a Bitcoin send by what left the wallet, not the net delta', () => {
  // 200k in, 40k to a peer, 159,790 back as change. Reporting the net delta
  // would call this a 40,210 sat send and fold the fee into the amount.
  const entries = parseEsploraHistory(
    [
      {
        txid: 'bb',
        fee: 210,
        vin: [{ prevout: { scriptpubkey_address: BTC, value: 200_000 } }],
        vout: [
          { scriptpubkey_address: PEER_BTC, value: 40_000 },
          { scriptpubkey_address: BTC, value: 159_790 },
        ],
        status: { confirmed: true, block_time: 1_700_000_500 },
      },
    ],
    BTC,
    NOW
  );

  assert.equal(entries[0].direction, 'out');
  assert.equal(entries[0].amount, '0.0004');
  assert.equal(entries[0].recipient, PEER_BTC);
});

test('ignores Bitcoin transactions that do not touch the wallet, and dates mempool entries', () => {
  assert.deepEqual(
    parseEsploraHistory(
      [{ txid: 'cc', vin: [{ prevout: { scriptpubkey_address: PEER_BTC, value: 1 } }], vout: [] }],
      BTC,
      NOW
    ),
    []
  );
  assert.deepEqual(parseEsploraHistory('not-an-array', BTC, NOW), []);

  const pending = parseEsploraHistory(
    [
      {
        txid: 'dd',
        fee: 0,
        vin: [{ prevout: { scriptpubkey_address: PEER_BTC, value: 5_000 } }],
        vout: [{ scriptpubkey_address: BTC, value: 5_000 }],
        status: { confirmed: false },
      },
    ],
    BTC,
    NOW
  );
  assert.equal(pending[0].timestamp, NOW);
});

test('classifies Sepolia native transfers and drops valueless contract calls', () => {
  const entries = parseSepoliaNativeHistory(
    {
      items: [
        {
          hash: '0x1',
          from: { hash: PEER_EVM },
          to: { hash: EVM },
          value: '1500000000000000000',
          timestamp: '2026-07-20T10:00:00.000000Z',
          fee: { value: '21000' },
        },
        {
          hash: '0x2',
          from: { hash: EVM },
          to: { hash: PEER_EVM },
          value: '0',
          timestamp: '2026-07-21T10:00:00.000000Z',
        },
      ],
    },
    EVM,
    NOW
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].direction, 'in');
  assert.equal(entries[0].amount, '1.5');
  assert.equal(entries[0].asset, 'ETH');
  assert.equal(entries[0].feeWei, '21000');
});

test('only admits the allowlisted USD₮ contract into token history', () => {
  const payload = {
    items: [
      {
        transaction_hash: '0xreal',
        from: { hash: PEER_EVM },
        to: { hash: EVM },
        // Live Blockscout names this `address_hash` and leaves `address` null.
        token: { address: null, address_hash: USDT },
        total: { value: '4000000', decimals: '6' },
        timestamp: '2026-07-22T10:00:00.000000Z',
      },
      {
        // A stranger can deploy a token that calls itself USD₮ and airdrop it.
        transaction_hash: '0ximpostor',
        from: { hash: PEER_EVM },
        to: { hash: EVM },
        token: { address: null, address_hash: '0xbadc0ffee0000000000000000000000000000000' },
        total: { value: '999000000', decimals: '6' },
        timestamp: '2026-07-23T10:00:00.000000Z',
      },
    ],
  };

  const entries = parseSepoliaTokenHistory(payload, EVM, USDT, NOW);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hash, '0xreal');
  assert.equal(entries[0].amount, '4');
  assert.equal(entries[0].asset, 'USD₮');
  assert.equal(entries[0].direction, 'in');
});

test('merge prefers confirmed chain entries but keeps unindexed local sends', () => {
  const local: HistoryEntry[] = [
    {
      hash: '0xAA',
      asset: 'ETH',
      amount: '1',
      recipient: PEER_EVM,
      direction: 'out',
      feeWei: '1',
      feeUnit: 'wei',
      timestamp: 5,
    },
    {
      hash: '0xFRESH',
      asset: 'ETH',
      amount: '2',
      recipient: PEER_EVM,
      direction: 'out',
      feeWei: '1',
      feeUnit: 'wei',
      timestamp: 99,
    },
  ];
  const chain: HistoryEntry[] = [
    {
      hash: '0xaa',
      asset: 'ETH',
      amount: '1',
      recipient: PEER_EVM,
      direction: 'out',
      feeWei: '21000',
      feeUnit: 'wei',
      timestamp: 50,
    },
  ];

  const merged = mergeHistory(chain, local);
  assert.equal(merged.length, 2);
  // Newest first, and the chain copy replaced the optimistic one case-insensitively.
  assert.deepEqual(
    merged.map((entry) => entry.hash),
    ['0xFRESH', '0xaa']
  );
  assert.equal(merged[1].feeWei, '21000');
});
