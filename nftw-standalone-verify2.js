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

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await new Promise((r) => setTimeout(r, 400));

  const info = await page.evaluate(() => ({
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    atBottom: (window.scrollY + window.innerHeight) >= (document.documentElement.scrollHeight - 2),
    footerHeight: document.querySelector('.nftw-footer')?.getBoundingClientRect().height,
    hasCurtain: !!document.getElementById('nftw-curtain'),
    hasBrand: !!document.querySelector('.nftw-brand-center'),
    cosmosBackground: getComputedStyle(document.querySelector('.nftw-cosmos')).background,
  }));
  console.log('INFO:', JSON.stringify(info, null, 2));

  const footerHandle = await page.$('.nftw-footer');
  await footerHandle.screenshot({ path: '/tmp/nftw2-00-rest.png' });
  console.log('Captured: rest state');

  // Wait for armed state (setInterval arms after 180ms quiet)
  await new Promise((r) => setTimeout(r, 220));

  // Fire wheel down to trigger peek
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  });

  const checkpoints = [100, 300, 550, 800, 1100, 1500, 2000];
  let prev = 0;
  for (let i = 0; i < checkpoints.length; i++) {
    await new Promise((r) => setTimeout(r, checkpoints[i] - prev));
    prev = checkpoints[i];
    await footerHandle.screenshot({
      path: `/tmp/nftw2-${String(i + 1).padStart(2, '0')}-t${checkpoints[i]}.png`,
    });
    console.log(`Captured: t${checkpoints[i]}ms`);
  }

  const statePeek = await page.evaluate(() => ({
    peeking: document.getElementById('nftw-curtain')?.classList.contains('nftw-peeking'),
    visible: document.querySelector('.nftw-brand-center')?.classList.contains('nftw-visible'),
    curtainClipPath: document.getElementById('nftw-curtain')?.style.clipPath || '(css class)',
  }));
  console.log('STATE PEEK:', JSON.stringify(statePeek));

  // Fire stretch (scroll down while peeked)
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 120));
  await footerHandle.screenshot({ path: '/tmp/nftw2-stretch-t120.png' });
  console.log('Captured: stretch peak');

  await new Promise((r) => setTimeout(r, 600));
  await footerHandle.screenshot({ path: '/tmp/nftw2-stretch-t720-spring.png' });
  console.log('Captured: spring-back settled');

  // Scroll up to close
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1300));
  await footerHandle.screenshot({ path: '/tmp/nftw2-99-closed.png' });

  const stateClose = await page.evaluate(() => ({
    peeking: document.getElementById('nftw-curtain')?.classList.contains('nftw-peeking'),
    visible: document.querySelector('.nftw-brand-center')?.classList.contains('nftw-visible'),
  }));
  console.log('STATE CLOSE:', JSON.stringify(stateClose));

  await browser.close();
  console.log('Done. Screenshots in /tmp/nftw2-*.png');
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
