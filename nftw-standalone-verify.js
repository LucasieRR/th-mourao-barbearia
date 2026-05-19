const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('[page]', msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto(
    'file:///Users/lucasreis/Desktop/NFTW%20-%20footer/index.html',
    { waitUntil: 'networkidle0' }
  );

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await new Promise((r) => setTimeout(r, 400));

  const info = await page.evaluate(() => ({
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    atBottom: (window.scrollY + window.innerHeight) >= (document.documentElement.scrollHeight - 2),
    hasCurtain: !!document.getElementById('nftw-curtain'),
    hasBrand: !!document.querySelector('.nftw-brand-center'),
  }));
  console.log('INFO:', JSON.stringify(info));

  const footerHandle = await page.$('.nftw-footer');
  await footerHandle.screenshot({ path: '/tmp/standalone-00-rest.png' });

  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  });

  const checkpoints = [250, 650, 1300, 1800];
  let prev = 0;
  for (let i = 0; i < checkpoints.length; i++) {
    await new Promise((r) => setTimeout(r, checkpoints[i] - prev));
    prev = checkpoints[i];
    await footerHandle.screenshot({
      path: `/tmp/standalone-${String(i + 1).padStart(2, '0')}-t${checkpoints[i]}.png`,
    });
  }

  const state = await page.evaluate(() => ({
    peeking: document.getElementById('nftw-curtain')?.classList.contains('nftw-peeking'),
    visible: document.querySelector('.nftw-brand-center')?.classList.contains('nftw-visible'),
  }));
  console.log('STATE AFTER PEEK:', JSON.stringify(state));

  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1300));
  await footerHandle.screenshot({ path: '/tmp/standalone-99-closed.png' });

  const stateClose = await page.evaluate(() => ({
    peeking: document.getElementById('nftw-curtain')?.classList.contains('nftw-peeking'),
    visible: document.querySelector('.nftw-brand-center')?.classList.contains('nftw-visible'),
  }));
  console.log('STATE AFTER CLOSE:', JSON.stringify(stateClose));

  await browser.close();
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
