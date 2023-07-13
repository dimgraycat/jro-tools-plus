import path from 'path'
import CopyPlugin from 'copy-webpack-plugin'
import glob from 'glob'

const entries = {};
const srcFiles = `./scripts/*.ts`;
glob.sync(srcFiles).map(function (file) {
  const key = file.replace("./scripts/", "").replace(/\.ts$/, "");
  entries[key] = file;
});
const config = {
    entry: entries,
    output: {
        path: path.join(__dirname, '../dist'),
        filename: 'scripts/[name].js'
    },
    module: {
        rules: [
            {
                test: /.ts$/,
                use: 'ts-loader',
                exclude: [
                    '/node_modules/',
                ]
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: '../public', to: '.' },
            ],
        }),
    ]
}

export default config
