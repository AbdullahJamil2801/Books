'use client';

import { useState, useEffect, useCallback, Fragment, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React from 'react';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  document_id?: string;
  created_at?: string;
}

type CSVRow = Record<string, string>;

const CATEGORIES = [
  'Income',
  'Travel',
  'Supplies',
  'Food',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Other'
] as const;

function toYYYYMMDD(dateStr: string): string | null {
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

// Add this function to check if file is PDF or image
const isPDFOrImage = (file: File): boolean => {
  const pdfType = 'application/pdf';
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return file.type === pdfType || imageTypes.includes(file.type);
};

// Add webhook trigger function
const triggerWebhook = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    await fetch('https://hook.us2.make.com/aov8f1zsnyd6nexiktuk8t5206x2th4g', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    console.error('Error triggering webhook:', error);
  }
};

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    category: '',
    document_id: '',
  });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Select all toggle
  const allSelected = transactions.length > 0 && selectedIds.length === transactions.length;
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map(t => t.id));
    }
  };

  // Toggle single selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Import/Deletion Success & Confirmation Modal State
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // single id or 'bulk'
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);

  // Open delete confirmation modal for single or bulk
  const openDeleteConfirm = (id: string | null = null) => {
    setDeleteTarget(id || 'bulk');
    setShowDeleteConfirm(true);
  };
  // Close all confirmation/success modals
  const closeAllModals = () => {
    setShowDeleteConfirm(false);
    setShowDeleteSuccess(false);
    setShowImportSuccess(false);
    setDeleteTarget(null);
    setImportedCount(0);
    setDeletedCount(0);
  };

  // Modified handleDelete for single
  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setTransactions(transactions.filter(t => t.id !== id));
      setDeletedCount(1);
      setShowDeleteSuccess(true);
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error deleting transaction. Please try again.');
    }
  };

  // Modified handleBulkDelete
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', selectedIds);
      if (error) throw error;
      setTransactions(transactions.filter(t => !selectedIds.includes(t.id)));
      setDeletedCount(selectedIds.length);
      setSelectedIds([]);
      setShowDeleteSuccess(true);
    } catch (error) {
      console.error('Error bulk deleting transactions:', error);
      alert('Error deleting selected transactions.');
    }
  };

  // Modified confirmDelete for modal
  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    if (deleteTarget === 'bulk') {
      await handleBulkDelete();
    } else if (deleteTarget) {
      await handleDelete(deleteTarget);
    }
  };

  // Download as CSV
  const downloadCSV = () => {
    const headers = ['Date', 'Description', 'Amount', 'Category', 'Document ID'];
    const rows = transactions.map(t => [t.date, t.description, t.amount, t.category || '', t.document_id || '']);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download as XLSX
  const downloadXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(transactions.map(t => ({
      Date: t.date,
      Description: t.description,
      Amount: t.amount,
      Category: t.category || '',
      'Document ID': t.document_id || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, 'transactions.xlsx');
  };

  // Download as PDF
  const downloadPDF = () => {
    const doc = new jsPDF();
    const tableColumn = ['Date', 'Description', 'Amount', 'Category', 'Document ID'];
    const tableRows = transactions.map(t => [t.date, t.description, t.amount, t.category || '', t.document_id || '']);
    autoTable(doc, { head: [tableColumn], body: tableRows });
    doc.save('transactions.pdf');
  };

  // Dropdown state
  const [downloadOpen, setDownloadOpen] = useState(false);

  // Search state
  const [search, setSearch] = useState('');

  // Filtered transactions
  const filteredTransactions = transactions.filter(t => {
    const searchLower = search.toLowerCase();
    return (
      t.description.toLowerCase().includes(searchLower) ||
      (t.category ? t.category.toLowerCase().includes(searchLower) : false) ||
      t.amount.toString().includes(searchLower)
    );
  });

  // Fetch transactions on component mount
  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      alert('Error loading transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      await handleUpdate(editingId);
    } else {
      await handleCreate();
    }
  };

  const handleCreate = async () => {
    const newTransaction: Omit<Transaction, 'id' | 'created_at'> = {
      date: formData.date,
      description: formData.description,
      amount: parseFloat(formData.amount),
      category: formData.category || null,
      document_id: formData.document_id || undefined,
    };

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert([newTransaction])
        .select()
        .single();

      if (error) throw error;

      setTransactions([data, ...transactions]);
      resetForm();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Error adding transaction. Please try again.');
    }
  };

  const handleUpdate = async (id: string) => {
    const updatedTransaction = {
      date: formData.date,
      description: formData.description,
      amount: parseFloat(formData.amount),
      category: formData.category || null,
      document_id: formData.document_id || undefined,
    };

    try {
      const { data, error } = await supabase
        .from('transactions')
        .update(updatedTransaction)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setTransactions(transactions.map(t => t.id === id ? data : t));
      resetForm();
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Error updating transaction. Please try again.');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      category: '',
      document_id: '',
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // CSV Import Modal State
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [csvHeaders, setCSVHeaders] = useState<string[]>([]);
  const [csvRows, setCSVRows] = useState<CSVRow[]>([]);
  const [csvMappings, setCSVMappings] = useState([
    { source: '', dest: 'date' },
    { source: '', dest: 'description' },
    { source: '', dest: 'amount' },
    { source: '', dest: 'category' },
    { source: '', dest: 'document_id' },
  ]);
  const [csvValidation, setCSVValidation] = useState<{ valid: boolean; errors: string[] }>({ valid: true, errors: [] });
  const [csvLoading, setCSVLoading] = useState(false);
  const [csvStep, setCSVStep] = useState<'upload' | 'mapping'>('upload');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Add generic upload success modal state
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);

  // Add state for uploaded file name and upload complete
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Update handleDrop function
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        handleCSVFile(file);
      } else if (isPDFOrImage(file)) {
        handlePDFOrImage(file);
      }
    }
  };

  // Add back handleDragOver function
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Update handleFileInput function
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith('.csv')) {
        handleCSVFile(file);
      } else if (isPDFOrImage(file)) {
        handlePDFOrImage(file);
      }
    }
  };

  // Add state for PDF import modal and workflow
  const [showPDFImportModal, setShowPDFImportModal] = useState(false);
  const [pdfImportLoading, setPDFImportLoading] = useState(false);
  const [pdfImportError, setPDFImportError] = useState<string | null>(null);
  const [pdfImportRows, setPDFImportRows] = useState<Transaction[]>([]);
  const [pdfImportSubmitLoading, setPDFImportSubmitLoading] = useState(false);
  const [pdfImportSubmitError, setPDFImportSubmitError] = useState<string | null>(null);

  // Handler for PDF upload (replaces handlePDFOrImage for PDFs)
  const handlePDFUpload = async (file: File) => {
    setShowPDFImportModal(true);
    setPDFImportLoading(true);
    setPDFImportError(null);
    setPDFImportRows([]);
    const importId = crypto.randomUUID();
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('importId', importId);
      // Send to Make.com webhook (Make.com should POST result to /api/pending-import with { id: importId, data })
      fetch('https://hook.us2.make.com/aov8f1zsnyd6nexiktuk8t5206x2th4g', {
        method: 'POST',
        body: formData,
      });
      // Poll for result
      let found = false;
      for (let i = 0; i < 30; i++) { // poll for up to 60 seconds (30 * 2s)
        await new Promise(resolve => setTimeout(resolve, 2000));
        const res = await fetch(`/api/pending-import?id=${importId}`);
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          setPDFImportRows(json.data);
          found = true;
          break;
        }
      }
      if (!found) {
        setPDFImportError('Timed out waiting for PDF processing. Please try again.');
      }
    } catch {
      setPDFImportError('Failed to process PDF. Please try again.');
    } finally {
      setPDFImportLoading(false);
    }
  };

  // Handler to update a cell in the PDF import table
  const handlePDFImportCellChange = (rowIdx: number, field: keyof Transaction, value: string) => {
    setPDFImportRows(prev => prev.map((row, idx) =>
      idx === rowIdx ? { ...row, [field]: field === 'amount' ? parseFloat(value) : value } : row
    ));
  };

  // Handler to delete a row from PDF import
  const handlePDFImportDeleteRow = (rowIdx: number) => {
    setPDFImportRows(prev => prev.filter((_, idx) => idx !== rowIdx));
  };

  // Handler to add a new row
  const handlePDFImportAddRow = () => {
    setPDFImportRows(prev => [
      ...prev,
      { id: '', date: '', description: '', amount: 0, category: '', document_id: '' }
    ]);
  };

  // Handler to submit PDF import data to Supabase
  const handleSubmitPDFImport = async () => {
    setPDFImportSubmitLoading(true);
    setPDFImportSubmitError(null);
    try {
      const res = await fetch('/api/import-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pdfImportRows),
      });
      const json = await res.json();
      if (json.success) {
        setShowPDFImportModal(false);
        setPDFImportRows([]);
        fetchTransactions(); // refresh main table
        setShowImportSuccess(true);
        setImportedCount(pdfImportRows.length);
      } else {
        setPDFImportSubmitError(json.error || 'Import failed.');
      }
    } catch {
      setPDFImportSubmitError('Import failed.');
    } finally {
      setPDFImportSubmitLoading(false);
    }
  };

  // Update handlePDFOrImage to use the new PDF workflow
  const handlePDFOrImage = async (file: File) => {
    if (file.type === 'application/pdf') {
      await handlePDFUpload(file);
    } else {
      await triggerWebhook(file);
      setUploadedFileName(file.name);
      setUploadComplete(true);
    }
  };

  // Handle CSV file
  const handleCSVFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const { data, meta, errors } = results;
        if (errors.length > 0) {
          alert(`Error parsing CSV: ${errors[0].message}`);
          return;
        }
        if (!data.length) {
          alert('No data found in CSV file');
          return;
        }
        setCSVHeaders(meta.fields || []);
        setCSVRows(data as CSVRow[]);
        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const DEST_FIELDS = ['date', 'description', 'amount', 'category', 'document_id'];
        const autoMappings = DEST_FIELDS.map(dest => {
          const match = (meta.fields || []).find(header =>
            normalize(header).includes(normalize(dest)) || normalize(dest).includes(normalize(header))
          );
          return { source: match || '', dest };
        });
        setCSVMappings(autoMappings);
        setCSVValidation({ valid: true, errors: [] });
        setCSVStep('mapping');
      },
      error: (error) => {
        alert(`Error reading CSV file: ${error.message}`);
      }
    });
  };

  // Update openCSVModal to reset upload state
  const openCSVModal = () => {
    setShowCSVModal(true);
    setCSVStep('upload');
    setCSVHeaders([]);
    setCSVRows([]);
    setCSVMappings([
      { source: '', dest: 'date' },
      { source: '', dest: 'description' },
      { source: '', dest: 'amount' },
      { source: '', dest: 'category' },
      { source: '', dest: 'document_id' },
    ]);
    setCSVValidation({ valid: true, errors: [] });
    setUploadedFileName(null);
    setUploadComplete(false);
  };

  // Add/remove mapping rows
  const addMappingRow = () => {
    setCSVMappings(prev => [...prev, { source: '', dest: '' }]);
  };
  const removeMappingRow = (idx: number) => {
    setCSVMappings(prev => prev.filter((_, i) => i !== idx));
  };

  // Handle mapping change
  const handleMappingChange = (idx: number, field: 'source' | 'dest', value: string) => {
    setCSVMappings(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  // Validate mapped data
  const validateCSVRows = useCallback(() => {
    const errors: string[] = [];
    // Required fields must be mapped
    const required = ['date', 'description', 'amount'];
    for (const req of required) {
      if (!csvMappings.some(m => m.dest === req && m.source)) {
        errors.push(`Please map a column to required field: ${req}`);
      }
    }
    // Check for duplicate destination fields
    const dests = csvMappings.filter(m => m.source).map(m => m.dest);
    const destSet = new Set(dests);
    if (dests.length !== destSet.size) {
      errors.push('Each destination field can only be mapped once.');
    }
    // Validate rows
    csvRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const get = (dest: string) => {
        const mapping = csvMappings.find(m => m.dest === dest && m.source);
        return mapping ? row[mapping.source] : '';
      };
      const dateVal = get('date');
      const ymd = toYYYYMMDD(dateVal);
      if (!dateVal) errors.push(`Row ${rowNum}: Missing date.`);
      if (dateVal && !ymd) errors.push(`Row ${rowNum}: Invalid date format (${dateVal}). Use YYYY-MM-DD or a recognizable date.`);
      if (!get('description')) errors.push(`Row ${rowNum}: Missing description.`);
      if (!get('amount')) errors.push(`Row ${rowNum}: Missing amount.`);
      if (get('amount') && isNaN(parseFloat(get('amount')))) errors.push(`Row ${rowNum}: Invalid amount (${get('amount')}).`);
    });
    setCSVValidation({ valid: errors.length === 0, errors });
    return errors.length === 0;
  }, [csvRows, csvMappings]);

  // Modified handleImportCSV to show import success modal
  const handleImportCSV = async () => {
    if (!validateCSVRows()) return;
    setCSVLoading(true);
    const get = (row: CSVRow, dest: string) => {
      const mapping = csvMappings.find(m => m.dest === dest && m.source);
      return mapping ? row[mapping.source] : '';
    };
    const transactionsToImport = csvRows.map(row => ({
      date: toYYYYMMDD(get(row, 'date')),
      description: get(row, 'description'),
      amount: parseFloat(get(row, 'amount')),
      category: get(row, 'category') || null,
      document_id: get(row, 'document_id') || undefined,
    }));
    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert(transactionsToImport)
        .select();
      if (error) throw error;
      setTransactions(prev => [...(data || []), ...prev]);
      setShowCSVModal(false);
      setImportedCount(transactionsToImport.length);
      setShowImportSuccess(true);
    } catch {
      alert('Error importing transactions. Please try again.');
    } finally {
      setCSVLoading(false);
    }
  };

  // Helper to close and reset modal state
  const closeCSVModal = () => {
    setShowCSVModal(false);
    setUploadedFileName(null);
    setUploadComplete(false);
  };

  return (
    <>
      <main className="min-h-screen flex">
        {/* Sidebar - Reusing the same sidebar as dashboard */}
        <aside className="w-64 bg-gray-800 text-white flex flex-col">
          <div className="p-6 font-bold text-2xl border-b border-gray-700">Bookkeeping</div>
          <nav className="flex-1 flex flex-col gap-2 p-4">
            <a href="/dashboard" className="py-2 px-4 rounded hover:bg-gray-700">Dashboard</a>
            <a href="/transactions" className="py-2 px-4 rounded bg-gray-700">Transactions</a>
            <a href="/reports" className="py-2 px-4 rounded hover:bg-gray-700">Reports</a>
            <a href="/settings" className="py-2 px-4 rounded hover:bg-gray-700">Settings</a>
          </nav>
        </aside>

        {/* Main Content */}
        <section className="flex-1 bg-gray-50 p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Transactions</h1>
            <div className="flex gap-4 relative">
              <button
                type="button"
                onClick={openCSVModal}
                className="bg-white px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-gray-700"
              >
                Import CSV
              </button>
              <div className="relative">
                <button
                  type="button"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  onClick={() => setDownloadOpen((open) => !open)}
                >
                  Download ▼
                </button>
                {downloadOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg z-10">
                    <button
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      onClick={() => { downloadCSV(); setDownloadOpen(false); }}
                    >
                      Download as CSV
                    </button>
                    <button
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      onClick={() => { downloadXLSX(); setDownloadOpen(false); }}
                    >
                      Download as XLSX
                    </button>
                    <button
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      onClick={() => { downloadPDF(); setDownloadOpen(false); }}
                    >
                      Download as PDF
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Add/Edit Transaction Form */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">
              {editingId ? 'Edit Transaction' : 'Add New Transaction'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Enter transaction description"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    id="amount"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select a category</option>
                    {CATEGORIES.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="document_id" className="block text-sm font-medium text-gray-700 mb-1">
                    Document ID
                  </label>
                  <input
                    type="text"
                    id="document_id"
                    name="document_id"
                    value={formData.document_id}
                    onChange={handleChange}
                    placeholder="Enter document or invoice number"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {editingId ? 'Update Transaction' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by description, category, or amount..."
              className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Transaction History</h2>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => openDeleteConfirm('bulk')}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  Delete Selected ({selectedIds.length})
                </button>
              )}
            </div>
            {isLoading ? (
              <div className="p-6 text-center text-gray-500">
                Loading transactions...
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No transactions yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          aria-label="Select all transactions"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Document ID
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(transaction.id)}
                            onChange={() => toggleSelect(transaction.id)}
                            aria-label={`Select transaction ${transaction.id}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(transaction.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {transaction.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {transaction.category || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {transaction.document_id || '-'}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                          transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          ${Math.abs(transaction.amount).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingId(transaction.id);
                                setFormData({
                                  date: transaction.date,
                                  description: transaction.description,
                                  amount: transaction.amount.toString(),
                                  category: transaction.category || '',
                                  document_id: transaction.document_id || '',
                                });
                              }}
                              className="text-blue-600 hover:text-blue-900 focus:outline-none focus:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => openDeleteConfirm(transaction.id)}
                              className="text-red-600 hover:text-red-900 focus:outline-none focus:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* CSV Import Modal */}
      {showCSVModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
          onClick={closeCSVModal}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold mb-4">Import Transactions</h2>
            {/* Close button in top right */}
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl font-bold focus:outline-none"
              onClick={closeCSVModal}
              aria-label="Close"
              type="button"
            >
              ×
            </button>
            {csvStep === 'upload' && !uploadComplete && (
              <div className="flex flex-col items-center justify-center py-12">
                <div
                  className="w-full max-w-md border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="text-4xl mb-2">📄</span>
                  <span className="text-gray-700 mb-2">Drag and drop your CSV, PDF, or image file here</span>
                  <span className="text-gray-500 text-sm mb-2">or click to select a file</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.pdf,image/*"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>
                {/* Add close button below drag area for accessibility */}
                <button
                  type="button"
                  onClick={closeCSVModal}
                  className="mt-6 text-gray-500 hover:text-gray-700 underline"
                >
                  Cancel
                </button>
              </div>
            )}
            {csvStep === 'upload' && uploadComplete && uploadedFileName && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-full max-w-md border-2 border-green-400 rounded-lg p-8 flex flex-col items-center justify-center bg-green-50">
                  <span className="text-5xl text-green-500 mb-2">✔️</span>
                  <span className="text-gray-700 mb-2">{uploadedFileName}</span>
                  <span className="text-green-700 font-semibold mb-2">Upload complete!</span>
                  <button
                    type="button"
                    onClick={closeCSVModal}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            {csvStep === 'mapping' && (
              <>
                <div className="mb-4">
                  <div className="flex items-center mb-2">
                    <span className="font-semibold text-green-700 mr-2">Destination fields</span>
                    <span className="text-xl">→</span>
                    <span className="font-semibold text-blue-700 ml-2">Source columns</span>
                  </div>
                  <div className="space-y-2">
                    {csvMappings.map((mapping, idx) => {
                      // Find the preview value from the first row
                      const preview = mapping.source && csvRows.length > 0 ? csvRows[0][mapping.source] : '';
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          {/* Static destination label */}
                          <span className="w-40 font-medium text-gray-700">{mapping.dest}</span>
                          <span className="text-xl">→</span>
                          <select
                            value={mapping.source}
                            onChange={e => handleMappingChange(idx, 'source', e.target.value)}
                            className="w-48 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Select column...</option>
                            {csvHeaders.map(header => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                          {/* Preview value after source dropdown */}
                          <span className="text-gray-500 text-xs w-32 truncate">{preview}</span>
                          <button
                            type="button"
                            className="ml-2 text-gray-400 hover:text-red-600 text-lg"
                            onClick={() => removeMappingRow(idx)}
                            disabled={csvMappings.length <= 1}
                            aria-label="Remove mapping"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="mt-2 px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm border border-gray-300"
                      onClick={addMappingRow}
                    >
                      Add mapping
                    </button>
                  </div>
                </div>
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Preview</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border">
                      <thead>
                        <tr>
                          {['date', 'description', 'amount', 'category', 'document_id'].map(field => (
                            <th key={field} className="px-2 py-1 border-b">{field.charAt(0).toUpperCase() + field.slice(1)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 5).map((row, idx) => (
                          <tr key={idx}>
                            {['date', 'description', 'amount', 'category', 'document_id'].map(field => {
                              const mapping = csvMappings.find(m => m.dest === field && m.source);
                              return (
                                <td key={field} className="px-2 py-1 border-b">
                                  {mapping ? row[mapping.source] || '' : ''}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {!csvValidation.valid && (
                  <div className="mb-4 text-red-600">
                    <ul className="list-disc pl-5">
                      {csvValidation.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCSVModal(false)}
                    className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    disabled={csvLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImportCSV}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    disabled={csvLoading}
                  >
                    {csvLoading ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Import Success Modal */}
      {showImportSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
            <h2 className="text-xl font-semibold mb-4">Import Successful</h2>
            <p className="mb-6">Successfully imported {importedCount} transactions.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeAllModals}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                OK
              </button>
            </div>
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl font-bold focus:outline-none"
              onClick={closeAllModals}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
            <h2 className="text-xl font-semibold mb-4">Confirm Deletion</h2>
            <p className="mb-6">Are you sure you want to delete {deleteTarget === 'bulk' ? `${selectedIds.length} selected transactions` : 'this transaction'}?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAllModals}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
            </div>
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl font-bold focus:outline-none"
              onClick={closeAllModals}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Delete Success Modal */}
      {showDeleteSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
            <h2 className="text-xl font-semibold mb-4">Delete Successful</h2>
            <p className="mb-6">Successfully deleted {deletedCount} transaction{deletedCount > 1 ? 's' : ''}.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeAllModals}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                OK
              </button>
            </div>
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl font-bold focus:outline-none"
              onClick={closeAllModals}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Upload Success Modal for PDF/Image */}
      {showUploadSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
            <h2 className="text-xl font-semibold mb-4">Upload Complete</h2>
            <p className="mb-6">Your file was uploaded successfully.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowUploadSuccess(false)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                OK
              </button>
            </div>
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl font-bold focus:outline-none"
              onClick={() => setShowUploadSuccess(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* PDF Import Modal */}
      {showPDFImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40" onClick={() => setShowPDFImportModal(false)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl p-6 relative" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">Review & Edit Imported Transactions (PDF)</h2>
            {pdfImportLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="mb-4"><span className="animate-spin inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full"></span></div>
                <div className="text-gray-700">Processing PDF, please wait...</div>
              </div>
            ) : pdfImportError ? (
              <div className="mb-4 text-red-600">{pdfImportError}</div>
            ) : (
              <>
                <div className="overflow-x-auto mb-4">
                  <table className="min-w-full text-sm border">
                    <thead>
                      <tr>
                        <th className="px-2 py-1 border-b">Date</th>
                        <th className="px-2 py-1 border-b">Description</th>
                        <th className="px-2 py-1 border-b">Amount</th>
                        <th className="px-2 py-1 border-b">Category</th>
                        <th className="px-2 py-1 border-b">Document ID</th>
                        <th className="px-2 py-1 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pdfImportRows.map((row, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1 border-b">
                            <input type="date" value={row.date || ''} onChange={e => handlePDFImportCellChange(idx, 'date', e.target.value)} className="w-32 border rounded px-1 py-0.5" />
                          </td>
                          <td className="px-2 py-1 border-b">
                            <input type="text" value={row.description || ''} onChange={e => handlePDFImportCellChange(idx, 'description', e.target.value)} className="w-40 border rounded px-1 py-0.5" />
                          </td>
                          <td className="px-2 py-1 border-b">
                            <input type="number" value={row.amount} onChange={e => handlePDFImportCellChange(idx, 'amount', e.target.value)} className="w-24 border rounded px-1 py-0.5" />
                          </td>
                          <td className="px-2 py-1 border-b">
                            <input type="text" value={row.category || ''} onChange={e => handlePDFImportCellChange(idx, 'category', e.target.value)} className="w-32 border rounded px-1 py-0.5" />
                          </td>
                          <td className="px-2 py-1 border-b">
                            <input type="text" value={row.document_id || ''} onChange={e => handlePDFImportCellChange(idx, 'document_id', e.target.value)} className="w-32 border rounded px-1 py-0.5" />
                          </td>
                          <td className="px-2 py-1 border-b">
                            <button onClick={() => handlePDFImportDeleteRow(idx)} className="text-red-600 hover:text-red-900">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2 mb-4">
                  <button onClick={handlePDFImportAddRow} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm border border-gray-300">Add Row</button>
                </div>
                {pdfImportSubmitError && <div className="mb-2 text-red-600">{pdfImportSubmitError}</div>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowPDFImportModal(false)} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700">Cancel</button>
                  <button onClick={handleSubmitPDFImport} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700" disabled={pdfImportSubmitLoading}>{pdfImportSubmitLoading ? 'Importing...' : 'Import to Database'}</button>
                </div>
              </>
            )}
            <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl font-bold focus:outline-none" onClick={() => setShowPDFImportModal(false)} aria-label="Close">×</button>
          </div>
        </div>
      )}
    </>
  );
} 