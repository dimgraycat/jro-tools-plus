import path from 'path'
import CopyPlugin from 'copy-webpack-plugin'

const config = {
    entry: {
        loader: path.join(__dirname, 'src/scripts', 'loader.ts'),
        worldstorage_plus: path.join(__dirname, 'src/scripts', 'worldstorage_plus.ts'),
    },
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'scripts/[name].js'
    },
    module: {
        rules: [
            {
                test: /.ts$/,
                use: 'ts-loader',
                exclude: '/node_modules/'
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'public', to: '.' },
            ],
        }),
    ]
}

export default config
