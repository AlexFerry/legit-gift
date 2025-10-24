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
    console.error(`❌ Erro ao buscar ${url}:`, error.message);
    return null;
  }
}

/**
 * Extrai apenas os códigos da seção "Working Legend of Mushroom codes"
 */
function extractWorkingCodes(html) {
  const $ = cheerio.load(html);
  const codes = new Set();

  // Encontrar o cabeçalho "Working Legend of Mushroom codes"
  const workingHeader = $('h2, h3')
    .filter((i, el) => $(el).text().toLowerCase().includes('working legend of mushroom codes'))
    .first();

  if (!workingHeader.length) {
    console.warn('⚠️ Não encontrado cabeçalho Working no HTML');
    return [];
  }

  // Percorrer seus elementos irmãos até o cabeçalho "Expired"
  let current = workingHeader.next();
  while (current.length) {
    const text = current.text().toLowerCase().trim();

    // Se encontrou "Expired", parar a leitura
    if (text.includes('expired legend of mushroom codes')) break;

    // Buscar os possíveis códigos
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

    current = current.next();
  }

  return Array.from(codes);
}

/**
 * Carrega códigos existentes
 */
async function loadCodes() {
  try {
    if (await fs.pathExists(CODES_FILE)) {
      const data = await fs.readFile(CODES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('❌ Erro ao carregar codes.json:', error.message);
  }
  return {};
}

/**
 * Remove códigos que não estão mais ativos
 */
function removeExpiredCodes(foundCodes, existingCodes) {
  let removed = 0;
  for (const code in existingCodes) {
    if (!foundCodes.includes(code)) {
      delete existingCodes[code];
      removed++;
    }
  }
  return removed;
}

/**
 * Salva códigos
 */
async function saveCodes(codes) {
  try {
    await fs.writeFile(CODES_FILE, JSON.stringify(codes, null, 2));
    console.log('✅ codes.json atualizado');
  } catch (error) {
    console.error('❌ Erro ao salvar codes.json:', error.message);
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
    console.error('❌ Erro ao enviar webhook Discord:', e.message);
  }
}

/**
 * Função Principal
 */
async function main() {
  console.log('🔄 Coletando códigos ativos...');

  const html = await fetchPage(SOURCES[0]);
  if (!html) return;

  const workingCodes = extractWorkingCodes(html);
  console.log(`✅ Encontrados ${workingCodes.length} códigos ativos no site.`);

  let existingCodes = await loadCodes();
  console.log(`📦 Já armazenados: ${Object.keys(existingCodes).length}`);

  // Remover expirados
  const removedExpired = removeExpiredCodes(workingCodes, existingCodes);
  if (removedExpired > 0) {
    console.log(`🗑️ Removidos ${removedExpired} códigos expirados`);
  }

  // Adicionar novos
  const now = new Date().toISOString();
  const newCodes = [];
  workingCodes.forEach(code => {
    if (!existingCodes[code]) {
      existingCodes[code] = {
        code: code,
        sources: [SOURCES[0]],
        first_seen: now,
        last_seen: now
      };
      newCodes.push(code);
    } else {
      existingCodes[code].last_seen = now;
    }
  });

  if (newCodes.length > 0) {
    console.log(`✨ Novos códigos: ${newCodes.join(', ')}`);
    await notifyDiscord(newCodes);
  }

  await saveCodes(existingCodes);

  console.log('✅ Finalizado com sucesso!');
}

main();
