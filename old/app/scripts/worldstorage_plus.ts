"use strict";

declare var require: any;
import $ = require('jquery');
import wsForm from 'worldstorage_plus_form';
var List = require('list.js');

class SearchItems {
  private runPages: string[] = [
    "https://ragnarokonline.gungho.jp/gameguide/system/worldstorage/sta.html",
    "https://ragnarokonline.gungho.jp/gameguide/system/worldstorage/ygg.html"
  ];

  constructor() {
    if (this.canRun()) {
      this.addTopButton();
      this.topButton();
      this.customTable();
      this.addForm();
      this.worldstorage();
    }
  }

  isYgg(): boolean {
    return (location.href === this.runPages[1]) ? true : false;
  }

  canRun() {
    let canRun: boolean = false;
    this.runPages.forEach((page) => {
      if (page === location.href) {
        canRun = true;
      }
    });
    return canRun;
  }

  addTopButton() {
    let p = $('<p>', {id: 'plus-top-button'});
    p.append($('<a>', {
      text: 'Top',
      href: 'javascript:void(0)'
    }));
    $('body').append(p);
  }

  topButton() {
    let button = $('#plus-top-button');
    button.hide();
    $(window).scroll(function() {
      if ($(this).scrollTop() > 200) {
        button.fadeIn();
      } else {
        button.fadeOut();
      }
    });

    button.click(() => {
      $('body,html').animate({scrollTop: 0}, 500);
      return false;
    });
  }

  worldstorage() {
    let itemList = new List('plus-ws-itemList', {valueNames: [
      'name', 'standard', 'expert', 'goOut'
    ]});
    wsForm.filterClear(itemList);
    wsForm.filterCostume(itemList);
    wsForm.filterCard(itemList);
    wsForm.filterCoin(itemList);
    wsForm.filterEquipment(itemList);
    wsForm.filterOther(itemList);
    wsForm.filterExpertOnly(itemList);
  }

  customTable() {
    let _this = this;
    $('body').find('div').attr('id', 'plus-ws-itemList');
    $('body').find('table.table01').prepend($('<thead>'));
    $('body').find('table.table01 tbody').addClass('list');
    $('body').find('.table01 tbody tr').each((index:number, ele:Element) => {
      let theadCount: number = 1;
      if (_this.isYgg()) {
        theadCount = 0;
      }
      if (index <= theadCount) {
        $('.table01 thead').append(ele);
      }
      $(ele).find('td').each((i:number, e:Element) => {
        switch (i) {
          case 0:
            $(e).addClass('name');
            break;
          case 1:
            $(e).addClass('standard');
            break;
          case 2:
            $(e).addClass('expert');
            break;
          case 3:
            $(e).addClass('goOut');
            break;
        }
      });
    });
  }

  addForm() {
    let div = $('<div>', {id: 'plus-ws-form'});

    let p1 = $('<p>');
    p1.append($('<span>', {text: '検索:'}));
    p1.append($('<input>', {
      class: 'search',
      placeholder: 'アイテム名'
    }));
    div.append(p1);

    let p2 = $('<p>');
    p2.append($('<span>', {text: 'filter:'}));
    wsForm.addRadio(p2, 'plus-ws-clear', 'なし', true);
    wsForm.addRadio(p2, 'plus-ws-equipment', '装備');
    wsForm.addRadio(p2, 'plus-ws-costume', '衣装');
    wsForm.addRadio(p2, 'plus-ws-card', 'カード');
    wsForm.addRadio(p2, 'plus-ws-coin', 'コイン');
    wsForm.addRadio(p2, 'plus-ws-other', 'その他');

    let text:string = this.isYgg() ? 'Y鯖からしか入れれない' : 'エキスパートのみ';
    wsForm.addRadio(p2, 'plus-ws-expert-only', text);

    div.append(p2);
    $(".table01").before(div);
  }
}

var searchItems = new SearchItems();
