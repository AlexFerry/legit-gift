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

// Lista de fontes para coleta de códigos (Facebook e Theriagames removidos)
const SOURCES = [
  'https://lootbar.gg/blog/en/legend-of-mushroom-codes.html',
  'https://www.pockettactics.com/legend-of-mushroom/codes',
  'https://www.pocketgamer.com/legend-of-mushroom/codes/',
];

/**
 * Verifica se a string é uma palavra comum (para evitar falsos positivos )
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
    'CONTACT', 'CAREERS', 'SUPPORT', 'ACCOUNT', 'LOGIN',
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
 * Verifica se uma string é um código válido
 * Critérios: 3-20 caracteres, alfanumérico, não pode ser apenas números, e não pode ser palavra comum.
 */
function isValidCode(str) {
  // Não deve ser composto apenas por dígitos (para evitar anos, números de versão, etc.)
  if (/^\d+$/.test(str)) {
    return false;
  }
  
  // Deve ter entre 3 e 20 caracteres
  if (str.length < 3 || str.length > 20) {
    return false;
  }
  
  // Deve ser alfanumérico
  if (!/^[A-Za-z0-9]+$/.test(str)) {
    return false;
  }
  
  // Não deve ser uma palavra comum
  if (isCommonWord(str)) {
    return false;
  }
  
  return true;
}


/**
 * Faz requisição HTTP para uma URL com timeout e user-agent
 */
async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Erro ao buscar ${url}:`, error.message);
    return null;
  }
}

/**
 * Extrai códigos de uma página HTML
 * Remove textos entre parênteses e hífens antes de aplicar a regex.
 */
function extractCodesFromHTML(html) {
  const $ = cheerio.load(html);
  const codes = new Set();

  // Estratégia: Iterar sobre elementos que comumente contêm códigos
  $('li, strong, code, div, p').each((i, elem) => {
    const text = $(elem).text();
    
    // Remove textos entre parênteses e após hífens
    const cleanedText = text
      .replace(/\s*\([^)]*\)/g, '')
      .split('-')[0]
      .trim();

    // Extrai possíveis códigos do texto limpo (alfanuméricos 3-20 chars)
    const potentialCodes = cleanedText.match(/\b[A-Z0-9]{3,20}\b/g) || [];

    potentialCodes.forEach(code => {
      if (isValidCode(code)) {
        codes.add(code);
      }
    });
  });

  return Array.from(codes);
}

/**
 * Carrega códigos existentes do arquivo JSON
 */
async function loadCodes() {
  try {
    if (await fs.pathExists(CODES_FILE)) {
      const data = await fs.readFile(CODES_FILE, 'utf8');
      return JSON.parse(data) || {};
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
  console.log('🔄 Iniciando coleta de códigos...\n');

  const existingCodes = await loadCodes();
  console.log(`📦 Códigos já armazenados: ${Object.keys(existingCodes).length}\n`);

  // Usamos um Map para garantir que não haja duplicatas de códigos encontrados em diferentes tags da mesma página
  const allFoundCodes = new Map();

  for (const source of SOURCES) {
    console.log(`📍 Processando: ${source}`);
    
    const html = await fetchPage(source);
    if (!html) continue;
    
    const codes = extractCodesFromHTML(html);
    console.log(`   Encontrados ${codes.length} códigos válidos`);

    codes.forEach(code => {
      if (!allFoundCodes.has(code)) {
        allFoundCodes.set(code, source);
      }
    });
  }

  const newCodes = [];
  const now = new Date().toISOString();

  for (const [code, source] of allFoundCodes) {
    if (!existingCodes[code]) {
      newCodes.push(code);
      existingCodes[code] = {
        code: code,
        sources: [source],
        first_seen: now,
        last_seen: now
      };
    } else {
      // Atualiza o last_seen para códigos já existentes
      existingCodes[code].last_seen = now;
      // Adiciona a nova fonte se o código foi encontrado em um novo lugar
      if (!existingCodes[code].sources.includes(source)) {
        existingCodes[code].sources.push(source);
      }
    }
  }
  
  console.log(`\n✨ Total de códigos novos encontrados: ${newCodes.length}`);

  if (newCodes.length > 0) {
    console.log(`   Novos: ${newCodes.join(', ')}\n`);
  }

  // Salva o arquivo de códigos (mesmo que não haja novos, para atualizar o last_seen)
  await saveCodes(existingCodes);
  
  // Notifica apenas se houver códigos novos
  await notifyDiscord(newCodes);

  console.log('\n✅ Coleta concluída com sucesso!');
}

// Executar
main().catch(error => {
  console.error('❌ Erro fatal durante a execução:', error.message);
  process.exit(1);
});
