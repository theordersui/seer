// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';

import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import BubbleMaps from './components/BubbleMaps';

const { networkConfig } = createNetworkConfig({
  mainnet: { url: getFullnodeUrl('mainnet') },
  testnet: { url: getFullnodeUrl('testnet') },
  devnet: { url: getFullnodeUrl('devnet') },
});

export default function App() {
  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
      <WalletProvider autoConnect>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/bubble-maps" element={<BubbleMaps />} />
          </Routes>
        </Router>
      </WalletProvider>
    </SuiClientProvider>
  );
}
