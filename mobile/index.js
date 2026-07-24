// BC-UR expects the Node Buffer global. Install it before Expo Router evaluates
// any application modules.
const { installRuntimePolyfills } = require('./src/runtime/installPolyfills');

installRuntimePolyfills();
require('expo-router/entry');
