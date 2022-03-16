/// <reference path="../../typings/globals/jquery/index.d.ts" />
import * as _ from 'underscore'

class TorihikiPlus {
  private worlds: any = [
    [
      {"Breidablik": 13},
      {"Urdr": 14},
      {"Noatun": 15}
    ],
    [
      {"Lif": 12},
      {"Mimir": 11},
      {"Olrun": 6},
      {"Sigrun": 1},
      {"Alvitr": 2},
      {"Hervor": 8},
      {"Idavoll": 9},
      {"Trudr": 4},
      {"Frigg": 10},
      {"Gimle": 7},
      {"Radgrid": 5},
      {"Vali": 3}
    ]
  ]
  public uri: URL

  constructor() {
    // add world change
    this.uri = new URL(location.href)
    if (this.uri.host === "rotool.gungho.jp") {
      this.worldChange()

      // add options
      this.detail()
    }
  }

  worldChange() {
    if (document.getElementById('searchresult') != null) {
      var worldElement = $('<div>', {id: 'plus-worldSelect'})
      worldElement.append($('<p>', {
        class: 'plus-worldSelect-description',
        text: 'ワールド変更'
      }))

      var groupElement = $('<p>', {class: 'plus-worlds'})
      for (let group in this.worlds) {
        for (let world in this.worlds[group]) {
          for (let name in this.worlds[group][world]) {
            this.uri.searchParams.set("world", this.worlds[group][world][name])
            groupElement.append($('<a>', {
              href: this.uri.toString(),
              text: name
            }))
          }
        }
        groupElement.append($('<br>'))
      }
      worldElement.append(groupElement)
      $('#searchresult').prepend(worldElement)
    }
  }

  detail() {
    let _this = this
    if (document.getElementsByClassName('.tradedetail.clearfix') != null) {
      $.each($('.tradedetail.clearfix'), function() {
        let table = this
        if (!$(table).find('#plus').size()) {
          $(table).find('.link').each(function() {
            let linkElement = this
            // href: log_detail.php?log=xxxxx
            let href = $(linkElement).find('a').attr('href')
            $.ajax({type: 'get', url: href})
              .done(function(data) {
                _this.parse(linkElement, data)
              })
          })
        }
      })
    }
  }

  parse(linkElement: Element, data:string) {
    $(data).find('.datatable').each(function() {
      let params: any = {}
      $(this).find('td').each(function(i:number, td:Element) {
        // i=0: zeny, i=1: count
        if (i > 1) {
          let text = $.trim($(td).html())
          if (text.match(/・/)) {
            if (text.match(/<br>/)) {
              params.options = text.split('<br>')
            }
            else {
              params.options = []
              params.options.push(text)
            }
          }
          else {
            params.refining = text
            if (params.refining === '0' || params.refining === 'なし') {
              delete params.refining
            }
          }
        }
      })
      let tags = $('<ul>', {id: 'plus'})
      if ('refining' in params) {
        tags.append($('<li>', {class: 'plus-li'}).append(
          $('<span>', {
            class: 'plus-badge',
            text: '・精錬値 + ' + params.refining
          })
        ))
      }
      if ('options' in params) {
        $.each(params.options, function(j, option) {
          option = option.replace('	</overclock>', '')
          tags.append($('<li>', {class: 'plus-li'}).append(
            $('<span>', {
              class: 'plus-badge',
              text: _.unescape(option)
            })
          ))
        })
      }
      $(linkElement).before(tags)
    })
  }
}

let plus = new TorihikiPlus()

if (plus.uri.host === "rotool.gungho.jp") {
  let addDetail = (): void => {
    plus.detail()
  }
  $(document).on('click', '.more > a', function() {
    setTimeout(addDetail, 1000)
  })
}
