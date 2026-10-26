/* ==========================================================================
   SmartExpenses AI — Runtime configuration
   --------------------------------------------------------------------------
   This is the only file you need to touch to point the front-end at a
   deployed backend. It is loaded before `js/api.js` on every page, so the
   new value takes effect on a normal reload.

   API_BASE_URL — the base URL of the FastAPI backend.

     ""                        Automatic.
                                On localhost / 127.0.0.1 the backend is
                                expected at http://127.0.0.1:8001, which is
                                how the project runs locally.
                                On any other host the requests go to the
                                same origin as the page (useful when the
                                backend serves the front-end itself).
     "same-origin"             Always use the same origin as the page.
     "https://api.example.com" A separately hosted backend. This is what a
                                GitHub Pages deployment needs.

   Overrides, handy for testing a backend without editing this file:

     ?api=https://api.example.com     query string (highest priority)
     localStorage                    "smartexpenses.apiBaseUrl", persists
                                     across every page of the site

   The GitHub Pages workflow overwrites this file with the value of the
   API_BASE_URL repository variable (Settings -> Secrets and variables ->
   Actions -> Variables) when one is set, so the URL can be changed later
   without a new commit.
   ========================================================================== */

const fs = require("fs");

const apiUrl = process.env.API_BASE_URL;

if (!apiUrl) {
  throw new Error("API_BASE_URL is missing in Vercel settings");
}

const config = {
  API_BASE_URL: apiUrl.replace(/\/+$/, "")
};

fs.writeFileSync(
  "config.js",
  "window.APP_CONFIG = " + JSON.stringify(config) + ";\n"
);

console.log("Frontend API configuration generated.");
