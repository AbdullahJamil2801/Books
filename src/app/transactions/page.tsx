'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import Papa from 'papaparse';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  created_at?: string;
}

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

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    category: '',
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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTransactions(transactions.filter(t => t.id !== id));
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error deleting transaction. Please try again.');
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setFormData({
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount.toString(),
      category: transaction.category || '',
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      category: '',
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input
    e.target.value = '';

    // Log the file details
    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => {
        // Normalize header names
        const normalized = header.trim().toLowerCase();
        console.log('Normalized header:', header, '->', normalized);
        return normalized;
      },
      complete: async (results) => {
        console.log('CSV Parse Results:', {
          headers: results.meta.fields,
          rowCount: results.data.length,
          firstRow: results.data[0]
        });

        // Check if we have the required headers
        const requiredHeaders = ['date', 'description', 'amount'];
        const missingHeaders = requiredHeaders.filter(
          header => !results.meta.fields?.includes(header)
        );

        if (missingHeaders.length > 0) {
          alert(`Missing required columns: ${missingHeaders.join(', ')}. Please include: date, description, amount`);
          return;
        }

        type ParsedRow = { date?: string; description?: string; amount?: string; category?: string };
        const transactions = (results.data as ParsedRow[]).map((row, index) => {
          // Log each row for debugging
          console.log(`Processing row ${index + 1}:`, row);

          // Parse date - try multiple formats
          let date = row.date;
          if (date) {
            // Try to parse the date
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate.getTime())) {
              date = parsedDate.toISOString().split('T')[0];
            } else {
              console.warn(`Invalid date format in row ${index + 1}:`, date);
            }
          }

          // Parse amount - handle different formats
          let amount = row.amount;
          if (typeof amount === 'string') {
            // Remove currency symbols and commas
            amount = amount.replace(/[$,]/g, '');
          }
          const parsedAmount = parseFloat(amount as string);
          
          // Log the parsed values
          console.log(`Row ${index + 1} parsed values:`, {
            originalDate: row.date,
            parsedDate: date,
            originalAmount: row.amount,
            parsedAmount: parsedAmount,
            description: row.description,
            category: row.category
          });

          return {
            date: date || new Date().toISOString().split('T')[0],
            description: (row.description || '').trim(),
            amount: isNaN(parsedAmount) ? 0 : parsedAmount,
            category: (row.category || '').trim() || null
          };
        }).filter(t => t.description && !isNaN(t.amount)); // Filter out invalid rows

        console.log('Processed transactions:', transactions);

        if (transactions.length === 0) {
          alert('No valid transactions found in the CSV file');
          return;
        }

        try {
          // Insert all transactions at once
          const { data, error } = await supabase
            .from('transactions')
            .insert(transactions)
            .select();

          if (error) {
            console.error('Supabase error:', error);
            alert(`Supabase error: ${error.message || error}`);
            throw error;
          }

          console.log('Successfully inserted transactions:', data);
          setTransactions(prev => [...(data || []), ...prev]);
          alert(`Successfully imported ${transactions.length} transactions`);
        } catch (error) {
          console.error('Error importing transactions:', error);
          if (error && typeof error === 'object' && 'message' in error) {
            alert(`Error importing transactions: ${(error as { message?: string }).message}`);
          } else {
            alert('Error importing transactions.');
          }
        }
      },
      error: (error) => {
        console.error('CSV parsing error:', error);
        alert(`Error reading CSV file: ${error.message}`);
      }
    });
  };

  return (
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
          <div className="flex gap-4">
            <label className="cursor-pointer bg-white px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              <span className="text-gray-700">Import CSV</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Add/Edit Transaction Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? 'Edit Transaction' : 'Add New Transaction'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        {/* Transactions Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Transaction History</h2>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
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
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(transaction.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.category || '-'}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                        transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        ${Math.abs(transaction.amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(transaction)}
                            className="text-blue-600 hover:text-blue-900 focus:outline-none focus:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(transaction.id)}
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
  );
} 