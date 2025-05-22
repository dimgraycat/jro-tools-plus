import path from 'path'
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin'
import { globSync } from 'glob';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

// ES Module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

const entries: Record<string, string> = {};
const filesPattern = 'scripts/*.ts';

globSync(filesPattern, { cwd: __dirname }).forEach(function (relativePath) {
    const key = path.basename(relativePath, '.ts');
    entries[key] = `./${relativePath}`;
});
const config = {
    mode: isProduction ? 'production' : 'development',
    context: __dirname,
    devtool: isProduction ? false : 'inline-source-map',
    entry: entries,
    output: {
        path: path.join(__dirname, '../dist'),
        filename: 'scripts/[name].js'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: path.resolve(__dirname, 'tsconfig.json'), // tsconfig.jsonのパスを明示的に指定
                            logLevel: 'info', // 'debug' にするとさらに詳細なログが出力されます
                            logInfoToStdOut: true, // ログを標準出力に表示
                            transpileOnly: true // 型チェックをスキップ (デバッグ用)
                        }
                    }
                ],
                exclude: /node_modules/
            },
            {
                test: /\.scss$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: !isProduction,
                        },
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sassOptions: {
                                outputStyle: isProduction ? 'compressed' : 'expanded',
                            },
                            sourceMap: !isProduction,
                        },
                    },
                ],
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, '../public'),
                    to: '.'
                },
            ],
        }),
        new MiniCssExtractPlugin({
            filename: isProduction ? 'css/jro_tools_plus.min.css' : 'css/jro_tools_plus.css',
        }),
    ]
}

export default config
