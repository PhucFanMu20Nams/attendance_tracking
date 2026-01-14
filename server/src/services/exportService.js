import ExcelJS from 'exceljs';
import { getMonthlyReport } from './reportService.js';

/**
 * Sanitize value to prevent Excel formula injection.
 * Prefix with single quote if starts with formula characters.
 * @param {unknown} value - Value to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeForExcel(value) {
    const safe = String(value ?? '');
    return /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
}

/**
 * Generate Excel file for monthly report.
 * Reuses reportService.getMonthlyReport() for data.
 * 
 * @param {string} scope - 'team' or 'company'
 * @param {string} month - "YYYY-MM" format
 * @param {string} teamId - Required if scope is 'team'
 * @param {Set<string>} holidayDates - Set of holiday dateKeys (optional)
 * @returns {Promise<Buffer>} Excel file buffer
 */
export const generateMonthlyExportExcel = async (scope, month, teamId, holidayDates = new Set()) => {
    const reportData = await getMonthlyReport(scope, month, teamId, holidayDates);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Attendance App';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Monthly Report');

    // Define columns
    worksheet.columns = [
        { header: 'Employee Code', key: 'employeeCode', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Total Work (minutes)', key: 'totalWorkMinutes', width: 20 },
        { header: 'Late Count', key: 'totalLateCount', width: 12 },
        { header: 'OT (minutes)', key: 'totalOtMinutes', width: 15 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows with null-safe access and formula injection protection
    const summary = Array.isArray(reportData?.summary) ? reportData.summary : [];
    for (const item of summary) {
        worksheet.addRow({
            employeeCode: sanitizeForExcel(item?.user?.employeeCode),
            name: sanitizeForExcel(item?.user?.name),
            totalWorkMinutes: item?.totalWorkMinutes ?? 0,
            totalLateCount: item?.totalLateCount ?? 0,
            totalOtMinutes: item?.totalOtMinutes ?? 0
        });
    }

    // Add borders to all cells (no hardcoded column count)
    worksheet.eachRow((row) => {
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

    // Generate buffer and normalize to Buffer type
    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);

    return buffer;
};