module.exports = {
  mode: 'production',
  entry: {
    qram: './main.js'
  },
  output: {
    filename: '[name].min.js',
    library: 'qram',
    libraryTarget: 'umd'
  }
};
