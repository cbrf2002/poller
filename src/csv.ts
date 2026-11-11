/**
 * One CSV cell. Values a spreadsheet would read as a formula (=, +, -, @,
 * tab, CR) get a leading apostrophe so opening the export can't run them.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}
