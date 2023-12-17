const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  plugins: [    
    new HtmlWebpackPlugin ({
      inject: true,
      template: 'src/index.html'
    })
  ]
}