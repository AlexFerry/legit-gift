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
  'https://theriagames.com/guide/legend-of-mushroom-codes/'
];



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
 * Limpa o texto removendo espaços em branco extras e caracteres especiais
 */
function cleanText(text) {
  // Remove &nbsp; e outros caracteres especiais HTML
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Extrai códigos de um texto bruto
 * Remove tudo que está entre parênteses e após hífens
 */
function extractCodesFromText(text) {
  const codes = new Set();
  
  // Dividir por quebras de linha ou pontos para processar cada possível código
  const lines = text.split(/[\n,;]/);
  
  lines.forEach(line => {
    line = cleanText(line);
    
    if (!line) return;
    
    // Remover tudo que está entre parênteses (expires, new!, etc)
    line = line.replace(/\s*\([^)]*\)/g, '');
    
    // Remover tudo que vem após um hífen (descrição de recompensas)
    line = line.split('-')[0];
    
    // Limpar novamente
    line = cleanText(line);
    
    // Validar se é um código válido
    if (isValidCode(line)) {
      codes.add(line);
    }
  });
  
  return Array.from(codes);
}

/**
 * Verifica se uma string é um código válido
 * Deve ser alfanumérico, 3-20 caracteres, e não ser uma palavra comum
 */
function isValidCode(str) {
  // Deve ter entre 3 e 20 caracteres
  if (str.length < 3 || str.length > 20) {
    return false;
  }
  
  // Deve ser alfanumérico (letras e números apenas)
  if (!/^[A-Za-z0-9]+$/.test(str)) {
    return false;
  }
  
  // Não deve ser uma palavra comum (para evitar falsos positivos)
  if (isCommonWord(str)) {
    return false;
  }
  
  return true;
}

/**
 * Extrai códigos de uma página HTML
 * Procura por padrões em <strong>, <li>, <code>, etc.
 */
function extractCodesFromHTML(html) {
  const $ = cheerio.load(html);
  const codes = new Set();
  
  // Estratégia 1: Extrair de tags <strong> dentro de <li> (comum em listas de códigos)
  $('li strong').each((i, elem) => {
    const text = $(elem).text();
    const extracted = extractCodesFromText(text);
    extracted.forEach(code => codes.add(code));
  });
  
  // Estratégia 2: Extrair de tags <code>
  $('code').each((i, elem) => {
    const text = $(elem).text();
    const extracted = extractCodesFromText(text);
    extracted.forEach(code => codes.add(code));
  });
  
  // Estratégia 3: Extrair de qualquer <li> que contenha um padrão de código
  $('li').each((i, elem) => {
    const text = $(elem).text();
    const extracted = extractCodesFromText(text);
    extracted.forEach(code => codes.add(code));
  });
  
  // Estratégia 4: Se nenhum código foi encontrado, tenta extração genérica do texto
  if (codes.size === 0) {
    const text = $('body').text();
    const extracted = extractCodesFromText(text);
    extracted.forEach(code => codes.add(code));
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
    'BAD', 'STRONG', 'WEAK', 'FAST', 'SLOW', 'BIG', 'SMALL',
    'THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'HAVE',
    'WILL', 'YOUR', 'MORE', 'WHEN', 'WHICH', 'THEIR', 'ABOUT',
    'ALSO', 'BEEN', 'BOTH', 'EACH', 'EVEN', 'FIND', 'FIRST', 'FOUND',
    'GIVE', 'GOES', 'HAND', 'HIGH', 'HOME', 'JUST', 'KNOW', 'LAST',
    'LIFE', 'LONG', 'LOOK', 'MADE', 'MAKE', 'MANY', 'MOST', 'MUCH',
    'MUST', 'NAME', 'NEED', 'NEXT', 'ONLY', 'OPEN', 'OVER', 'PART',
    'SAME', 'SUCH', 'TAKE', 'THAN', 'THEM', 'THEN', 'THEY', 'TIME',
    'VERY', 'WANT', 'WHAT', 'WORK', 'YEAR', 'TWITTER', 'FACEBOOK',
    'DISCORD', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK', 'BLUESKY', 'REDDIT',
    'TWITCH', 'STEAM', 'APPLE', 'ANDROID', 'BLOG', 'FAQ', 'NEWS',
    'ABOUT', 'CONTACT', 'CAREERS', 'SUPPORT', 'ACCOUNT', 'LOGIN',
    'SIGNUP', 'MENU', 'SEARCH', 'OVERVIEW', 'GUIDE', 'TUTORIAL',
    'HELP', 'SETTINGS', 'YES', 'NO', 'OK', 'NULL', 'FALSE', 'TRUE',
    'UNDEFINED', 'NEWSLETTER', 'PRIVACY', 'TERMS', 'SUSTAINABILITY',
    'LEAKS', 'COMMON', 'ACHIEVEMENTS', 'COMPANION', 'MOUNT', 'PRAYER',
    'RELIC', 'TECH', 'ARCHER', 'MAGE', 'WARRIOR', 'AVIAN', 'AWAKENING',
    'BREEDING', 'FAMILY', 'PALS', 'RUNESTONES', 'SHOP', 'SHOWDOWN',
    'SKILLS', 'SPORES', 'DUNGEON', 'CALENDARS', 'EVENT', 'CALCULATORS',
    'ARTIFACT', 'FEATHER', 'GEAR', 'TOOLS', 'GAMEKNOT'
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
    
    const codes = extractCodesFromHTML(html);
    
    if (codes.length > 0) {
      console.log(`   Encontrados ${codes.length} códigos potenciais`);
    } else {
      console.log(`   Nenhum código encontrado`);
    }
    
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

