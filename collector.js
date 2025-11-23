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
  'https://www.vg247.com/legend-of-mushroom-codes'
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
 * Extrai apenas os códigos da seção "Working Legend of Mushroom codes"
 */
function extractWorkingCodes(html, url = '') {
  const $ = cheerio.load(html);
  const codes = new Set();

  const workingHeader = $('h2, h3')
    .filter((i, el) => $(el).text().toLowerCase().includes('working legend of mushroom codes'))
    .first();

  if (!workingHeader.length) {
    // fallback: try headers contendo "working" and "codes"
    const altHeader = $('h2, h3')
      .filter((i, el) => {
        const t = $(el).text().toLowerCase();
        return t.includes('working') && t.includes('codes');
      })
      .first();
    if (!altHeader.length) {
      console.warn('⚠️ Working header not found in HTML');
      return [];
    }
  }

  const header = workingHeader.length ? workingHeader : $('h2, h3')
    .filter((i, el) => {
      const t = $(el).text().toLowerCase();
      return t.includes('working') && t.includes('codes');
    })
    .first();

  let current = header.next();
  while (current.length) {
    const text = current.text().toLowerCase().trim();
    if (text.includes('expired legend of mushroom codes') || text.includes('expired')) break;

    current.find('strong, li, p, code').each((i, elem) => {
      const raw = $(elem).text().trim();
      const cleaned = raw.split(':')[0]
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '')
        .replace(/^\./, '')
        .replace(/\.$/, '');

      if (cleaned && /^[a-z0-9.]{3,20}$/.test(cleaned)) {
        codes.add(cleaned);
      }
    });

    // também validar tokens diretos (fallback)
    const direct = current.text().split(/\s+/).map(s => s.trim()).filter(Boolean);
    direct.forEach(token => {
      const cleaned = token.split(':')[0]
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '')
        .replace(/^\./, '')
        .replace(/\.$/, '');
      if (cleaned && /^[a-z0-9.]{3,20}$/.test(cleaned)) {
        codes.add(cleaned);
      }
    });

    current = current.next();
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
    const code = argv[1].toLowerCase().replace(/[^a-z0-9.]/g, '');
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
    const code = argv[1].toLowerCase().replace(/[^a-z0-9.]/g, '');
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
    const code = argv[1].toLowerCase().replace(/[^a-z0-9.]/g, '');
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

  const aggregated = new Map(); // code -> { code, sources: Set(), first_seen, last_seen }

  // load existing codes
  const existingCodesRaw = await loadJsonSafe(CODES_FILE, {});
  const now = new Date().toISOString();

  // seed aggregated from existing codes (so we preserve first_seen)
  for (const [code, meta] of Object.entries(existingCodesRaw)) {
    aggregated.set(code, {
      code,
      sources: new Set(meta.sources || []),
      first_seen: meta.first_seen || now,
      last_seen: meta.last_seen || now
    });
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
      if (!aggregated.has(code)) {
        aggregated.set(code, {
          code,
          sources: new Set([src]),
          first_seen: now,
          last_seen: now
        });
      } else {
        const entry = aggregated.get(code);
        entry.sources.add(src);
        entry.last_seen = now;
      }
    }
  }

  // Load manual additions and add them (source = manual)
  const manual = await loadJsonSafe(MANUAL_FILE, []);
  const manualSet = new Set(); // Keep track of manual codes to prevent blocking

  if (manual.length > 0) {
    console.log(`📝 Applying ${manual.length} manual additions`);
    for (const code of manual) {
      const cleaned = code.toLowerCase().replace(/[^a-z0-9.]/g, '');
      manualSet.add(cleaned);

      if (!aggregated.has(cleaned)) {
        aggregated.set(cleaned, {
          code: cleaned,
          sources: new Set(['manual']),
          first_seen: now,
          last_seen: now
        });
      } else {
        aggregated.get(cleaned).sources.add('manual');
        aggregated.get(cleaned).last_seen = now;
      }
    }
  }

  // Load blocked list and ensure they are removed/not added
  const blocked = await loadJsonSafe(BLOCKED_FILE, []);
  if (blocked.length > 0) {
    console.log(`⛔ Enforcing ${blocked.length} blocked codes`);
    for (const b of blocked) {
      const cleaned = b.toLowerCase().replace(/[^a-z0-9.]/g, '');

      // Skip blocking if the code is in the manual list
      if (manualSet.has(cleaned)) {
        continue;
      }

      if (aggregated.has(cleaned)) {
        aggregated.delete(cleaned);
      }
      // also remove from existingCodesRaw so save doesn't reintroduce them
      if (existingCodesRaw[cleaned]) {
        delete existingCodesRaw[cleaned];
      }
    }
  }

  // Compare with existingCodesRaw to figure out new ones and removed ones
  const aggregatedCodes = Array.from(aggregated.keys());
  const existingCodesKeys = Object.keys(existingCodesRaw);

  // removed = existing - aggregated
  const removed = existingCodesKeys.filter(c => !aggregated.has(c));
  removed.forEach(c => delete existingCodesRaw[c]);

  if (removed.length > 0) {
    console.log(`🗑️ Removed ${removed.length} expired/absent codes: ${removed.join(', ')}`);
  }

  // Determine newly discovered codes (not present in existingCodesRaw)
  const newCodes = [];
  for (const [code, meta] of aggregated.entries()) {
    if (!existingCodesRaw[code]) {
      // convert sources set to array unique
      existingCodesRaw[code] = {
        code,
        sources: Array.from(meta.sources),
        first_seen: meta.first_seen,
        last_seen: meta.last_seen
      };
      newCodes.push(code);
    } else {
      // update last_seen and sources (merge unique)
      existingCodesRaw[code].last_seen = meta.last_seen || now;
      const mergedSources = new Set([...(existingCodesRaw[code].sources || []), ...meta.sources]);
      existingCodesRaw[code].sources = Array.from(mergedSources);
    }
  }

  if (newCodes.length > 0) {
    console.log(`✨ New codes found: ${newCodes.join(', ')}`);
    await notifyDiscord(newCodes);
  } else {
    console.log('ℹ️ No new codes found this run.');
  }

  // Finally persist
  await saveJsonSafe(CODES_FILE, existingCodesRaw);
  console.log('✅ codes.json updated');
  console.log('✅ Done.');
}

main().catch(err => {
  console.error('❌ Unexpected error in main():', err);
  process.exit(1);
});
