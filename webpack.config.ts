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

globSync('content_scripts/scripts/*.ts', { cwd: __dirname }).forEach((filePath) => {
    const name = path.basename(filePath, '.ts'); // 'loader'
    const entryKey = `content_scripts/${name}`;
    entries[entryKey] = `./${filePath}`; // e.g. './content_scripts/scripts/loader.ts'
});

globSync('tools/ts/*.ts', { cwd: __dirname }).forEach((filePath) => {
    const name = path.basename(filePath, '.ts');
    const entryKey = `tools/js/${name}`;
    entries[entryKey] = `./${filePath}`; // e.g. './tools/ts/*.ts'
});

globSync('tools/js/*.js', { cwd: __dirname }).forEach((filePath) => {
    const name = path.basename(filePath, '.js'); // 'jro-tools-settings'
    const entryKey = `tools/js/${name}`;
    entries[entryKey] = `./${filePath}`; // e.g. './tools/js/jro-tools-settings.js'
});

globSync('sidebar/ts/*.ts', { cwd: __dirname }).forEach((filePath) => {
    const name = path.basename(filePath, '.ts');
    const entryKey = `sidebar/js/${name}`;
    entries[entryKey] = `./${filePath}`; // e.g. './sidebar/ts/*.ts'
});

const config = {
    mode: isProduction ? 'production' : 'development',
    context: __dirname,
    devtool: isProduction ? false : 'inline-source-map',
    entry: entries,
    output: {
        path: path.join(__dirname, 'dist'),
        filename: '[name].js' // Output filename based on entry key structure (e.g., content_scripts/loader.js)
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            // tsconfig.jsonのパスをプロジェクトルートに指定
                            // content_scripts内のTSファイルもこの設定で処理される想定
                            configFile: path.resolve(__dirname, 'tsconfig.json'),
                            logLevel: 'info',
                            logInfoToStdOut: true,
                            transpileOnly: true // 型チェックは別途行う想定
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
                    from: path.resolve(__dirname, 'public'),
                    to: '.'
                },
                {
                    from: path.resolve(__dirname, 'tools/index.html'),
                    to: 'tools/index.html'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'),
                    to: 'tools/webfonts'
                },
                {
                    from: path.resolve(__dirname, 'sidebar/index.html'),
                    to: 'sidebar/index.html'
                },
                {
                    from: path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'),
                    to: 'sidebar/webfonts'
                },
            ],
        }),
        new MiniCssExtractPlugin({
            // SCSSから生成されるCSSファイル
            filename: isProduction ? 'css/jro_tools_plus.min.css' : 'css/jro_tools_plus.css',
        }),
    ]
}

export default config
