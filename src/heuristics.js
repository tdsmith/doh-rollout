"use strict";
/* global browser, tldjs */


const GLOBAL_CANARY = "use-application-dns.net";


async function dnsLookup(hostname) {
  let flags = ["disable_trr", "disable_ipv6", "bypass_cache"];
  let response = await browser.dns.resolve(hostname, flags);
  return response.addresses;
}


// TODO: Randomize order of lookups
async function dnsListLookup(domainList) {
  let results = [];
  for (let i = 0; i < domainList.length; i++) {
    let domain = domainList[i];
    try {
      let addresses = dnsLookup(domain);
      results.concat(addresses);
    } catch (e) {
      // Handle NXDOMAIN
      if (e.message === "NS_ERROR_UNKNOWN_HOST") {
        results = results.concat(null);
      } else {
        throw e;
      }
    }
  }
  return results;
}


async function safeSearch() {
  const providerList = [
    {
      name: "google",
      check: [
        "www.google.com",
        "google.com"
      ],
      filter: [
        "forcesafesearch.google.com",
      ],
    },
    {
      name: "youtube",
      check: [
        "www.youtube.com",
        "m.youtube.com",
        "youtubei.googleapis.com",
        "youtube.googleapis.com",
        "www.youtube-nocookie.com"
      ],
      filter: [
        "restrict.youtube.com",
        "restrictmoderate.youtube.com"
      ],
    }
  ];
 
  // Compare strict domain lookups to non-strict domain lookups
  let safeSearchChecks = {};
  for (let i = 0; i < providerList.length; i++) {
    let providerObj = providerList[i];
    let providerName = providerObj.name;
    safeSearchChecks[providerName] = false;

    let results = {};
    results.checks = await dnsListLookup(providerObj.check);
    results.filters = await dnsListLookup(providerObj.filter);

    // Given a provider, check if the answer for any safe search domain 
    // matches the answer for any default domain
    for (let filter of results.filters) {
      if (filter === null) {
        continue;
      }

      let filtered = results.checks.includes(filter);
      if (filtered) {
        safeSearchChecks[providerName] = true;
      }
    }
  }
  return safeSearchChecks;
}


async function comcastDomains() {
  const canaryList = [
    {
      type: "malware",
      check: ["test.xfiprotectedbrowsing.com"]
    },
    {
      type: "parental",
      check: ["test.xfiparentalcontrols.com"]
    }
  ];

  let canaryChecks = {};
  for (let i = 0; i < canaryList.length; i++) {
    let canaryObj = canaryList[i];
    let canaryType = canaryObj.type;
    canaryChecks[canaryType] = false;

    // If NXDOMAIN is not returned, we infer that content filters are on
    let answers = await dnsListLookup(canaryObj.check);
    for (let j = 0; j < answers.length; j++) {
      let answer = answers[j];
      if (answer) {
        canaryChecks[canaryType] = true;
      }
    }
  }
  return canaryChecks;
}


async function checkContentFilters() {
  let comcastChecks = await comcastDomains();
  let blocksExampleAdultSite = await exampleAdultSite();
  let safeSearchChecks = await safeSearch();
  let results = {"usesComcastMalwareFilter": comcastChecks.malware,
                 "usesComcastParentalFilter": comcastChecks.parental,
                 "usesGoogleSafeSearch": safeSearchChecks.google,
                 "usesYouTubeSafeSearch": safeSearchChecks.youtube};
  // TODO: Send Telemetry.
  // Do we want to send Telemetry regardless if parental controls
  // are enabled?
  
  if (results.usesComcastMalwareFilter ||
      results.usesComcastParentalFilter ||
      results.usesGoogleSafeSearch ||
      results.usesYouTubeSafeSearch) {
    return true;
  }
  return false;
}


async function checkSplitHorizon(responseDetails) {
  let url = responseDetails.url;
  let ip = responseDetails.ip;
  let hostname = new URL(url).hostname;
  let fromCache = responseDetails.fromCache;
  let redirectUrl = responseDetails.redirectUrl;

  // Ignore anything from localhost
  if (hostname === "localhost") {
    return false;
  }

  // If we didn't get IP/hostname fields from the response object, then either:
  //   a) We read the webpage from the browser cache
  //   b) We are being redirected
  //   c) Something undefined happened
  if (!ip || !hostname) {
    if (!fromCache && !redirectUrl) {
      console.error("Unknown reason for empty IP/Hostname fields", url);
    }
    return false;
  }

  let notInPSL = tldjs.tldExists(hostname);
  let results = {"notInPSL": notInPSL};
  if (results.notInPSL) {
    return true;
  }
  return false;
}


// TODO: Confirm the expected address when filtering is on
async function checkGlobalCanary() {
  let addresses = await dnsLookup(GLOBAL_CANARY);
  for (let i = 0; i < addresses.length; i++) {
    let addr = addresses[i];
    if (addr === "192.0.0.8") {
      return true;
    }
  }
  return false;
}
