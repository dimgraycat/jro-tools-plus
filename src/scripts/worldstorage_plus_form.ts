"use strict"

declare var require: any
import $ = require('jquery')

export default class WorldstoragePlusForm {

  static addRadio(ele:any, id:string, text:string, checked:boolean = false) {
    ele.append(
      $('<input>', {type: 'radio', name: 'plus-ws-filter-radio', id: id})
      .addClass('plus-ws-checkbox')
      .prop('checked', checked)
    )
    ele.append(
      $('<label>', {for: id, text: text})
      .addClass('plus-ws-radio-label')
    )
  }

  static isCard(name:string) {
    let card = /カード$/g
    let skillCard = /スキルカード$/g
    if (name.match(skillCard)) {
      return false
    }
    return (name.match(card)) ? true : false
  }

  static isEquipment(name:string) {
    let regex1 = /式鍛錬符$/g
    if (name.match(regex1)) {
      return true
    }
    let regex2 = /[0-4]\]$/g
    return (name.match(regex2) && !this.isCostume(name)) ? true : false
  }

  static isCoin(name:string) {
    let regex = /コイン$/g
    return (name.match(regex)) ? true : false
  }

  static isCostume(name:string) {
    let regex = / ?\[衣装/g
    return (name.match(regex)) ? true : false
  }

  static filterClear(itemList:any) {
    $('#plus-ws-clear').on('click', () => {
      if($('#plus-ws-clear').is(':checked')){
        itemList.filter()
      }
    })
  }

  static filterExpertOnly(itemList:any) {
    $('#plus-ws-expert-only').on('click', () => {
      if($('#plus-ws-expert-only').is(':checked')){
        itemList.filter((item:any) => {
          let regex = /×/g
          if(item.values().standard.match(regex)) {
            return true
          }
          else {
            return false
          }
        })
      }
    })
  }

  static filterOther(itemList:any) {
    let _this = this
    $('#plus-ws-other').on('click', () => {
      if($('#plus-ws-other').is(':checked')){
        itemList.filter((item:any) => {
          let name = item.values().name
          if(
               !_this.isEquipment(name)
            && !_this.isCostume(name)
            && !_this.isCard(name)
            && !_this.isCoin(name)
          ) {
            return true
          }
          else {
            return false
          }
        })
      }
    })
  }

  static filterEquipment(itemList:any) {
    let _this = this
    $('#plus-ws-equipment').on('click', () => {
      if($('#plus-ws-equipment').is(':checked')){
        itemList.filter((item:any) => {
          if(_this.isEquipment(item.values().name)) {
            return true
          }
          else {
            return false
          }
        })
      }
    })
  }

  static filterCoin(itemList:any) {
    let _this = this
    $('#plus-ws-coin').on('click', () => {
      if($('#plus-ws-coin').is(':checked')){
        itemList.filter((item:any) => {
          if(_this.isCoin(item.values().name)) {
            return true
          }
          else {
            return false
          }
        })
      }
    })
  }

  static filterCard(itemList:any) {
    let _this = this
    $('#plus-ws-card').on('click', () => {
      if($('#plus-ws-card').is(':checked')){
        itemList.filter((item:any) => {
          if(_this.isCard(item.values().name)) {
            return true
          }
          else {
            return false
          }
        })
      }
    })
  }

  static filterCostume(itemList:any) {
    let _this = this
    $('#plus-ws-costume').on('click', () => {
      if($('#plus-ws-costume').is(':checked')){
        itemList.filter((item:any) => {
          if(_this.isCostume(item.values().name)) {
            return true
          }
          else {
            return false
          }
        })
      }
    })
  }
}
