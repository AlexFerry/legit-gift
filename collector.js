import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Carregar variáveis de ambiente
dotenv.config();

// Configurações
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CODES_FILE = path.join(__dirname, 'codes.json');
const MANUAL_FILE = path.join(__dirname, 'manual.json');
const BLOCKED_FILE = path.join(__dirname, 'blocked.json');
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

// Source única
const SOURCES = [
  'https://www.destructoid.com/legend-of-mushroom-codes/'
];

/**
 * Requisição HTTP com timeout e user-agent
 */
async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119 Safari/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    return null;
  }
}

/**
 * Extrai os códigos da lista <ul class="wp-block-list"><li><strong>CODE</strong>—Redeem...</li></ul>
 * Preserva o case original do código (ex: "DealSealed").
 */
function extractWorkingCodes(html, url = '') {
  const $ = cheerio.load(html);
  const codes = new Set();

  $('ul.wp-block-list li').each((i, el) => {
    // pega o texto do primeiro <strong> (funciona mesmo com <strong><strong>CODE</strong></strong>)
    const strongText = $(el).find('strong').first().text().trim();
    if (!strongText) return;

    // remove qualquer caractere que não seja letra ou número, preservando o case original
    const cleaned = strongText.replace(/[^a-zA-Z0-9]/g, '');

    if (cleaned && cleaned.length >= 3 && cleaned.length <= 20) {
      codes.add(cleaned);
    }
  });

  if (codes.size === 0) {
    console.warn('⚠️ Nenhum código encontrado em ul.wp-block-list');
  }

  return Array.from(codes);
}

/**
 * Utility to load JSON safe
 */
async function loadJsonSafe(filePath, defaultValue) {
  try {
    if (await fs.pathExists(filePath)) {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`❌ Error reading ${filePath}:`, err.message);
  }
  return defaultValue;
}

/**
 * Salva JSON seguro
 */
async function saveJsonSafe(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`❌ Error writing ${filePath}:`, err.message);
  }
}

/**
 * Notifica via Discord
 */
async function notifyDiscord(newCodes) {
  if (!DISCORD_WEBHOOK || newCodes.length === 0) return;
  try {
    const msg = `🎁 **Novos Códigos Ativos Detectados**\n\n${newCodes.join(', ')}`;
    await axios.post(DISCORD_WEBHOOK, { content: msg });
  } catch (e) {
    console.error('❌ Error sending Discord webhook:', e.message);
  }
}

/**
 * CLI helpers: --add <code>, --block <code>, --unblock <code>, --list-blocked, --list-manual
 */
async function handleCli() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) return false; // no CLI action, continue normal scraping

  const cmd = argv[0];
  if (cmd === '--add' && argv[1]) {
    const code = argv[1].replace(/[^a-zA-Z0-9]/g, '');
    const manual = await loadJsonSafe(MANUAL_FILE, []);
    if (!manual.includes(code)) {
      manual.push(code);
      await saveJsonSafe(MANUAL_FILE, manual);
      console.log(`✅ Manually added code: ${code}`);
    } else {
      console.log(`ℹ️ Code already in manual list: ${code}`);
    }
    return true;
  }

  if (cmd === '--block' && argv[1]) {
    const code = argv[1].replace(/[^a-zA-Z0-9]/g, '');
    const blocked = await loadJsonSafe(BLOCKED_FILE, []);
    if (!blocked.includes(code)) {
      blocked.push(code);
      await saveJsonSafe(BLOCKED_FILE, blocked);
      console.log(`⛔ Blocked code: ${code}`);
    } else {
      console.log(`ℹ️ Code already blocked: ${code}`);
    }
    return true;
  }

  if (cmd === '--unblock' && argv[1]) {
    const code = argv[1].replace(/[^a-zA-Z0-9]/g, '');
    let blocked = await loadJsonSafe(BLOCKED_FILE, []);
    blocked = blocked.filter(c => c !== code);
    await saveJsonSafe(BLOCKED_FILE, blocked);
    console.log(`✅ Unblocked code: ${code}`);
    return true;
  }

  if (cmd === '--list-blocked') {
    const blocked = await loadJsonSafe(BLOCKED_FILE, []);
    console.log('Blocked codes:', blocked.join(', ') || '(none)');
    return true;
  }

  if (cmd === '--list-manual') {
    const manual = await loadJsonSafe(MANUAL_FILE, []);
    console.log('Manual additions:', manual.join(', ') || '(none)');
    return true;
  }

  console.log('Unknown CLI command. Supported: --add <code>, --block <code>, --unblock <code>, --list-blocked, --list-manual');
  return true;
}

/**
 * Função Principal
 */
async function main() {
  // If CLI action provided, perform and exit
  const cliHandled = await handleCli();
  if (cliHandled) return;

  console.log('🔄 Collecting active codes from all configured sources...');

  const aggregated = new Set();

  // load existing codes (formato: { "CODE": { "code": "CODE" } })
  const existingCodesRaw = await loadJsonSafe(CODES_FILE, {});

  // seed aggregated from existing codes
  for (const code of Object.keys(existingCodesRaw)) {
    aggregated.add(code);
  }

  // Scrape each source sequentially (could be parallelized if desired)
  for (const src of SOURCES) {
    console.log(`🔗 Fetching ${src} ...`);
    const html = await fetchPage(src);
    if (!html) {
      console.warn(`⚠️ Skipped source ${src} due to fetch error.`);
      continue;
    }
    const codesFromPage = extractWorkingCodes(html);
    console.log(`  → Found ${codesFromPage.length} codes on ${src}`);

    for (const code of codesFromPage) {
      aggregated.add(code);
    }
  }

  // Load manual additions and add them
  const manual = await loadJsonSafe(MANUAL_FILE, []);
  const manualSet = new Set();

  if (manual.length > 0) {
    console.log(`📝 Applying ${manual.length} manual additions`);
    for (const code of manual) {
      const cleaned = code.replace(/[^a-zA-Z0-9]/g, '');
      manualSet.add(cleaned);
      aggregated.add(cleaned);
    }
  }

  // Load blocked list and ensure they are removed/not added
  const blocked = await loadJsonSafe(BLOCKED_FILE, []);
  if (blocked.length > 0) {
    console.log(`⛔ Enforcing ${blocked.length} blocked codes`);
    for (const b of blocked) {
      const cleaned = b.replace(/[^a-zA-Z0-9]/g, '');

      // Skip blocking if the code is in the manual list
      if (manualSet.has(cleaned)) continue;

      aggregated.delete(cleaned);
    }
  }

  // Determine new vs removed codes vs existing
  const existingCodesKeys = Object.keys(existingCodesRaw);
  const removed = existingCodesKeys.filter(c => !aggregated.has(c));
  const newCodes = Array.from(aggregated).filter(c => !existingCodesRaw[c]);

  if (removed.length > 0) {
    console.log(`🗑️ Removed ${removed.length} expired/absent codes: ${removed.join(', ')}`);
  }

  if (newCodes.length > 0) {
    console.log(`✨ New codes found: ${newCodes.join(', ')}`);
    await notifyDiscord(newCodes);
  } else {
    console.log('ℹ️ No new codes found this run.');
  }

  // Monta o objeto final no formato simplificado: { "CODE": { "code": "CODE" } }
  const finalCodes = {};
  for (const code of aggregated) {
    finalCodes[code] = { code };
  }

  // Finally persist
  await saveJsonSafe(CODES_FILE, finalCodes);
  console.log('✅ codes.json updated');
  console.log('✅ Done.');
}

main().catch(err => {
  console.error('❌ Unexpected error in main():', err);
  process.exit(1);
});
