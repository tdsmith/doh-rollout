"use strict";
/* global Services, ChromeUtils, BrowserWindowTracker, 
   ExtensionCommon, ExtensionAPI */

ChromeUtils.import("resource://gre/modules/Console.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");

var {EventManager, EventEmitter} = ExtensionCommon;
const {Management: {global: { tabTracker }}} = ChromeUtils.import("resource://gre/modules/Extension.jsm", null);

ChromeUtils.defineModuleGetter(
  this,
  "BrowserWindowTracker",
  "resource:///modules/BrowserWindowTracker.jsm",
);


/** Return most recent NON-PRIVATE browser window, so that we can
 * manipulate chrome elements on it.
 */
function getMostRecentBrowserWindow() {
  return BrowserWindowTracker.getTopWindow({
    private: false,
    allowPopups: false,
  });
}


class DoorhangerEventEmitter extends EventEmitter {
  async emitShow({name, text, okLabel, okAccessKey, cancelLabel, cancelAccessKey}) {
    const self = this;
    const recentWindow = getMostRecentBrowserWindow();
    const browser = recentWindow.gBrowser.selectedBrowser;
    const tabId = tabTracker.getBrowserTabId(browser);

    const primaryAction =  {
      disableHighlight: false,
      label: okLabel,
      accessKey: okAccessKey,
      callback: () => {
        self.emit("doorhanger-accept", tabId);
      },
    };
    const secondaryActions =  [
      {
        label: cancelLabel,
        accessKey: cancelAccessKey,
        callback: () => {
          self.emit("doorhanger-decline", tabId);
        },
      },
    ];

    let doorhangerEvents = event => {
      let win, messageBody, messageBodyChildren, currentMessageChildElement, currentMessageTagName, currentMessageInnerHTML ;

      switch (event) {
      case "shown":
        // Get Current Notification on Active Tab
        win = getMostRecentBrowserWindow();
        messageBody =  win.PopupNotifications.panel.firstChild.querySelector(".popup-notification-description");
        messageBodyChildren = messageBody.children;
        // Loop through each child element of the popup notification text
        // These elements are not named, so we have to qualify it using its tagName
        // and confirmation that its not an empty string
        for (var messageBodyChild in messageBodyChildren) {
          currentMessageChildElement = messageBody.childNodes[messageBodyChild];
          currentMessageTagName = currentMessageChildElement.tagName;
          currentMessageInnerHTML = currentMessageChildElement.innerHTML;
          if ( currentMessageTagName === "html:b" && currentMessageInnerHTML !== "" ) {
            currentMessageChildElement.style.display = "block";
            currentMessageChildElement.style.marginBottom = "8px";
          }
        }
        break;
      }
    };

    let learnMoreURL = Services.urlFormatter.formatURL("https://support.mozilla.org/%LOCALE%/kb/firefox-dns-over-https");
    const options = {
      hideClose: true,
      persistWhileVisible: true,
      persistent: true,
      autofocus: true,
      name,
      popupIconURL: "chrome://browser/skin/connection-secure.svg",
      learnMoreURL,
      escAction: "buttoncommand",
      eventCallback: doorhangerEvents,
    };
    recentWindow.PopupNotifications.show(browser, "doh-first-time", text, null, primaryAction, secondaryActions, options);
  }
}


var doorhanger = class doorhanger extends ExtensionAPI {
  getAPI(context) {
    const doorhangerEventEmitter= new DoorhangerEventEmitter();
    return {
      experiments: {
        doorhanger: {
          async show(properties) {
            await doorhangerEventEmitter.emitShow(properties);
          },
          onDoorhangerAccept: new EventManager({
            context,
            name: "doorhanger.onDoorhangerAccept",
            register: fire => {
              let listener = (value, tabId) => {
                fire.async(tabId);
              };
              doorhangerEventEmitter.on(
                "doorhanger-accept",
                listener,
              );
              return () => {
                doorhangerEventEmitter.off(
                  "doorhanger-accept",
                  listener,
                );
              };
            },
          }).api(),
          onDoorhangerDecline: new EventManager({
            context,
            name: "doorhanger.onDoorhangerDecline",
            register: fire => {
              let listener = (value, tabId) => {
                fire.async(tabId);
              };
              doorhangerEventEmitter.on(
                "doorhanger-decline",
                listener,
              );
              return () => {
                doorhangerEventEmitter.off(
                  "doorhanger-decline",
                  listener,
                );
              };
            }
          }).api(),
        },
      }
    };
  }
};
