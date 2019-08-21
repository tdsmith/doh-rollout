"use strict";
/* exported heuristics */
/* global Cc, Ci, Components, ExtensionAPI, Services  */
let Cu3 = Components.utils;
Cu3.import("resource://gre/modules/Services.jsm");


let pcs = Cc["@mozilla.org/parental-controls-service;1"]
          .getService(Ci.nsIParentalControlsService);


const heuristicsManager = {
  setupTelemetry() {
    // Set up the Telemetry for the heuristics
    Services.telemetry.registerEvents("doh", {
      "evaluate": {
        methods: ["evaluate"],
        objects: ["heuristics"],
        extra_keys: ["google", "youtube",
                     "comcastProtect", "comcastParent",
                     "canary", "modifiedRoots", 
                     "browserParent", "policy",
                     "evaluateReason"]
      }
    });

    // Set up the Telemetry for the doorhanger
    Services.telemetry.registerEvents("doh", {
      "doorhanger": {
        methods: ["doorhanger"],
        objects: ["enable_button", "disable_button", "timeout"]
      }
    });
  },

  sendHeuristicsPing(decision, heuristicsResults) {
    Services.telemetry.recordEvent("doh", "evaluate", "heuristics",
                                   decision, heuristicsResults);
  },

  sendDoorhangerPing(reason) {
    console.log("Sending a doorhanger ping");
    Services.telemetry.recordEvent("doh", "doorhanger", reason, "null");
  },

  async checkEnterprisePolicies() {
    if (Services.policies.status === Services.policies.ACTIVE) {
      let policies = Services.policies.getActivePolicies();
      if (!("DNSOverHTTPS" in policies)) {
        // If DoH isn't in the policy, disable it
        return "disable_doh";
      } else {
        let dohPolicy = policies.DNSOverHTTPS;
        if (dohPolicy.Enabled === true) {
          // If DoH is enabled in the policy, enable it
          return "enable_doh";
        } else {
          // If DoH is disabled in the policy, disable it
          return "disable_doh";
        }
      }
    }

    // Enable DoH by default
    return "enable_doh";
  },

  async checkParentalControls() {
    let enabled = pcs.parentalControlsEnabled;
    if (enabled) {
      return "disable_doh";
    }
    return "enable_doh";
  }
};


var heuristics = class heuristics extends ExtensionAPI {
  getAPI(context) {
    return {
      experiments: {
        heuristics: {
          setupTelemetry() {
            heuristicsManager.setupTelemetry();
          },

          sendHeuristicsPing(decision, results) {
            heuristicsManager.sendHeuristicsPing(decision, results); 
          },

          sendDoorhangerPing(reason) {
            heuristicsManager.sendDoorhangerPing(reason);
          },

          async checkEnterprisePolicies() {
            let result = await heuristicsManager.checkEnterprisePolicies();
            return result;
          },

          async checkParentalControls() {
            let result = await heuristicsManager.checkParentalControls();
            return result;
          }
        },
      },
    };
  }
};
