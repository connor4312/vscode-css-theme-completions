const path = require('path');

const config = (target) => ({
  target: 'node',
  entry: './src/extension.ts',
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: `extension.${target}.js`,
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  externals:
    target === 'web'
      ? { vscode: 'commonjs vscode', 'node-fetch': 'fetch' }
      : { vscode: 'commonjs vscode' },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
    ],
  },
});

module.exports = [config('node'), config('web')];
