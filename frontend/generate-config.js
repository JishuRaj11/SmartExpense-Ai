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