module.exports = {
  root: true,
  extends: [
    'eslint-config-digitalbazaar',
    'eslint-config-digitalbazaar/jsdoc'
  ],
  env: {
    node: true
  },
  globals: {
    TextDecoder: true,
    TextEncoder: true,
    Uint8Array: true,
    document: true,
    crypto: true,
    navigator: true,
    requestAnimationFrame: true,
    window: true
  }
}
