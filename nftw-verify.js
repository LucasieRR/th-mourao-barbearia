const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('[page]', msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto('file:///Users/lucasreis/Desktop/TH%20-%20LP/index.html', {
    waitUntil: 'networkidle0',
  });

  // Scroll to absolute bottom so isAtBottom() === true
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  // Wait for the quiet period (>180ms) so the gesture handler arms itself
  await new Promise((r) => setTimeout(r, 400));

  const armedState = await page.evaluate(() => ({
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    atBottom: (window.scrollY + window.innerHeight) >= (document.documentElement.scrollHeight - 2),
  }));
  console.log('ARMED STATE:', JSON.stringify(armedState));

  const footerHandle = await page.$('.footer');

  // REST screenshot (curtain closed)
  await footerHandle.screenshot({ path: '/tmp/nftw-frame-00-rest.png' });

  // Force gesture: extra wheel-down after the scroll stopped
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  });

  const checkpoints = [80, 250, 450, 650, 900, 1300, 1800];
  let prev = 0;
  for (let i = 0; i < checkpoints.length; i++) {
    await new Promise((r) => setTimeout(r, checkpoints[i] - prev));
    prev = checkpoints[i];
    await footerHandle.screenshot({
      path: `/tmp/nftw-frame-${String(i + 1).padStart(2, '0')}-t${checkpoints[i]}.png`,
    });
  }

  const stateAfterPeek = await page.evaluate(() => ({
    peeking: document.getElementById('nftw-curtain-outer')?.classList.contains('nftw-peeking'),
    visible: document.querySelector('.nftw-cosmos-brand')?.classList.contains('nftw-visible'),
    clipPath: getComputedStyle(document.getElementById('nftw-curtain-outer')).clipPath.slice(0, 220),
    brandOpacity: getComputedStyle(document.querySelector('.nftw-cosmos-brand')).opacity,
  }));
  console.log('STATE AFTER PEEK:', JSON.stringify(stateAfterPeek, null, 2));

  // Wait for another quiet period so the gesture re-arms for the close
  await new Promise((r) => setTimeout(r, 400));

  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1300));
  await footerHandle.screenshot({ path: '/tmp/nftw-frame-99-closed.png' });

  const stateAfterClose = await page.evaluate(() => ({
    peeking: document.getElementById('nftw-curtain-outer')?.classList.contains('nftw-peeking'),
    visible: document.querySelector('.nftw-cosmos-brand')?.classList.contains('nftw-visible'),
  }));
  console.log('STATE AFTER CLOSE:', JSON.stringify(stateAfterClose, null, 2));

  await browser.close();
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
