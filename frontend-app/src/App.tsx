import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardOverview } from './pages/DashboardOverview';
import { WalletPanel } from './pages/WalletPanel';
import { ComplianceDashboard } from './pages/ComplianceDashboard';
import { TransferModule } from './pages/TransferModule';
import { EscrowManager } from './pages/EscrowManager';
import { KYBWizard } from './pages/KYBWizard';
import { Login } from './pages/Login';
import { Settings } from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardOverview />} />
          <Route path="transfers" element={<TransferModule />} />
          <Route path="wallet" element={<WalletPanel />} />
          <Route path="compliance" element={<ComplianceDashboard />} />
          <Route path="escrow" element={<EscrowManager />} />
          <Route path="kyb" element={<KYBWizard />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
