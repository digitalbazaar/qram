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
    requestAnimationFrame: true
  }
}
