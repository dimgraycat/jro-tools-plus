// .versionrc.js
module.exports = {
  bumpFiles: [
    {
      filename: 'package.json',
    },
    {
      filename: 'package-lock.json', // npm をお使いの場合
      type: 'json'
    },
    {
      filename: 'public/manifest.json', // manifest.json へのパス
      updater: {
        readVersion: (contents) => {
          return JSON.parse(contents).version;
        },
        writeVersion: (contents, version) => {
          const json = JSON.parse(contents);
          json.version = version;
          return JSON.stringify(json, null, 4) + '\n';
        }
      }
    }
  ],
};