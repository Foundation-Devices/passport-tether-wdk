const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const { resolver } = config;
const lruCacheBrowserEntry = path.resolve(
  __dirname,
  'node_modules/@tetherto/wdk-wallet-btc/node_modules/lru-cache/dist/esm/browser/index.min.js'
);
const btcWdkMobileEntry = path.resolve(__dirname, 'src/shims/wdk-wallet-btc-mobile.js');
const btcWdkTransportShim = path.resolve(__dirname, 'src/shims/wdk-wallet-btc-transports.js');
const btcDescriptorsMobileEntry = path.resolve(
  __dirname,
  'src/shims/bitcoinerlab-descriptors-mobile.js'
);

config.resolver = {
  ...resolver,
  extraNodeModules: {
    ...resolver.extraNodeModules,
    'sodium-universal': require.resolve('sodium-javascript'),
  },
  // Ensure module paths include root node_modules
  nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  alias: {
    '@': path.resolve(__dirname, 'src'),
  },
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // The BTC WDK pins lru-cache 11, whose generic ESM entry dynamically
  // imports Node's diagnostics channel. Metro does not currently select the
  // package's browser condition, so resolve the dependency to its official
  // browser build. The cache behavior is identical; only optional Node
  // diagnostics instrumentation is disabled.
  if (moduleName === 'lru-cache') {
    return context.resolveRequest(context, lruCacheBrowserEntry, platform);
  }

  // The package root also exports its Node-only TCP/TLS/WebSocket clients.
  // Passport supplies an external fetch-based client, so the mobile bundle
  // loads only Tether's read-only WDK account implementation.
  if (moduleName === '@tetherto/wdk-wallet-btc') {
    return context.resolveRequest(context, btcWdkMobileEntry, platform);
  }

  // The descriptors compatibility root includes optional Ledger helpers.
  // Coin selection needs only the core bitcoinjs-backed factory.
  if (moduleName === '@bitcoinerlab/descriptors') {
    return context.resolveRequest(context, btcDescriptorsMobileEntry, platform);
  }

  if (
    moduleName === './transports/index.js' &&
    context.originModulePath.endsWith(
      '/@tetherto/wdk-wallet-btc/src/wallet-account-read-only-btc.js'
    )
  ) {
    return context.resolveRequest(context, btcWdkTransportShim, platform);
  }

  // Handle @/ alias
  if (moduleName.startsWith('@/')) {
    const resolvedPath = moduleName.replace('@/', path.resolve(__dirname, 'src') + '/');
    try {
      return context.resolveRequest(context, resolvedPath, platform);
    } catch (e) {
      // If the resolved path fails, fall through to Metro's resolver.
    }
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
