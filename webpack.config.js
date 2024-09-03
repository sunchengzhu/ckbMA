const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node', // 确保不会打包 Node.js 内置的库
  entry: './calculateMA.js', // 你的入口文件
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'calculateMA-bundle.js'
  },
  externals: [nodeExternals()], // 防止 node_modules 中的库被打包
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader', // 使用 Babel 转换 ES6 以上的代码
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  plugins: [
    new webpack.IgnorePlugin({ resourceRegExp: /^pg-native$/ }) // 如果有些包不需要打包，可以在这里设置
  ]
};
