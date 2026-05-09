# Coffee Counter

A cozy, lofi-style counter app built as a lightweight mobile-friendly web app.

## What it does

- Tap the coffee mug to count one more cup.
- Saves the count locally on the device.
- Tracks both the total count and today's count.
- Works offline after the first load thanks to a service worker.

## How to open it

You can open `index.html` directly in a browser.

If you want install-style behavior and offline caching, serve the folder with any local static server so the service worker can register on `http://localhost`.
