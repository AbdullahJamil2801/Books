export function toYYYYMMDD(dateStr: string): string | null {
  if (!dateStr) return null;
  // Try to parse with Date constructor
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    // Format to YYYY-MM-DD
    return d.toISOString().split('T')[0];
  }
  // Try common formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, MM-DD-YYYY
  const parts = dateStr.match(/(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})/);
  if (parts) {
    const [, p1, p2, p3] = parts;
    // Heuristic: if year is first or last
    if (p1.length === 4) return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
    if (p3.length === 4) return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
  }
  return null;
} 