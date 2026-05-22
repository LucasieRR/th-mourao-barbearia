const puppeteer = require('puppeteer');

(async () => {
  // Usa Chrome real instalado no Mac
  const browser = await puppeteer.launch({ 
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 }
  });
  
  const page1 = await browser.newPage();
  const supaReqs1 = [];
  await page1.setRequestInterception(true);
  page1.on('request', req => {
    const url = req.url();
    if (url.includes('supabase.co') && !url.includes('cdn.jsdelivr')) {
      supaReqs1.push(`REQ ${req.method()} ${url.replace(/.*supabase\.co/, '').split('?')[0]}`);
    }
    req.continue();
  });
  page1.on('response', async res => {
    const url = res.url();
    if (url.includes('supabase.co') && !url.includes('cdn.jsdelivr')) {
      supaReqs1.push(`RES ${res.status()} ${url.replace(/.*supabase\.co/, '').split('?')[0]}`);
    }
  });
  page1.on('console', msg => {
    if (['log','error','warn'].includes(msg.type())) console.log(`[P1 ${msg.type()}] ${msg.text()}`);
  });

  console.log('=== Step 1: Login ===');
  await page1.goto('https://www.thmourao.com.br/minha-conta', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page1.type('#login-email', 'lucas.bnu@icloud.com');
  await page1.type('#login-password', 'Admin123@');
  await page1.click('#btn-login');
  await new Promise(r => setTimeout(r, 6000));
  
  const greeting1 = await page1.$eval('#greeting-name', el => el.textContent).catch(() => 'N/A');
  console.log('Saudação após login:', greeting1);
  console.log('Requests Step 1:', supaReqs1.join(' | '));

  console.log('\n=== Step 2: Navegar para index ===');
  await page1.evaluate(() => localStorage.setItem('th_nav_ts', Date.now()));
  supaReqs1.length = 0;
  await page1.goto('https://www.thmourao.com.br/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  console.log('\n=== Step 3: Voltar para minha-conta ===');
  await page1.evaluate(() => localStorage.setItem('th_nav_ts', Date.now()));
  supaReqs1.length = 0;
  await page1.goto('https://www.thmourao.com.br/minha-conta', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 8000));

  console.log('Requests Step 3:', supaReqs1.length ? supaReqs1.join('\n  ') : 'NENHUM');
  const greeting3 = await page1.$eval('#greeting-name', el => el.textContent).catch(() => 'N/A');
  const spinner3 = await page1.$eval('#appt-loading', el => el.style.display).catch(() => 'N/A');
  const portal3 = await page1.$eval('#portal', el => el.classList.contains('show')).catch(() => false);
  console.log('Saudação:', greeting3);
  console.log('Spinner:', JSON.stringify(spinner3));
  console.log('Portal:', portal3);

  await new Promise(r => setTimeout(r, 3000)); // deixa ver no browser
  await browser.close();
})();
