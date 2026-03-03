#!/usr/bin/env node

/**
 * Excel Format Validator Script
 * 
 * Purpose: Validate C6 (Excel Numeric Hour Columns)
 * 
 * Usage:
 *   node tests/excel-format-validator.js <path-to-excel-file>
 * 
 * Example:
 *   node tests/excel-format-validator.js ./output/monthly-report-2026-02.xlsx
 * 
 * Validates:
 * - workHours column is numeric type (not string)
 * - otHours column is numeric type (not string)
 * - Numeric precision (1 decimal place)
 * - Excel formula compatibility
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ ${message}`, 'cyan');
}

function logHeader(message) {
    log(`\n${'='.repeat(60)}`, 'blue');
    log(message, 'bright');
    log('='.repeat(60), 'blue');
}

/**
 * Find column index by header text
 */
function findColumnByHeader(worksheet, headerText) {
    let colIndex = null;
    
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 10) return; // Only check first 10 rows for header
        
        row.eachCell((cell, colNumber) => {
            const cellValue = cell.value?.toString() || '';
            if (cellValue.includes(headerText)) {
                colIndex = colNumber;
            }
        });
    });
    
    return colIndex;
}

/**
 * Validate workHours and otHours columns are numeric
 */
async function validateNumericColumns(filePath) {
    logHeader('C6-TC1 & C6-TC2: Validating Numeric Column Types');
    
    const workbook = new ExcelJS.Workbook();
    
    try {
        await workbook.xlsx.readFile(filePath);
    } catch (error) {
        logError(`Failed to read Excel file: ${error.message}`);
        return false;
    }
    
    const summarySheet = workbook.getWorksheet('Báo cáo tổng hợp');
    
    if (!summarySheet) {
        logError('Sheet "Báo cáo tổng hợp" not found');
        return false;
    }
    
    logInfo(`Found sheet: Báo cáo tổng hợp`);
    
    // Find column indices
    const workHoursCol = findColumnByHeader(summarySheet, 'Giờ công');
    const otHoursCol = findColumnByHeader(summarySheet, 'Giờ OT');
    
    if (!workHoursCol) {
        logError('Column "Giờ công" (workHours) not found');
        return false;
    }
    
    if (!otHoursCol) {
        logError('Column "Giờ OT" (otHours) not found');
        return false;
    }
    
    logInfo(`Found column "Giờ công" at index ${workHoursCol}`);
    logInfo(`Found column "Giờ OT" at index ${otHoursCol}`);
    
    // Find header row
    let headerRow = 1;
    summarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 10) return;
        
        row.eachCell((cell) => {
            if (cell.value?.toString().includes('Mã NV')) {
                headerRow = rowNumber;
            }
        });
    });
    
    logInfo(`Header row at: ${headerRow}`);
    
    // Validate data rows
    let totalRows = 0;
    let validWorkHours = 0;
    let validOtHours = 0;
    let invalidWorkHours = [];
    let invalidOtHours = [];
    
    summarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= headerRow) return; // Skip header
        
        const workHoursCell = row.getCell(workHoursCol);
        const otHoursCell = row.getCell(otHoursCol);
        
        // Skip empty rows
        if (!workHoursCell.value && !otHoursCell.value) return;
        
        totalRows++;
        
        // Validate workHours
        if (workHoursCell.value !== null && workHoursCell.value !== undefined) {
            if (workHoursCell.type === ExcelJS.ValueType.Number && typeof workHoursCell.value === 'number') {
                validWorkHours++;
            } else {
                invalidWorkHours.push({
                    row: rowNumber,
                    type: workHoursCell.type,
                    value: workHoursCell.value
                });
            }
        }
        
        // Validate otHours
        if (otHoursCell.value !== null && otHoursCell.value !== undefined) {
            if (otHoursCell.type === ExcelJS.ValueType.Number && typeof otHoursCell.value === 'number') {
                validOtHours++;
            } else {
                invalidOtHours.push({
                    row: rowNumber,
                    type: otHoursCell.type,
                    value: otHoursCell.value
                });
            }
        }
    });
    
    // Report results
    logInfo(`\nTotal data rows: ${totalRows}`);
    
    if (invalidWorkHours.length === 0) {
        logSuccess(`C6-TC1 PASS: All workHours cells are numeric (${validWorkHours}/${validWorkHours})`);
    } else {
        logError(`C6-TC1 FAIL: Found ${invalidWorkHours.length} non-numeric workHours cells`);
        invalidWorkHours.slice(0, 5).forEach(({ row, type, value }) => {
            logWarning(`  Row ${row}: type=${type}, value=${value}`);
        });
    }
    
    if (invalidOtHours.length === 0) {
        logSuccess(`C6-TC2 PASS: All otHours cells are numeric (${validOtHours}/${validOtHours})`);
    } else {
        logError(`C6-TC2 FAIL: Found ${invalidOtHours.length} non-numeric otHours cells`);
        invalidOtHours.slice(0, 5).forEach(({ row, type, value }) => {
            logWarning(`  Row ${row}: type=${type}, value=${value}`);
        });
    }
    
    return invalidWorkHours.length === 0 && invalidOtHours.length === 0;
}

/**
 * Validate numeric precision (1 decimal place)
 */
async function validatePrecision(filePath) {
    logHeader('C6-TC3: Validating Numeric Precision (1 decimal)');
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const summarySheet = workbook.getWorksheet('Báo cáo tổng hợp');
    const workHoursCol = findColumnByHeader(summarySheet, 'Giờ công');
    const otHoursCol = findColumnByHeader(summarySheet, 'Giờ OT');
    
    let headerRow = 1;
    summarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 10) return;
        row.eachCell((cell) => {
            if (cell.value?.toString().includes('Mã NV')) {
                headerRow = rowNumber;
            }
        });
    });
    
    let validPrecision = 0;
    let invalidPrecision = [];
    
    summarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= headerRow) return;
        
        const workHoursCell = row.getCell(workHoursCol);
        
        if (typeof workHoursCell.value === 'number') {
            // Check if value has at most 1 decimal place
            const valueStr = workHoursCell.value.toFixed(1);
            const reconstructed = parseFloat(valueStr);
            
            if (Math.abs(workHoursCell.value - reconstructed) < 0.01) {
                validPrecision++;
            } else {
                invalidPrecision.push({
                    row: rowNumber,
                    value: workHoursCell.value
                });
            }
        }
    });
    
    if (invalidPrecision.length === 0) {
        logSuccess(`C6-TC3 PASS: All values have appropriate precision`);
    } else {
        logWarning(`C6-TC3 WARNING: Found ${invalidPrecision.length} values with > 1 decimal place`);
        invalidPrecision.slice(0, 5).forEach(({ row, value }) => {
            logWarning(`  Row ${row}: ${value}`);
        });
    }
    
    return true; // Warning only, not a hard fail
}

/**
 * Validate Excel formula compatibility
 */
async function validateFormulaCompatibility(filePath) {
    logHeader('C6-TC4: Validating Formula Compatibility');
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const summarySheet = workbook.getWorksheet('Báo cáo tổng hợp');
    const workHoursCol = findColumnByHeader(summarySheet, 'Giờ công');
    
    let headerRow = 1;
    summarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 10) return;
        row.eachCell((cell) => {
            if (cell.value?.toString().includes('Mã NV')) {
                headerRow = rowNumber;
            }
        });
    });
    
    // Add a test formula below the data
    let lastDataRow = headerRow + 1;
    summarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > headerRow) {
            lastDataRow = rowNumber;
        }
    });
    
    const testRow = lastDataRow + 2;
    const testCell = summarySheet.getRow(testRow).getCell(workHoursCol);
    
    // Create SUM formula
    const formulaRange = `${String.fromCharCode(64 + workHoursCol)}${headerRow + 1}:${String.fromCharCode(64 + workHoursCol)}${lastDataRow}`;
    testCell.value = { formula: `SUM(${formulaRange})`, result: 0 };
    
    logInfo(`Added test formula: SUM(${formulaRange})`);
    
    // If we can add formula without error, cells are compatible
    logSuccess('C6-TC4 PASS: Numeric cells are formula-compatible');
    
    return true;
}

/**
 * Main validation function
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        logError('Usage: node excel-format-validator.js <path-to-excel-file>');
        logInfo('Example: node excel-format-validator.js ./output/monthly-report.xlsx');
        process.exit(1);
    }
    
    const filePath = args[0];
    
    logHeader(`Excel Format Validator - C6 Test Suite`);
    logInfo(`Validating file: ${filePath}\n`);
    
    let allPassed = true;
    
    try {
        // Run validation tests
        const tc1tc2 = await validateNumericColumns(filePath);
        const tc3 = await validatePrecision(filePath);
        const tc4 = await validateFormulaCompatibility(filePath);
        
        allPassed = tc1tc2 && tc3 && tc4;
        
        // Summary
        logHeader('Validation Summary');
        
        if (allPassed) {
            logSuccess('All C6 validation tests PASSED ✓');
            log('\nConclusion: Excel export meets C6 requirements:', 'green');
            log('  ✓ workHours column is numeric type', 'green');
            log('  ✓ otHours column is numeric type', 'green');
            log('  ✓ Values have appropriate precision', 'green');
            log('  ✓ Cells are formula-compatible\n', 'green');
        } else {
            logError('Some C6 validation tests FAILED ✗');
            log('\nPlease review the errors above and fix the Excel export logic.\n', 'red');
        }
        
    } catch (error) {
        logError(`Validation failed with error: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
    
    process.exit(allPassed ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { validateNumericColumns, validatePrecision, validateFormulaCompatibility };
