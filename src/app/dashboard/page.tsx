export default function Dashboard() {
  return (
    <main className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-6 font-bold text-2xl border-b border-gray-700">Bookkeeping</div>
        <nav className="flex-1 flex flex-col gap-2 p-4">
          <a href="/dashboard" className="py-2 px-4 rounded hover:bg-gray-700">Dashboard</a>
          <a href="/transactions" className="py-2 px-4 rounded hover:bg-gray-700">Transactions</a>
          <a href="/reports" className="py-2 px-4 rounded hover:bg-gray-700">Reports</a>
          <a href="/settings" className="py-2 px-4 rounded hover:bg-gray-700">Settings</a>
        </nav>
      </aside>
      {/* Main Content */}
      <section className="flex-1 bg-gray-50 p-8">
        <h1 className="text-3xl font-bold mb-6">Welcome to Your Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-lg bg-white shadow p-6">
            <div className="font-semibold text-gray-700">Total Balance</div>
            <div className="text-2xl font-bold mt-2">$0.00</div>
          </div>
          <div className="rounded-lg bg-white shadow p-6">
            <div className="font-semibold text-gray-700">Recent Transactions</div>
            <div className="text-lg mt-2">No data yet</div>
          </div>
          <div className="rounded-lg bg-white shadow p-6">
            <div className="font-semibold text-gray-700">Upcoming Reports</div>
            <div className="text-lg mt-2">No reports generated</div>
          </div>
        </div>
      </section>
    </main>
  );
} 