let config = [
  {
    "domain": "ragnarokonline.gungho.jp",
    "regex": /^\/gameguide\/system\/worldstorage\/(sta.html|ygg.html)/g,
    "js": ['scripts/worldstorage_plus.js'],
    "css": ['styles/jro_torihiki_plus.css']
  },
  {
    "domain": "rotool.gungho.jp",
    "regex": /^\/torihiki\/.*/g,
    "js": ['scripts/torihiki_plus.js'],
    "css": ['styles/jro_torihiki_plus.css']
  }
]

let script = (list: string[]): void => {
  list.forEach((file) => {
    let elem = document.createElement('script')
    elem.setAttribute('src', chrome.extension.getURL(file))
    document.body.appendChild(elem)
  })
}

let css = (list: string[]): void => {
  list.forEach((file) => {
    let link = document.createElement("link")
    link.href = chrome.extension.getURL(file)
    link.type = "text/css"
    link.rel = "stylesheet"
    document.getElementsByTagName("head")[0].appendChild(link)
  })
}

let uri = new URL(location.href)
config.forEach((data: any): void => {
  if (uri.host === data.domain && uri.pathname.match(data.regex)) {
    script(data.js)
    css(data.css)
  }
})


