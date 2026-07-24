import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDefaultNetwork,
  getNetworksForAsset,
  getWalletAsset,
  toPassportAsset,
  walletAssets,
} from '../catalog';

test('catalog mirrors the production Tether Wallet currency groups', () => {
  assert.deepEqual(
    walletAssets.filter((asset) => asset.group !== 'Network gas').map((asset) => asset.symbol),
    ['BTC', 'USD₮', 'USA₮', 'XAU₮']
  );
});

test('only truthfully supported routes map to the existing Passport signer', () => {
  assert.equal(getDefaultNetwork('usdt')?.id, 'ethereum-sepolia');
  assert.equal(getDefaultNetwork('eth')?.id, 'ethereum-sepolia');
  assert.equal(getDefaultNetwork('btc'), null);
  assert.equal(getDefaultNetwork('usat'), null);
  assert.equal(getDefaultNetwork('xaut'), null);
  assert.equal(toPassportAsset('usdt'), 'USD₮');
  assert.equal(toPassportAsset('eth'), 'ETH');
  assert.equal(toPassportAsset('btc'), null);
});

test('USD₮ presents the production network family without enabling fake testnets', () => {
  const networks = getNetworksForAsset('usdt');
  assert.deepEqual(
    networks.map((network) => network.name),
    ['Ethereum Sepolia', 'Plasma', 'Polygon', 'Arbitrum', 'Tron']
  );
  assert.deepEqual(
    networks.filter((network) => network.enabled).map((network) => network.id),
    ['ethereum-sepolia']
  );
  assert.equal(getWalletAsset('usdt').name, 'Tether USD');
});
