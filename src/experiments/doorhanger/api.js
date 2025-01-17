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

    let notification;

    let learnMoreURL = Services.urlFormatter.formatURL("https://support.mozilla.org/%LOCALE%/kb/firefox-dns-over-https");

    let doorhangerEvents = event => {
      // If additional event listening is needed, recommend switching
      // to a switch case statement.
      if (event !== "dismissed") {
        return;
      }
      // On notification removal (switch away from active tab, close tab), enable DoH preference
      self.emit("doorhanger-accept", tabId);
      recentWindow.PopupNotifications.remove(notification);
    };
    
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
      removeOnDismissal: false,
    };



    notification = recentWindow.PopupNotifications.show(browser, "doh-first-time", text, null, primaryAction, secondaryActions, options);
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
