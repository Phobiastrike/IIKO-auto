// main.js (с добавленным отчетом по складам)
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

let mainWindow = null;
let formWindow = null;

let sessionKey = null;
let baseUrl = null;
let storesCache = null;
let accountsCache = null;
let conceptionsCache = null;

let logDir = null;
let logFile = null;

function initializeLogging() {
  try {
    const userDataPath = app.getPath('userData');
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear().toString().slice(-2)}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
    
    logDir = path.join(userDataPath, 'logs', `${dateStr} ${timeStr}`);
    logFile = path.join(logDir, 'olap.log');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    log('========================================', 'system');
    log('Application started', 'system');
    log(`Log file: ${logFile}`, 'system');
    log('========================================', 'system');
  } catch (error) {
    console.error('Failed to initialize logging:', error);
    logFile = path.join(__dirname, 'olap.log');
  }
}

function log(message, category = 'app') {
  const timestamp = new Date().toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const logMessage = `[${timestamp}] ${category.toUpperCase()}: ${message}\n`;
  
  try {
    if (logFile) {
      fs.appendFileSync(logFile, logMessage, 'utf8');
    }
  } catch (error) {
    console.error('Failed to write log:', error);
  }
  
  console.log(logMessage.trim());
}

// ========================================
// IPC HANDLERS
// ========================================

ipcMain.handle('login', async (event, { server, login, password }) => {
  baseUrl = server.trim();
  const result = await authenticate(login.trim(), password.trim());
  return result;
});

ipcMain.handle('get-olap-data', async (event, params) => {
  const reportData = await olapRequest(params.reportType, params.dateFrom, params.dateTo);
  return reportData;
});

ipcMain.handle('load-config', async () => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return { ok: true, config: JSON.parse(configData) };
    }
    return { ok: false, error: 'Конфиг не найден' };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// ========================================
// AUTHENTICATION
// ========================================

async function authenticate(login, password) {
  if (!baseUrl) return { ok: false, error: 'Сервер не указан' };
  
  try {
    log('AUTH START', 'auth');
    
    const passToSend = password.includes('sha1:') ? 
        password.replace('sha1:', '').trim() : crypto.createHash('sha1').update(password).digest('hex');
    
    const authUrl = `${baseUrl}/api/v2/auth?login=${login}&pass=${passToSend}`;
    log(`AUTH TRY GET ${authUrl}`, 'auth');
    
    const response = await axios.get(authUrl, { timeout: 15000 });
    
    if (response.status === 200 && response.data) {
      sessionKey = response.data;
      log(`AUTH OK, key=${sessionKey.slice(0, 6)}...`, 'auth');
      
      await loadDictionaries();
      
      return { ok: true, sessionKey };
    }
    
    return { ok: false, error: 'Неверный ответ сервера' };
  } catch (error) {
    log(`AUTH ERROR: ${error.message}`, 'auth');
    return { ok: false, error: error.message };
  }
}

// ========================================
// LOAD DICTIONARIES
// ========================================

async function loadDictionaries() {
  log('========================================', 'dict');
  log('Loading dictionaries...', 'dict');
  
  // ========== STORES ==========
  try {
    log('Loading stores...', 'dict');
    storesCache = new Map();
    
    const storesEndpoints = [
      `${baseUrl}/api/corporation/stores?key=${sessionKey}`,
      `${baseUrl}/api/departments?key=${sessionKey}`,
      `${baseUrl}/api/v2/entities/departments/list?key=${sessionKey}`,
      `${baseUrl}/api/corporation/departments?key=${sessionKey}`
    ];
    
    let storesLoaded = false;
    for (const endpoint of storesEndpoints) {
      if (storesLoaded) break;
      
      try {
        log(`Trying: GET ${endpoint}`, 'dict');
        const response = await axios.get(endpoint, { 
          timeout: 15000,
          headers: { 'Accept': 'application/json, text/xml' }
        });
        
        let stores = [];
        
        if (Array.isArray(response.data)) {
          log(`Response is array, length: ${response.data.length}`, 'dict');
          stores = response.data;
        } 
        else if (response.data?.corporateItemDtos) {
          log(`Found corporateItemDtos`, 'dict');
          stores = response.data.corporateItemDtos.filter(item => item.type === 'STORE');
        } 
        else if (response.data?.departments) {
          log(`Found departments`, 'dict');
          stores = response.data.departments;
        }
        else if (typeof response.data === 'object' && response.data !== null) {
          log(`Response is object, searching for arrays...`, 'dict');
          for (const key in response.data) {
            if (Array.isArray(response.data[key]) && response.data[key].length > 0) {
              log(`Found array in key: ${key}, length: ${response.data[key].length}`, 'dict');
              stores = response.data[key];
              break;
            }
          }
        }
        
        log(`Processing ${stores.length} potential stores...`, 'dict');
        
        stores.forEach((store, idx) => {
          const possibleIds = [];
          if (store.id) possibleIds.push(store.id);
          if (store.uuid) possibleIds.push(store.uuid);
          if (store.departmentId) possibleIds.push(store.departmentId);
          if (store.storeId) possibleIds.push(store.storeId);
          
          const name = store.name || store.itemName || store.departmentName || store.storeName || '';
          
          if (possibleIds.length > 0 && name) {
            possibleIds.forEach(id => {
              storesCache.set(id, name);
              if (idx < 3) log(`Store cached: ${id} -> ${name}`, 'dict');
            });
            storesLoaded = true;
          }
        });
        
        if (storesCache.size > 0) {
          log(`✅ Successfully loaded stores from: ${endpoint}`, 'dict');
          break;
        }
      } catch (err) {
        log(`Endpoint failed: ${err.message}`, 'dict');
      }
    }
    
    log(`✅ Loaded ${storesCache.size} store mappings`, 'dict');
  } catch (error) {
    log(`⚠️ Failed to load stores: ${error.message}`, 'dict');
    storesCache = new Map();
  }
  
  // ========== ACCOUNTS ==========
  try {
    log('Loading accounts...', 'dict');
    accountsCache = new Map();
    
    const accountsEndpoints = [
      `${baseUrl}/api/v2/payments/paymentTypes?key=${sessionKey}`,
      `${baseUrl}/api/accounts?key=${sessionKey}`,
      `${baseUrl}/api/v2/entities/accounts/list?key=${sessionKey}`
    ];
    
    let accountsLoaded = false;
    for (const endpoint of accountsEndpoints) {
      if (accountsLoaded) break;
      
      try {
        const response = await axios.get(endpoint, { 
          timeout: 15000,
          headers: { 'Accept': 'application/json' }
        });
        
        let accounts = [];
        if (Array.isArray(response.data)) {
          accounts = response.data;
        } else if (response.data?.accounts) {
          accounts = response.data.accounts;
        } else if (response.data?.paymentTypes) {
          accounts = response.data.paymentTypes;
        }
        
        accounts.forEach(account => {
          const id = account.id || account.uuid || account.accountId;
          const name = account.name || account.paymentTypeName || account.accountName;
          if (id && name) {
            accountsCache.set(id, name);
            accountsLoaded = true;
          }
        });
        
        if (accountsCache.size > 0) break;
      } catch (err) {
        log(`Endpoint failed: ${err.message}`, 'dict');
      }
    }
    
    log(`✅ Loaded ${accountsCache.size} accounts`, 'dict');
  } catch (error) {
    log(`⚠️ Failed to load accounts: ${error.message}`, 'dict');
    accountsCache = new Map();
  }
  
  // ========== CONCEPTIONS ==========
  try {
    log('Loading conceptions...', 'dict');
    conceptionsCache = new Map();
    
    const conceptionsEndpoints = [
      `${baseUrl}/api/corporation/conceptions?key=${sessionKey}`,
      `${baseUrl}/api/conceptions?key=${sessionKey}`
    ];
    
    let conceptionsLoaded = false;
    for (const endpoint of conceptionsEndpoints) {
      if (conceptionsLoaded) break;
      
      try {
        const response = await axios.get(endpoint, { 
          timeout: 15000,
          headers: { 'Accept': 'application/json' }
        });
        
        let conceptions = [];
        if (Array.isArray(response.data)) {
          conceptions = response.data;
        } else if (response.data?.conceptions) {
          conceptions = response.data.conceptions;
        }
        
        conceptions.forEach(conception => {
          const id = conception.id || conception.uuid;
          const name = conception.name || conception.conceptionName;
          if (id && name) {
            conceptionsCache.set(id, name);
            conceptionsLoaded = true;
          }
        });
        
        if (conceptionsCache.size > 0) break;
      } catch (err) {
        log(`Endpoint failed: ${err.message}`, 'dict');
      }
    }
    
    log(`✅ Loaded ${conceptionsCache.size} conceptions`, 'dict');
  } catch (error) {
    log(`⚠️ Failed to load conceptions: ${error.message}`, 'dict');
    conceptionsCache = new Map();
  }
  
  // ========== PRODUCTS ==========
  try {
    log('Loading products...', 'dict');
    productsCache = new Map();
    
    const productsEndpoints = [
      `${baseUrl}/api/products?key=${sessionKey}`,
      `${baseUrl}/api/v2/entities/products/list?key=${sessionKey}`,
      `${baseUrl}/api/nomenclature?key=${sessionKey}`
    ];
    
    let productsLoaded = false;
    for (const endpoint of productsEndpoints) {
      if (productsLoaded) break;
      
      try {
        const response = await axios.get(endpoint, { 
          timeout: 30000,
          headers: { 'Accept': 'application/json' }
        });
        
        let products = [];
        if (Array.isArray(response.data)) {
          products = response.data;
        } else if (response.data?.products) {
          products = response.data.products;
        } else if (response.data?.nomenclature) {
          products = response.data.nomenclature;
        }
        
        products.forEach((product, index) => {
          const id = product.id || product.uuid || product.productId;
          const name = product.name || product.itemName || product.fullName || product.productName;
          if (id && name) {
            productsCache.set(id, name);
            productsLoaded = true;
          }
        });
        
        if (productsCache.size > 0) break;
      } catch (err) {
        log(`Endpoint failed: ${err.message}`, 'dict');
      }
    }
    
    log(`✅ Loaded ${productsCache.size} products`, 'dict');
  } catch (error) {
    log(`⚠️ Failed to load products: ${error.message}`, 'dict');
    productsCache = new Map();
  }
  
  log('========================================', 'dict');
}

// ========================================
// GET WRITEOFFS DOCUMENTS
// ========================================

async function getWriteOffsDocuments(dateFrom, dateTo) {
  if (!sessionKey || !baseUrl) return { ok: false, error: 'Не авторизован' };
  
  try {
    log('========================================', 'writeoffs');
    log('GET WRITE-OFFS START', 'writeoffs');
    
    const endpoint = `${baseUrl}/api/v2/documents/writeoff?key=${sessionKey}&dateFrom=${dateFrom}&dateTo=${dateTo}`;
    log(`Request: GET ${endpoint}`, 'writeoffs');
    
    const response = await axios.get(endpoint, { 
      timeout: 30000,
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response || response.status !== 200) {
      throw new Error(`Bad response: ${response ? response.status : 'no response'}`);
    }
    
    const documents = Array.isArray(response.data?.response) ? response.data.response : [];
    log(`✅ Found ${documents.length} writeoff documents`, 'writeoffs');
    
    const processedDocs = documents.map(doc => {
      const storeId = doc.storeId || '';
      let storeName = '';
      if (storeId) {
        storeName = storesCache?.get(storeId) || accountsCache?.get(storeId) || `[${storeId.slice(0, 8)}...]`;
      }
      
      const conceptionId = doc.conceptionId || '';
      let conceptionName = 'Без концепции';
      if (conceptionId) {
        conceptionName = conceptionsCache?.get(conceptionId) || `[${conceptionId.slice(0, 8)}...]`;
      }
      
      const accountId = doc.accountId || '';
      let accountName = '';
      if (accountId) {
        accountName = accountsCache?.get(accountId) || `[${accountId.slice(0, 8)}...]`;
      }
      
      let totalSum = 0;
      if (Array.isArray(doc.items)) {
        totalSum = doc.items.reduce((sum, item) => sum + parseFloat(item.cost || 0), 0);
      }
      
      const itemsText = doc.items ? doc.items.map(i => {
        const productId = i.productId;
        let productName = 'Товар';
        if (productId) {
          productName = productsCache?.get(productId) || i.productName || `[${productId.slice(0, 8)}...]`;
        }
        return productName;
      }).join(', ') : '';

      let docType = 'Акт списания';
      
      if (doc.type) {
        const typeMap = {
          'WRITEOFF_DOCUMENT': 'Акт списания',
          'OUTGOING_INVOICE': 'Расходная накладная', 
          'PRODUCTION_DOCUMENT': 'Акт производства',
          'INCOMING_INVOICE': 'Приходная накладная',
          'MOVEMENT_DOCUMENT': 'Акт перемещения',
          'SALES_DOCUMENT': 'Документ продажи',
          'RETURN_DOCUMENT': 'Документ возврата',
          'INVENTORY_DOCUMENT': 'Инвентаризация',
          'WRITE_OFF': 'Списание',
          'PURCHASE': 'Закупка',
          'SALES': 'Продажа',
          'INCOMING': 'Приход',
          'Р': 'Расход',
          'АЗ': 'Акт списания',
          'АП': 'Акт производства'
        };
        
        docType = typeMap[doc.type] || doc.type;
      }
      
      if (doc.externalOutgoingInvoiceId) {
        docType = 'Расходная накладная';
      } else if (doc.externalProductionDocumentId) {
        docType = 'Акт производства';
      } else if (doc.externalIncomingInvoiceId) {
        docType = 'Приходная накладная';
      }
      
      return {
        date: doc.dateIncoming || doc.date || '',
        type: docType,
        number: doc.documentNumber || '',
        items: itemsText,
        sum: totalSum,
        conducted: doc.status === 'PROCESSED' ? 'Да' : 'Нет',
        store: storeName,
        conception: conceptionName,
        comment: doc.comment || '',
        accountName: accountName
      };
    });
    
    processedDocs.sort((a, b) => {
      const accountA = (a.accountName || '').toLowerCase();
      const accountB = (b.accountName || '').toLowerCase();
      if (accountA < accountB) return -1;
      if (accountA > accountB) return 1;
      return 0;
    });
    
    log(`✅ Processed ${processedDocs.length} writeoff documents`, 'writeoffs');
    
    return { 
      ok: true, 
      reportName: 'Акты списания', 
      data: processedDocs, 
      meta: { 
        dateFrom, 
        dateTo, 
        source: '/api/v2/documents/writeoff', 
        rowCount: processedDocs.length,
        revision: response.data?.revision
      } 
    };
  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'writeoffs');
    return { 
      ok: true, 
      reportName: 'Акты списания', 
      data: [], 
      meta: { dateFrom, dateTo, source: 'ERROR', error: error.message } 
    };
  }
}

// ========================================
// OLAP REQUEST
// ========================================

async function olapRequest(reportType, dateFrom, dateTo) {
  log(`========================================`, 'olap');
  log(`OLAP REQUEST START`, 'olap');
  log(`Report type: ${reportType}`, 'olap');
  
  if (!sessionKey || !baseUrl) {
    log('❌ Missing session or base URL', 'olap');
    return { ok: false, error: 'Не авторизован' };
  }
  
  try {
    if (reportType === 'writeoffs') return await getWriteOffsDocuments(dateFrom, dateTo);
    
    let endpoint = '';
    let dataRequest = {};
    let reportName = '';
    
    const adjustedDateTo = new Date(dateTo);
    adjustedDateTo.setDate(adjustedDateTo.getDate() + 1);
    const adjustedDateToStr = adjustedDateTo.toISOString().split('T')[0];
    
    const baseFilters = {
      'OrderDeleted': {
        filterType: 'IncludeValues',
        values: ['NOT_DELETED']
      },
      'DeletedWithWriteoff': {
        filterType: 'IncludeValues',
        values: ['NOT_DELETED']
      }
    };
    
    switch (reportType) {
      case 'guests':
        reportName = 'Кол-во чеков и гостей';
        endpoint = `${baseUrl}/api/v2/reports/olap?key=${sessionKey}`;
        dataRequest = {
          reportType: 'SALES',
          buildSummary: true,
          groupByRowFields: ['OpenDate.Typed'],
          groupByColFields: [],
          aggregateFields: ['GuestNum', 'GuestNum.Avg', 'UniqOrderId'],
          filters: {
            ...baseFilters,
            'OpenDate.Typed': { 
              filterType: 'DateRange', 
              periodType: 'CUSTOM', 
              from: dateFrom, 
              to: adjustedDateToStr, 
              includeLow: true, 
              includeHigh: false
            }
          }
        };
        break;
        
      case 'waiters':
        reportName = 'Выручка по официантам';
        endpoint = `${baseUrl}/api/v2/reports/olap?key=${sessionKey}`;
        dataRequest = {
          reportType: 'SALES',
          buildSummary: true,
          groupByRowFields: ['OrderWaiter.Name'],
          groupByColFields: [],
          aggregateFields: ['DishDiscountSumInt'],
          filters: {
            ...baseFilters,
            'OpenDate.Typed': {
              filterType: 'DateRange',
              periodType: 'CUSTOM',
              from: dateFrom,
              to: adjustedDateToStr,
              includeLow: true,
              includeHigh: false
            }
          }
        };
        break;
        
      case 'hourly':
        reportName = 'Почасовая выручка';
        endpoint = `${baseUrl}/api/v2/reports/olap?key=${sessionKey}`;
        dataRequest = {
          reportType: 'SALES',
          buildSummary: true,
          groupByRowFields: ['OpenDate.Typed', 'HourClose'],
          groupByColFields: [],
          aggregateFields: ['GuestNum', 'DishSumInt', 'DishDiscountSumInt', 'UniqOrderId'],
          filters: {
            ...baseFilters,
            'OpenDate.Typed': { 
              filterType: 'DateRange', 
              periodType: 'CUSTOM', 
              from: dateFrom, 
              to: adjustedDateToStr, 
              includeLow: true, 
              includeHigh: false
            }
          }
        };
        break;
        
      case 'stores':
        reportName = 'Отчет по складам';
        endpoint = `${baseUrl}/api/v2/reports/olap?key=${sessionKey}`;
        dataRequest = {
          reportType: 'SALES',
          buildSummary: true,
          groupByRowFields: ['Store.Name'],
          groupByColFields: [],
          aggregateFields: ['DishDiscountSumInt', 'ProductCostBase.ProductCost'],
          filters: {
            ...baseFilters,
            'OpenDate.Typed': {
              filterType: 'DateRange',
              periodType: 'CUSTOM',
              from: dateFrom,
              to: adjustedDateToStr,
              includeLow: true,
              includeHigh: false
            }
          }
        };
        break;
        
      default:
        return { ok: false, error: `Unknown report type: ${reportType}` };
    }
    
    log(`Request POST ${endpoint}`, 'olap');
    
    const response = await axios.post(endpoint, dataRequest, { 
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    log(`Response status: ${response.status}`, 'olap');
    
    const responseData = response.data?.data || [];
    
    const reportData = { 
      ok: true, 
      reportName, 
      data: responseData,
      rows: responseData,
      groupByRowFields: dataRequest.groupByRowFields,
      reportType: reportType,
      meta: { dateFrom, dateTo, source: endpoint } 
    };
    
    log('========================================', 'olap');
    return reportData;
    
  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'olap');
    return { 
      ok: false, 
      error: error.message, 
      details: error.response ? error.response.data : null 
    };
  }
}

function createMainWindow() {
  log('Creating main window...', 'system');
  
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  mainWindow = new BrowserWindow({ 
    width: Math.min(1400, width - 100),
    height: Math.min(900, height - 100),
    minWidth: 1200,
    minHeight: 800,
    webPreferences: { 
      preload: path.join(__dirname, 'preload.js'), 
      contextIsolation: true, 
      nodeIntegration: false 
    } 
  });
  
  mainWindow.center();
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { 
    log('Main window closed', 'system');
    mainWindow = null; 
  });
}

app.whenReady().then(() => {
  log('Electron app ready', 'system');
  initializeLogging();
  createMainWindow();
});

app.on('window-all-closed', () => {
  log('All windows closed', 'system');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});