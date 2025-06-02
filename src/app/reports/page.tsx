'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
}

interface CategoryData {
  name: string;
  value: number;
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FF6B6B', '#4ECDC4'];

export default function Reports() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (transactions.length > 0) {
      processData();
    }
  }, [transactions]);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      alert('Error loading transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const processData = () => {
    // Process category data
    const categoryTotals = transactions.reduce((acc, transaction) => {
      const category = transaction.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + Math.abs(transaction.amount);
      return acc;
    }, {} as Record<string, number>);

    const categoryChartData = Object.entries(categoryTotals).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2))
    }));

    // Process monthly data
    const monthlyTotals = transactions.reduce((acc, transaction) => {
      const date = new Date(transaction.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!acc[monthKey]) {
        acc[monthKey] = { income: 0, expenses: 0 };
      }
      
      if (transaction.amount > 0) {
        acc[monthKey].income += transaction.amount;
      } else {
        acc[monthKey].expenses += Math.abs(transaction.amount);
      }
      
      return acc;
    }, {} as Record<string, { income: number; expenses: number }>);

    const monthlyChartData = Object.entries(monthlyTotals)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('default', { month: 'short', year: 'numeric' }),
        income: Number(data.income.toFixed(2)),
        expenses: Number(data.expenses.toFixed(2))
      }))
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

    setCategoryData(categoryChartData);
    setMonthlyData(monthlyChartData);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex">
        <aside className="w-64 bg-gray-800 text-white flex flex-col">
          <div className="p-6 font-bold text-2xl border-b border-gray-700">Bookkeeping</div>
          <nav className="flex-1 flex flex-col gap-2 p-4">
            <a href="/dashboard" className="py-2 px-4 rounded hover:bg-gray-700">Dashboard</a>
            <a href="/transactions" className="py-2 px-4 rounded hover:bg-gray-700">Transactions</a>
            <a href="/reports" className="py-2 px-4 rounded bg-gray-700">Reports</a>
            <a href="/settings" className="py-2 px-4 rounded hover:bg-gray-700">Settings</a>
          </nav>
        </aside>
        <section className="flex-1 bg-gray-50 p-8">
          <div className="text-center text-gray-500">Loading reports...</div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex">
      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-6 font-bold text-2xl border-b border-gray-700">Bookkeeping</div>
        <nav className="flex-1 flex flex-col gap-2 p-4">
          <a href="/dashboard" className="py-2 px-4 rounded hover:bg-gray-700">Dashboard</a>
          <a href="/transactions" className="py-2 px-4 rounded hover:bg-gray-700">Transactions</a>
          <a href="/reports" className="py-2 px-4 rounded bg-gray-700">Reports</a>
          <a href="/settings" className="py-2 px-4 rounded hover:bg-gray-700">Settings</a>
        </nav>
      </aside>

      <section className="flex-1 bg-gray-50 p-8">
        <h1 className="text-3xl font-bold mb-6">Financial Reports</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Monthly Income vs Expenses */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Monthly Income vs Expenses</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                  />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#4CAF50" />
                  <Bar dataKey="expenses" name="Expenses" fill="#F44336" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Spending by Category */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Spending by Category</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={150}
                    label={({ name, value }) => `${name}: $${value.toFixed(2)}`}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
} 