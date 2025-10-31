// renderer.js (с добавленным отчетом по складам)
let isAuthorized = false;
let currentReport = null;
let sortColumn = null;
let sortDirection = 'asc';
let currentFilters = {};
let originalRows = [];

const serverInput = document.getElementById('server');
const loginInput = document.getElementById('login');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const authStatus = document.getElementById('auth-status');

const reportSelector = document.getElementById('report-selector');
const reportType = document.getElementById('report-type');
const getReportBtn = document.getElementById('get-report-btn');
const reportStatus = document.getElementById('report-status');

const previewSection = document.getElementById('preview-section');
const periodSelect = document.getElementById('period-select');
const dateFrom = document.getElementById('date-from');
const dateTo = document.getElementById('date-to');
const previewTitle = document.getElementById('preview-title');
const previewStats = document.getElementById('preview-stats');
const previewTable = document.getElementById('preview-table');

document.addEventListener('DOMContentLoaded', async () => {
  console.log('=== DOM LOADED ===');
  
  loginBtn.addEventListener('click', handleLogin);
  getReportBtn.addEventListener('click', handleGetReport);
  periodSelect.addEventListener('change', handlePeriodChange);
  
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  if (dateFrom) dateFrom.value = formatDateForInput(weekAgo);
  if (dateTo) dateTo.value = formatDateForInput(today);
  
  try {
    const result = await window.electronAPI.loadConfig();
    if (result.ok && result.config) {
      if (result.config.server && serverInput) serverInput.value = result.config.server;
      if (result.config.login && loginInput) loginInput.value = result.config.login;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
});

async function handleLogin() {
  const server = serverInput.value.trim();
  const login = loginInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!server || !login || !password) {
    showStatus('Заполните все поля', 'error', authStatus);
    return;
  }
  
  showStatus('Авторизация...', 'info', authStatus);
  loginBtn.disabled = true;
  
  try {
    const result = await window.electronAPI.login({ server, login, password });
    
    if (result.ok) {
      isAuthorized = true;
      showStatus('✓ Успешно', 'success', authStatus);
      
      if (reportSelector) reportSelector.style.display = 'block';
      
      try {
        await window.electronAPI.saveConfig({ server, login });
      } catch (e) {
        console.error('Failed to save config:', e);
      }
    } else {
      showStatus(`✗ ${result.error}`, 'error', authStatus);
    }
  } catch (error) {
    showStatus(`✗ ${error.message}`, 'error', authStatus);
  } finally {
    loginBtn.disabled = false;
  }
}

async function handleGetReport() {
  if (!isAuthorized) {
    showStatus('Сначала войдите в систему', 'error', reportStatus);
    return;
  }
  
  const type = reportType.value;
  const from = dateFrom.value;
  const to = dateTo.value;
  
  if (!from || !to) {
    showStatus('Укажите период', 'error', reportStatus);
    return;
  }
  
  showStatus('Загрузка отчета...', 'info', reportStatus);
  getReportBtn.disabled = true;
  
  try {
    const result = await window.electronAPI.getOlapData({ reportType: type, dateFrom: from, dateTo: to });
    
    if (result.ok) {
      currentReport = result;
      renderReport(result);
      
      if (previewSection) previewSection.style.display = 'block';
      showStatus('✓ Отчет загружен', 'success', reportStatus);
    } else {
      showStatus(`✗ ${result.error}`, 'error', reportStatus);
    }
  } catch (error) {
    showStatus(`✗ ${error.message}`, 'error', reportStatus);
  } finally {
    getReportBtn.disabled = false;
  }
}

function showStatus(message, type, element) {
  if (!element) return;
  element.textContent = message;
  element.className = `status-badge status-${type}`;
}

function handlePeriodChange() {
  const period = periodSelect.value;
  if (period === 'custom') return;
  
  const today = new Date();
  let from, to;
  
  switch (period) {
    case 'today':
      from = new Date(today);
      to = new Date(today);
      break;
      
    case 'yesterday':
      from = new Date(today);
      from.setDate(from.getDate() - 1);
      to = new Date(from);
      break;
      
    case 'current-week':
      from = new Date(today);
      const currentDay = from.getDay();
      const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
      from.setDate(from.getDate() - daysFromMonday);
      to = new Date(today);
      break;
      
    case 'last-week':
      from = new Date(today);
      const todayDay = from.getDay();
      const daysToLastMonday = todayDay === 0 ? 6 : todayDay - 1;
      from.setDate(from.getDate() - daysToLastMonday - 7);
      to = new Date(from);
      to.setDate(to.getDate() + 6);
      break;
      
    case 'current-month':
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today);
      break;
      
    case 'last-month':
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
      
    case 'current-year':
      from = new Date(today.getFullYear(), 0, 1);
      to = new Date(today);
      break;
      
    default:
      return;
  }
  
  dateFrom.value = formatDateForInput(from);
  dateTo.value = formatDateForInput(to);
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function copyToClipboard(text) {
  if (!text) return false;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Copied to clipboard:', text);
    }).catch(err => {
      console.error('Failed to copy:', err);
      fallbackCopyToClipboard(text);
    });
  } else {
    fallbackCopyToClipboard(text);
  }
  
  return true;
}

function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    document.execCommand('copy');
    console.log('Fallback: Copied to clipboard');
  } catch (err) {
    console.error('Fallback: Failed to copy', err);
  }
  
  document.body.removeChild(textArea);
}

function showCopyFeedback(cell) {
  cell.classList.add('cell-copied');
  
  setTimeout(() => {
    cell.classList.remove('cell-copied');
  }, 300);
}

function renderReport(report) {
  previewTitle.textContent = report.reportName;
  
  let rows = [];
  let headers = [];
  
  if (!Array.isArray(report.data) || report.data.length === 0) {
    previewStats.textContent = 'Нет данных';
    previewTable.innerHTML = '<tr><td colspan="15" style="text-align:center;padding:20px;color:#999;">Нет данных</td></tr>';
    return;
  }
  
  const type = reportType.value;
  
  originalRows = [];
  
  if (type === 'guests') {
    headers = ['Учетный день', 'Ср.кол-во гостей на чек', 'Чеков', 'Количество гостей'];
    
    let totalGuests = 0;
    let totalChecks = 0;
    
    rows = report.data.map(item => {
      const guests = Math.round(item.GuestNum || 0);
      const checks = Math.round(item.UniqOrderId || 0);
      const avg = item['GuestNum.Avg'] ? parseFloat((item['GuestNum.Avg']).toFixed(2)) : 
                  (checks > 0 ? parseFloat((guests / checks).toFixed(2)) : 0);
      
      const dateValue = item['OpenDate.Typed'];
      const dateStr = dateValue !== null && dateValue !== undefined ? String(dateValue) : '';
      
      const isTotal = dateStr === 'Итого' || dateStr.toLowerCase() === 'итого';
      
      const row = {
        'Учетный день': isTotal ? 'Итого:' : formatDateOnly(dateValue),
        'Ср.кол-во гостей на чек': avg,
        'Чеков': checks,
        'Количество гостей': guests,
        _isTotal: isTotal,
        _originalData: { guests, checks, avg }
      };
      
      if (!isTotal) {
        originalRows.push(row);
        totalGuests += guests;
        totalChecks += checks;
      }
      
      return row;
    });
    
    const hasTotal = rows.some(row => row._isTotal);
    if (!hasTotal) {
      const totalAvg = totalChecks > 0 ? parseFloat((totalGuests / totalChecks).toFixed(2)) : 0;
      rows.push({
        'Учетный день': 'Итого:',
        'Ср.кол-во гостей на чек': totalAvg,
        'Чеков': totalChecks,
        'Количество гостей': totalGuests,
        _isTotal: true
      });
    }
  }
  else if (type === 'waiters') {
    headers = ['Официант заказа', 'Сумма со скидкой, р.'];
    
    let totalDiscount = 0;
    
    rows = report.data.map(item => {
      const orderWaiter = item['OrderWaiter.Name'] || 'Не указан';
      const discount = parseFloat((item.DishDiscountSumInt || 0).toFixed(2));
      
      const isTotal = orderWaiter === 'Итого' || orderWaiter.toLowerCase() === 'итого';
      
      const row = {
        'Официант заказа': isTotal ? 'Итого:' : orderWaiter,
        'Сумма со скидкой, р.': discount,
        _isTotal: isTotal,
        _originalData: { discount }
      };
      
      if (!isTotal) {
        originalRows.push(row);
        totalDiscount += discount;
      }
      
      return row;
    });
    
    const hasTotal = rows.some(row => row._isTotal);
    if (!hasTotal) {
      rows.push({
        'Официант заказа': 'Итого:',
        'Сумма со скидкой, р.': parseFloat(totalDiscount.toFixed(2)),
        _isTotal: true
      });
    }
  }
  else if (type === 'hourly') {
    headers = [
      'Учетный день',
      'Час закрытия',
      'Количество гостей',
      'Сумма без скидки, р.',
      'Сумма со скидкой, р.',
      'Чеков'
    ];
    
    const dayGroups = new Map();
    let grandTotalGuests = 0;
    let grandTotalSum = 0;
    let grandTotalDiscount = 0;
    let grandTotalChecks = 0;
    
    report.data.forEach(item => {
      const date = item['OpenDate.Typed'];
      const hour = item['HourClose'];
      const guests = Math.round(item.GuestNum || 0);
      const sumNoDiscount = parseFloat((item.DishSumInt || 0).toFixed(2));
      const sumWithDiscount = parseFloat((item.DishDiscountSumInt || 0).toFixed(2));
      const checks = Math.round(item.UniqOrderId || 0);
      
      const dateStr = date !== null && date !== undefined ? String(date) : '';
      
      if (dateStr === 'Итого' || dateStr.toLowerCase() === 'итого') return;
      if (dateStr.includes(' всего')) return;
      
      const dateOnly = formatDateOnly(date);
      const dateKey = getDateSortKey(date);
      
      if (!dayGroups.has(dateKey)) {
        dayGroups.set(dateKey, {
          dayName: dateOnly,
          rows: [],
          subtotalGuests: 0,
          subtotalSum: 0,
          subtotalDiscount: 0,
          subtotalChecks: 0
        });
      }
      
      const group = dayGroups.get(dateKey);
      const row = {
        'Учетный день': dateOnly,
        'Час закрытия': hour !== null && hour !== undefined ? String(hour) : '',
        'Количество гостей': guests,
        'Сумма без скидки, р.': sumNoDiscount,
        'Сумма со скидкой, р.': sumWithDiscount,
        'Чеков': checks,
        _originalData: { guests, sumNoDiscount, sumWithDiscount, checks },
        _dateSortKey: dateKey,
        _isHourlyRow: true
      };
      
      group.rows.push(row);
      originalRows.push(row);
      
      group.subtotalGuests += guests;
      group.subtotalSum += sumNoDiscount;
      group.subtotalDiscount += sumWithDiscount;
      group.subtotalChecks += checks;
      
      grandTotalGuests += guests;
      grandTotalSum += sumNoDiscount;
      grandTotalDiscount += sumWithDiscount;
      grandTotalChecks += checks;
    });
    
    const sortedDayGroups = Array.from(dayGroups.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    
    rows = [];
    sortedDayGroups.forEach(([dateKey, group]) => {
      group.rows.sort((a, b) => {
        const hourA = a['Час закрытия'] ? parseInt(a['Час закрытия']) : 0;
        const hourB = b['Час закрытия'] ? parseInt(b['Час закрытия']) : 0;
        return hourA - hourB;
      });
      
      rows.push(...group.rows);
      
      rows.push({
        'Учетный день': `${group.dayName} всего`,
        'Час закрытия': '',
        'Количество гостей': group.subtotalGuests,
        'Сумма без скидки, р.': parseFloat(group.subtotalSum.toFixed(2)),
        'Сумма со скидкой, р.': parseFloat(group.subtotalDiscount.toFixed(2)),
        'Чеков': group.subtotalChecks,
        _isDayTotal: true,
        _dateSortKey: dateKey
      });
    });
    
    rows.push({
      'Учетный день': 'Итого:',
      'Час закрытия': '',
      'Количество гостей': grandTotalGuests,
      'Сумма без скидки, р.': parseFloat(grandTotalSum.toFixed(2)),
      'Сумма со скидкой, р.': parseFloat(grandTotalDiscount.toFixed(2)),
      'Чеков': grandTotalChecks,
      _isTotal: true
    });
  }
  else if (type === 'stores') {
    headers = ['Со склада', 'Сумма со скидкой, р.', 'Себестоимость, р.'];
    
    let totalDiscount = 0;
    let totalCost = 0;
    
    rows = report.data.map(item => {
      const storeName = item['Store.Name'] || 'Не указан';
      const discount = parseFloat((item.DishDiscountSumInt || 0).toFixed(2));
      const cost = parseFloat((item['ProductCostBase.ProductCost'] || 0).toFixed(2));
      
      const isTotal = storeName === 'Итого' || storeName.toLowerCase() === 'итого';
      
      const row = {
        'Со склада': isTotal ? 'Итого:' : storeName,
        'Сумма со скидкой, р.': discount,
        'Себестоимость, р.': cost,
        _isTotal: isTotal,
        _originalData: { discount, cost }
      };
      
      if (!isTotal) {
        originalRows.push(row);
        totalDiscount += discount;
        totalCost += cost;
      }
      
      return row;
    });
    
    const hasTotal = rows.some(row => row._isTotal);
    if (!hasTotal) {
      rows.push({
        'Со склада': 'Итого:',
        'Сумма со скидкой, р.': parseFloat(totalDiscount.toFixed(2)),
        'Себестоимость, р.': parseFloat(totalCost.toFixed(2)),
        _isTotal: true
      });
    }
  }
  else if (type === 'writeoffs') {
    headers = [
      'Дата',
      'Тип',
      '№ документа',
      'Товары',
      'Сумма, р.',
      'Проведен',
      'Склад',
      'Концепция',
      'Комментарий',
      'Счет списания'
    ];
    
    let totalSum = 0;
    
    rows = report.data.map(doc => {
      const sum = parseFloat((doc.sum || 0).toFixed(2));
      totalSum += sum;
      
      const row = {
        'Дата': formatDate(doc.date),
        'Тип': doc.type || 'Акт списания',
        '№ документа': doc.number || '',
        'Товары': doc.items || '',
        'Сумма, р.': sum,
        'Проведен': doc.conducted === 'Да' ? 'Да' : 'Нет',
        'Склад': doc.store || '',
        'Концепция': doc.conception || '',
        'Комментарий': doc.comment || '',
        'Счет списания': doc.accountName || '',
        _originalData: { sum }
      };
      
      originalRows.push(row);
      return row;
    });
    
    rows.push({
      'Дата': '',
      'Тип': '',
      '№ документа': 'Итого:',
      'Товары': '',
      'Сумма, р.': parseFloat(totalSum.toFixed(2)),
      'Проведен': '',
      'Склад': '',
      'Концепция': '',
      'Комментарий': '',
      'Счет списания': '',
      _isTotal: true
    });
  }
  
  previewStats.textContent = `Строк: ${rows.length}`;
  
  const table = previewTable;
  table.innerHTML = '';
  
  const thead = document.createElement('thead');
  
  const headerRow = document.createElement('tr');
  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => sortTable(header));
    if (sortColumn === header) {
      th.textContent += sortDirection === 'asc' ? ' ▲' : ' ▼';
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  
  const filterRow = document.createElement('tr');
  filterRow.className = 'filter-row';
  headers.forEach(header => {
    const th = document.createElement('th');
    
    const numericColumns = ['Сумма', 'р.', 'Количество', 'Чеков', 'Ср.кол-во'];
    const isNumericColumn = numericColumns.some(col => header.includes(col));
    
    if (isNumericColumn && header !== 'Час закрытия') {
      th.innerHTML = '<div class="filter-placeholder"></div>';
    } else {
      const filterContainer = document.createElement('div');
      filterContainer.className = 'filter-checkbox-container';
      
      const filterButton = document.createElement('button');
      filterButton.className = 'filter-button';
      filterButton.textContent = '⚙️';
      filterButton.title = 'Фильтр';
      
      const filterDropdown = document.createElement('div');
      filterDropdown.className = 'filter-dropdown';
      
      const allCheckbox = document.createElement('input');
      allCheckbox.type = 'checkbox';
      allCheckbox.checked = true;
      allCheckbox.id = `filter-all-${header}`;
      allCheckbox.dataset.column = header;
      
      const allLabel = document.createElement('label');
      allLabel.htmlFor = `filter-all-${header}`;
      allLabel.textContent = 'Все';
      allLabel.className = 'filter-all-label';
      
      filterDropdown.appendChild(allCheckbox);
      filterDropdown.appendChild(allLabel);
      
      const uniqueValues = getUniqueValuesForColumn(rows, header);
      if (uniqueValues.length > 0) {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'filter-options';
        
        uniqueValues.forEach((value, index) => {
          const optionId = `filter-${header}-${index}`;
          
          const optionContainer = document.createElement('div');
          optionContainer.className = 'filter-option';
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = true;
          checkbox.id = optionId;
          checkbox.dataset.column = header;
          checkbox.dataset.value = value;
          
          const label = document.createElement('label');
          label.htmlFor = optionId;
          label.textContent = value;
          label.title = value;
          
          optionContainer.appendChild(checkbox);
          optionContainer.appendChild(label);
          optionsContainer.appendChild(optionContainer);
        });
        
        filterDropdown.appendChild(optionsContainer);
      }
      
      filterContainer.appendChild(filterButton);
      filterContainer.appendChild(filterDropdown);
      
      filterButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = filterDropdown.style.display === 'block';
        document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
          if (dropdown !== filterDropdown) {
            dropdown.style.display = 'none';
          }
        });
        filterDropdown.style.display = isVisible ? 'none' : 'block';
      });
      
      allCheckbox.addEventListener('change', (e) => {
        const checkboxes = filterDropdown.querySelectorAll('input[type="checkbox"]:not([id^="filter-all-"])');
        checkboxes.forEach(cb => {
          cb.checked = e.target.checked;
        });
        updateFiltersForColumn(header);
      });
      
      filterDropdown.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && !e.target.id.startsWith('filter-all-')) {
          updateFiltersForColumn(header);
        }
      });
      
      filterDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      th.appendChild(filterContainer);
    }
    filterRow.appendChild(th);
  });
  thead.appendChild(filterRow);
  
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    
    const isTotal = row._isTotal;
    const isDayTotal = row._isDayTotal;
    const isHourlyRow = row._isHourlyRow;
    
    if (isTotal) {
      tr.classList.add('total-row');
    } else if (isDayTotal) {
      tr.classList.add('day-total-row');
    } else if (idx % 2 === 1) {
      tr.style.backgroundColor = '#f8f9fa';
    }
    
    headers.forEach(header => {
      const td = document.createElement('td');
      const value = row[header];
      
      if (typeof value === 'number') {
        td.textContent = value.toLocaleString('ru-RU', { 
          minimumFractionDigits: value % 1 !== 0 ? 2 : 0, 
          maximumFractionDigits: 2
        });
        td.style.textAlign = 'right';
        td.className = 'numeric-cell';
      } else {
        td.textContent = value || '';
        td.className = 'text-cell';
      }
      
      td.dataset.column = header;
      td.dataset.value = value;
      
      if (isHourlyRow) {
        td.dataset.rowType = 'hourly';
      } else if (isDayTotal) {
        td.dataset.rowType = 'day-total';
      } else if (isTotal) {
        td.dataset.rowType = 'total';
      }
      
      td.style.cursor = 'pointer';
      td.addEventListener('click', function() {
        const cellValue = this.textContent.trim();
        if (cellValue) {
          copyToClipboard(cellValue);
          showCopyFeedback(this);
        }
      });
      
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  
  currentReport = {
    ...report,
    rows: rows,
    headers: headers
  };
  
  currentFilters = {};
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-checkbox-container')) {
      document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
        dropdown.style.display = 'none';
      });
    }
  });
}

function getDateSortKey(dateValue) {
  if (!dateValue) return '0000-00-00';
  try {
    const date = new Date(dateValue);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return '0000-00-00';
  }
}

function updateFiltersForColumn(column) {
  const dropdown = document.querySelector(`.filter-dropdown:has([data-column="${column}"])`);
  const allCheckbox = dropdown.querySelector('input[type="checkbox"][id^="filter-all-"]');
  const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]:not([id^="filter-all-"])');
  
  const selectedValues = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.value);
  
  const allValues = Array.from(checkboxes).map(cb => cb.dataset.value);
  
  allCheckbox.checked = selectedValues.length === allValues.length;
  allCheckbox.indeterminate = selectedValues.length > 0 && selectedValues.length < allValues.length;
  
  if (selectedValues.length === allValues.length) {
    delete currentFilters[column];
  } else {
    currentFilters[column] = selectedValues;
  }
  
  applyFilters();
}

function getUniqueValuesForColumn(rows, column) {
  const values = new Set();
  rows.forEach(row => {
    if (row._isTotal || row._isSubtotal || row._isDayTotal) return;
    
    const value = row[column];
    if (value !== undefined && value !== null && value !== '') {
      values.add(String(value));
    }
  });
  
  if (column === 'Час закрытия') {
    return Array.from(values).sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }
  
  if (column === 'Учетный день' || column === 'Дата') {
    return Array.from(values).sort((a, b) => {
      const dateA = new Date(a.split(', ')[1] || a);
      const dateB = new Date(b.split(', ')[1] || b);
      return dateA - dateB;
    });
  }
  
  return Array.from(values).sort();
}

function applyFilters() {
  const tbody = previewTable.querySelector('tbody');
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll('tr');
  let visibleCount = 0;
  
  rows.forEach(row => {
    if (row.classList.contains('total-row') || row.classList.contains('day-total-row')) {
      row.style.display = 'none';
      return;
    }
    
    let shouldShow = true;
    
    for (const [column, filterValues] of Object.entries(currentFilters)) {
      const cell = row.querySelector(`td[data-column="${column}"]`);
      if (cell) {
        const cellValue = cell.dataset.value;
        if (!filterValues.includes(cellValue)) {
          shouldShow = false;
          break;
        }
      }
    }
    
    row.style.display = shouldShow ? '' : 'none';
    if (shouldShow) visibleCount++;
  });
  
  recalculateTotals(visibleCount);
  
  const totalRows = currentReport?.rows?.length || 0;
  if (Object.keys(currentFilters).length > 0) {
    previewStats.textContent = `Строк: ${visibleCount} из ${totalRows} (отфильтровано)`;
  } else {
    previewStats.textContent = `Строк: ${totalRows}`;
  }
}

function recalculateTotals(visibleCount) {
  const tbody = previewTable.querySelector('tbody');
  if (!tbody) return;
  
  const type = reportType.value;
  const visibleRows = Array.from(tbody.querySelectorAll('tr'))
    .filter(tr => tr.style.display !== 'none')
    .map(tr => {
      const cells = tr.querySelectorAll('td');
      const rowData = {};
      cells.forEach(cell => {
        rowData[cell.dataset.column] = cell.dataset.value;
        rowData._rowType = cell.dataset.rowType;
      });
      return rowData;
    });
  
  const oldTotalRows = tbody.querySelectorAll('.total-row, .day-total-row');
  oldTotalRows.forEach(row => row.remove());
  
  if (type === 'guests') {
    let totalGuests = 0;
    let totalChecks = 0;
    
    visibleRows.forEach(row => {
      if (row['Количество гостей'] && row['Чеков']) {
        totalGuests += parseInt(row['Количество гостей']) || 0;
        totalChecks += parseInt(row['Чеков']) || 0;
      }
    });
    
    const totalAvg = totalChecks > 0 ? parseFloat((totalGuests / totalChecks).toFixed(2)) : 0;
    
    const totalRow = document.createElement('tr');
    totalRow.classList.add('total-row');
    
    ['Учетный день', 'Ср.кол-во гостей на чек', 'Чеков', 'Количество гостей'].forEach(header => {
      const td = document.createElement('td');
      let value = '';
      
      switch (header) {
        case 'Учетный день': value = 'Итого:'; break;
        case 'Ср.кол-во гостей на чек': value = totalAvg; break;
        case 'Чеков': value = totalChecks; break;
        case 'Количество гостей': value = totalGuests; break;
      }
      
      if (typeof value === 'number') {
        td.textContent = value.toLocaleString('ru-RU');
        td.style.textAlign = 'right';
        td.className = 'numeric-cell';
      } else {
        td.textContent = value;
        td.className = 'text-cell';
      }
      
      td.style.cursor = 'pointer';
      td.addEventListener('click', function() {
        const cellValue = this.textContent.trim();
        if (cellValue) {
          copyToClipboard(cellValue);
          showCopyFeedback(this);
        }
      });
      
      totalRow.appendChild(td);
    });
    
    tbody.appendChild(totalRow);
  }
  else if (type === 'waiters') {
    let totalDiscount = 0;
    
    visibleRows.forEach(row => {
      if (row['Сумма со скидкой, р.']) {
        totalDiscount += parseFloat(row['Сумма со скидкой, р.']) || 0;
      }
    });
    
    const totalRow = document.createElement('tr');
    totalRow.classList.add('total-row');
    
    ['Официант заказа', 'Сумма со скидкой, р.'].forEach(header => {
      const td = document.createElement('td');
      let value = '';
      
      switch (header) {
        case 'Официант заказа': value = 'Итого:'; break;
        case 'Сумма со скидкой, р.': value = parseFloat(totalDiscount.toFixed(2)); break;
      }
      
      if (typeof value === 'number') {
        td.textContent = value.toLocaleString('ru-RU', { minimumFractionDigits: 2 });
        td.style.textAlign = 'right';
        td.className = 'numeric-cell';
      } else {
        td.textContent = value;
        td.className = 'text-cell';
      }
      
      td.style.cursor = 'pointer';
      td.addEventListener('click', function() {
        const cellValue = this.textContent.trim();
        if (cellValue) {
          copyToClipboard(cellValue);
          showCopyFeedback(this);
        }
      });
      
      totalRow.appendChild(td);
    });
    
    tbody.appendChild(totalRow);
  }
  else if (type === 'hourly') {
    const dayGroups = new Map();
    let grandTotalGuests = 0;
    let grandTotalSum = 0;
    let grandTotalDiscount = 0;
    let grandTotalChecks = 0;
    
    visibleRows.forEach(row => {
      const day = row['Учетный день'];
      const hour = row['Час закрытия'];
      const rowType = row._rowType;
      
      if (!hour || rowType === 'day-total' || rowType === 'total') return;
      
      if (!dayGroups.has(day)) {
        dayGroups.set(day, {
          rows: [],
          subtotalGuests: 0,
          subtotalSum: 0,
          subtotalDiscount: 0,
          subtotalChecks: 0
        });
      }
      
      const group = dayGroups.get(day);
      const guests = parseInt(row['Количество гостей']) || 0;
      const sum = parseFloat(row['Сумма без скидки, р.']) || 0;
      const discount = parseFloat(row['Сумма со скидкой, р.']) || 0;
      const checks = parseInt(row['Чеков']) || 0;
      
      group.rows.push(row);
      group.subtotalGuests += guests;
      group.subtotalSum += sum;
      group.subtotalDiscount += discount;
      group.subtotalChecks += checks;
      
      grandTotalGuests += guests;
      grandTotalSum += sum;
      grandTotalDiscount += discount;
      grandTotalChecks += checks;
    });
    
    dayGroups.forEach((group, day) => {
      const dayTotalRow = document.createElement('tr');
      dayTotalRow.classList.add('day-total-row');
      
      ['Учетный день', 'Час закрытия', 'Количество гостей', 'Сумма без скидки, р.', 'Сумма со скидкой, р.', 'Чеков'].forEach(header => {
        const td = document.createElement('td');
        let value = '';
        
        switch (header) {
          case 'Учетный день': value = `${day} всего`; break;
          case 'Количество гостей': value = group.subtotalGuests; break;
          case 'Сумма без скидки, р.': value = parseFloat(group.subtotalSum.toFixed(2)); break;
          case 'Сумма со скидкой, р.': value = parseFloat(group.subtotalDiscount.toFixed(2)); break;
          case 'Чеков': value = group.subtotalChecks; break;
          default: value = '';
        }
        
        if (typeof value === 'number') {
          td.textContent = value.toLocaleString('ru-RU', { minimumFractionDigits: 2 });
          td.style.textAlign = 'right';
          td.className = 'numeric-cell';
        } else {
          td.textContent = value;
          td.className = 'text-cell';
        }
        
        td.style.cursor = 'pointer';
        td.addEventListener('click', function() {
          const cellValue = this.textContent.trim();
          if (cellValue) {
            copyToClipboard(cellValue);
            showCopyFeedback(this);
          }
        });
        
        dayTotalRow.appendChild(td);
      });
      
      tbody.appendChild(dayTotalRow);
    });
    
    const totalRow = document.createElement('tr');
    totalRow.classList.add('total-row');
    
    ['Учетный день', 'Час закрытия', 'Количество гостей', 'Сумма без скидки, р.', 'Сумма со скидкой, р.', 'Чеков'].forEach(header => {
      const td = document.createElement('td');
      let value = '';
      
      switch (header) {
        case 'Учетный день': value = 'Итого:'; break;
        case 'Количество гостей': value = grandTotalGuests; break;
        case 'Сумма без скидки, р.': value = parseFloat(grandTotalSum.toFixed(2)); break;
        case 'Сумма со скидкой, р.': value = parseFloat(grandTotalDiscount.toFixed(2)); break;
        case 'Чеков': value = grandTotalChecks; break;
        default: value = '';
      }
      
      if (typeof value === 'number') {
        td.textContent = value.toLocaleString('ru-RU', { minimumFractionDigits: 2 });
        td.style.textAlign = 'right';
        td.className = 'numeric-cell';
      } else {
        td.textContent = value;
        td.className = 'text-cell';
      }
      
      td.style.cursor = 'pointer';
      td.addEventListener('click', function() {
        const cellValue = this.textContent.trim();
        if (cellValue) {
          copyToClipboard(cellValue);
          showCopyFeedback(this);
        }
      });
      
      totalRow.appendChild(td);
    });
    
    tbody.appendChild(totalRow);
  }
  else if (type === 'stores') {
    let totalDiscount = 0;
    let totalCost = 0;
    
    visibleRows.forEach(row => {
      if (row['Сумма со скидкой, р.']) {
        totalDiscount += parseFloat(row['Сумма со скидкой, р.']) || 0;
      }
      if (row['Себестоимость, р.']) {
        totalCost += parseFloat(row['Себестоимость, р.']) || 0;
      }
    });
    
    const totalRow = document.createElement('tr');
    totalRow.classList.add('total-row');
    
    ['Со склада', 'Сумма со скидкой, р.', 'Себестоимость, р.'].forEach(header => {
      const td = document.createElement('td');
      let value = '';
      
      switch (header) {
        case 'Со склада': value = 'Итого:'; break;
        case 'Сумма со скидкой, р.': value = parseFloat(totalDiscount.toFixed(2)); break;
        case 'Себестоимость, р.': value = parseFloat(totalCost.toFixed(2)); break;
      }
      
      if (typeof value === 'number') {
        td.textContent = value.toLocaleString('ru-RU', { minimumFractionDigits: 2 });
        td.style.textAlign = 'right';
        td.className = 'numeric-cell';
      } else {
        td.textContent = value;
        td.className = 'text-cell';
      }
      
      td.style.cursor = 'pointer';
      td.addEventListener('click', function() {
        const cellValue = this.textContent.trim();
        if (cellValue) {
          copyToClipboard(cellValue);
          showCopyFeedback(this);
        }
      });
      
      totalRow.appendChild(td);
    });
    
    tbody.appendChild(totalRow);
  }
  else if (type === 'writeoffs') {
    let totalSum = 0;
    
    visibleRows.forEach(row => {
      if (row['Сумма, р.']) {
        totalSum += parseFloat(row['Сумма, р.']) || 0;
      }
    });
    
    const totalRow = document.createElement('tr');
    totalRow.classList.add('total-row');
    
    ['Дата', 'Тип', '№ документа', 'Товары', 'Сумма, р.', 'Проведен', 'Склад', 'Концепция', 'Комментарий', 'Счет списания'].forEach(header => {
      const td = document.createElement('td');
      let value = '';
      
      switch (header) {
        case '№ документа': value = 'Итого:'; break;
        case 'Сумма, р.': value = parseFloat(totalSum.toFixed(2)); break;
        default: value = '';
      }
      
      if (typeof value === 'number') {
        td.textContent = value.toLocaleString('ru-RU', { minimumFractionDigits: 2 });
        td.style.textAlign = 'right';
        td.className = 'numeric-cell';
      } else {
        td.textContent = value;
        td.className = 'text-cell';
      }
      
      td.style.cursor = 'pointer';
      td.addEventListener('click', function() {
        const cellValue = this.textContent.trim();
        if (cellValue) {
          copyToClipboard(cellValue);
          showCopyFeedback(this);
        }
      });
      
      totalRow.appendChild(td);
    });
    
    tbody.appendChild(totalRow);
  }
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  try {
    const date = new Date(dateValue);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    let dayNum = date.getDay();
    if (dayNum === 0) dayNum = 7;
    const dayName = dayNames[dayNum - 1];
    
    return `${dayName}, ${day}.${month}.${year} ${hours}:${minutes}`;
  } catch (e) {
    return String(dateValue);
  }
}

function formatDateOnly(dateValue) {
  if (!dateValue) return '';
  try {
    const date = new Date(dateValue);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    let dayNum = date.getDay();
    if (dayNum === 0) dayNum = 7;
    const dayName = dayNames[dayNum - 1];
    
    return `${dayName}, ${day}.${month}.${year}`;
  } catch (e) {
    return String(dateValue);
  }
}

function sortTable(column) {
  if (!currentReport?.rows) return;
  
  const tbody = previewTable.querySelector('tbody');
  if (!tbody) return;
  
  const rows = Array.from(tbody.querySelectorAll('tr:not(.total-row):not(.day-total-row)'));
  const totalRows = Array.from(tbody.querySelectorAll('.total-row, .day-total-row'));
  
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }
  
  rows.sort((a, b) => {
    const aCell = a.querySelector(`td[data-column="${column}"]`);
    const bCell = b.querySelector(`td[data-column="${column}"]`);
    
    if (!aCell || !bCell) return 0;
    
    let aVal = aCell.dataset.value;
    let bVal = bCell.dataset.value;
    
    if (column === 'Учетный день' || column === 'Дата') {
      const dateA = new Date(aVal.split(', ')[1] || aVal);
      const dateB = new Date(bVal.split(', ')[1] || bVal);
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    }
    
    if (!isNaN(aVal) && !isNaN(bVal)) {
      aVal = parseFloat(aVal);
      bVal = parseFloat(bVal);
    } else {
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
    }
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  
  tbody.innerHTML = '';
  rows.forEach(row => tbody.appendChild(row));
  totalRows.forEach(row => tbody.appendChild(row));
  
  const ths = previewTable.querySelectorAll('th');
  ths.forEach(th => {
    if (th.textContent.includes('▲') || th.textContent.includes('▼')) {
      th.textContent = th.textContent.replace(/ [▲▼]/, '');
    }
  });
  
  const currentTh = Array.from(ths).find(th => th.textContent.includes(column));
  if (currentTh) {
    currentTh.textContent += sortDirection === 'asc' ? ' ▲' : ' ▼';
  }
}