const chromeLauncher = require('chrome-launcher');

let opts = {
  port: 9222,
};

if (typeof process.env.HEADLESS !== 'undefined' && process.env.HEADLESS === '1') {
  opts.chromeFlags = ["--headless", "--disable-gpu"];
}

chromeLauncher.launch(opts).then(chrome => {
  console.log(`Chrome debugging port running on ${chrome.port}`);
});
