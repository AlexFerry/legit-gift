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

// Lista de fontes para coleta de códigos
const SOURCES = [
  'https://lootbar.gg/blog/en/legend-of-mushroom-codes.html',
  'https://www.pockettactics.com/legend-of-mushroom/codes',
  'https://www.pocketgamer.com/legend-of-mushroom/codes/',
  'https://theriagames.com/guide/legend-of-mushroom-codes/',
  'https://www.facebook.com/legendofmushroom/'
];

// Regex para extrair códigos alfanuméricos (3-20 caracteres)
const CODE_REGEX = /\b[A-Z0-9]{3,20}\b/g;

/**
 * Faz requisição HTTP para uma URL com timeout e user-agent
 */
async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Erro ao buscar ${url}:`, error.message);
    return null;
  }
}

/**
 * Extrai texto limpo de HTML usando cheerio
 */
function extractText(html) {
  const $ = cheerio.load(html);
  // Remove scripts e styles
  $('script').remove();
  $('style').remove();
  // Extrai texto
  return $.text();
}

/**
 * Extrai códigos do texto usando regex
 */
function extractCodes(text) {
  const codes = new Set();
  const matches = text.match(CODE_REGEX);
  
  if (matches) {
    matches.forEach(code => {
      // Filtros para evitar falsos positivos
      if (!isCommonWord(code)) {
        codes.add(code);
      }
    });
  }
  
  return Array.from(codes);
}

/**
 * Verifica se a string é uma palavra comum (para evitar falsos positivos)
 */
function isCommonWord(str) {
  const commonWords = [
    'LEGEND', 'MUSHROOM', 'GAME', 'PLAY', 'CODE', 'GIFT', 'REWARD',
    'CLICK', 'HERE', 'LINK', 'FOLLOW', 'SUBSCRIBE', 'LIKE', 'SHARE',
    'DOWNLOAD', 'INSTALL', 'UPDATE', 'VERSION', 'LEVEL', 'QUEST',
    'ITEM', 'WEAPON', 'ARMOR', 'SKILL', 'SPELL', 'MAGIC', 'ATTACK',
    'DEFENSE', 'HEALTH', 'MANA', 'EXPERIENCE', 'GOLD', 'SILVER',
    'BRONZE', 'DIAMOND', 'RUBY', 'EMERALD', 'SAPPHIRE', 'CRYSTAL',
    'STONE', 'WOOD', 'METAL', 'FIRE', 'WATER', 'EARTH', 'AIR',
    'WIND', 'THUNDER', 'LIGHT', 'DARK', 'HOLY', 'EVIL', 'GOOD',
    'BAD', 'STRONG', 'WEAK', 'FAST', 'SLOW', 'BIG', 'SMALL'
  ];
  return commonWords.includes(str.toUpperCase());
}

/**
 * Carrega códigos existentes do arquivo JSON
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
 * Salva códigos no arquivo JSON
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
 * Coleta códigos de todas as fontes
 */
async function collectCodes() {
  console.log('🔄 Iniciando coleta de códigos...\n');
  
  const allCodes = {};
  
  for (const source of SOURCES) {
    console.log(`📍 Processando: ${source}`);
    
    const html = await fetchPage(source);
    if (!html) continue;
    
    const text = extractText(html);
    const codes = extractCodes(text);
    
    console.log(`   Encontrados ${codes.length} códigos potenciais`);
    
    codes.forEach(code => {
      allCodes[code] = source;
    });
  }
  
  return allCodes;
}

/**
 * Compara códigos encontrados com os já armazenados
 */
function findNewCodes(foundCodes, existingCodes) {
  const newCodes = [];
  
  Object.keys(foundCodes).forEach(code => {
    if (!existingCodes[code]) {
      newCodes.push(code);
    } else {
      // Atualizar last_seen se o código já existe
      existingCodes[code].last_seen = new Date().toISOString();
      
      // Adicionar fonte se não estiver na lista
      const source = foundCodes[code];
      if (!existingCodes[code].sources.includes(source)) {
        existingCodes[code].sources.push(source);
      }
    }
  });
  
  return newCodes;
}

/**
 * Adiciona novos códigos ao objeto de códigos
 */
function addNewCodes(newCodes, foundCodes, existingCodes) {
  const now = new Date().toISOString();
  
  newCodes.forEach(code => {
    existingCodes[code] = {
      code: code,
      sources: [foundCodes[code]],
      first_seen: now,
      last_seen: now
    };
  });
  
  return existingCodes;
}

/**
 * Envia notificação para Discord via webhook
 */
async function notifyDiscord(newCodes) {
  if (!DISCORD_WEBHOOK) {
    console.log('⚠️  DISCORD_WEBHOOK não configurado, pulando notificação');
    return;
  }
  
  if (newCodes.length === 0) {
    console.log('ℹ️  Nenhum código novo para notificar');
    return;
  }
  
  try {
    const message = `🎁 **Novos Códigos Encontrados!**\n\n${newCodes.join(', ')}`;
    
    await axios.post(DISCORD_WEBHOOK, {
      content: message
    });
    
    console.log(`✅ Notificação enviada para Discord (${newCodes.length} código(s) novo(s))`);
  } catch (error) {
    console.error('❌ Erro ao enviar notificação para Discord:', error.message);
  }
}

/**
 * Função principal
 */
async function main() {
  try {
    // Carregar códigos existentes
    const existingCodes = await loadCodes();
    console.log(`📦 Códigos já armazenados: ${Object.keys(existingCodes).length}\n`);
    
    // Coletar novos códigos
    const foundCodes = await collectCodes();
    console.log(`\n🔍 Total de códigos encontrados nesta execução: ${Object.keys(foundCodes).length}\n`);
    
    // Encontrar novos códigos
    const newCodes = findNewCodes(foundCodes, existingCodes);
    console.log(`✨ Códigos novos: ${newCodes.length}`);
    
    if (newCodes.length > 0) {
      console.log(`   Novos: ${newCodes.join(', ')}\n`);
      
      // Adicionar novos códigos
      const updatedCodes = addNewCodes(newCodes, foundCodes, existingCodes);
      
      // Salvar
      await saveCodes(updatedCodes);
      
      // Notificar Discord
      await notifyDiscord(newCodes);
    } else {
      console.log('   Nenhum código novo encontrado\n');
    }
    
    console.log('✅ Coleta concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante a execução:', error.message);
    process.exit(1);
  }
}

// Executar
main();

