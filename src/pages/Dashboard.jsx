import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ConnectButton, useCurrentWallet, useWallets } from '@mysten/dapp-kit';
import { FiHome, FiMap, FiShield, FiImage, FiMessageCircle, FiBell } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Logo from '../assets/seer.png';

// Import landing first, then dashboard (so overrides apply)
import './LandingPage.css';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const { isConnected } = useCurrentWallet();
  const wallets = useWallets();
  const address =
    wallets.flatMap(w => w.accounts.map(a => a.address)).shift()?.toLowerCase() || '';

  if (!isConnected) {
    navigate('/');
    return null;
  }

  const navItems = [
    { label: 'home',         icon: <FiHome />,          path: '/dashboard' },
    { label: 'bubble maps',  icon: <FiMap />,           path: '/bubble-maps' },
    { label: 'trenches',     icon: <FiShield />,        path: '/security-check' },
    { label: 'collections',  icon: <FiImage />,         path: '/nft-analysis' },
    { label: 'minerva',      icon: <FiMessageCircle />, path: '/minerva-chat' },
    { label: 'alerts',       icon: <FiBell />,          path: '/alerts' },
  ];

  return (
    <div className="dashboard-page">
      {/* Header uses grid so the NAV is mathematically centered
          regardless of logo/button widths */}
      <header className="header header--dashboard">
        <img src={Logo} alt="cloak and dagger" className="header__logo" />

        <nav className="dashboard-nav">
          {navItems.map(({ label, icon, path }, index) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.08 }}
              whileHover={{ scale: 1.04 }}
            >
              <NavLink
                to={path}
                end
                className={({ isActive }) =>
                  `dashboard-nav__item${isActive ? ' active' : ''}`
                }
              >
                <span className="dashboard-nav__icon">{icon}</span>
                <span className="dashboard-nav__label">{label}</span>
              </NavLink>
            </motion.div>
          ))}
        </nav>

        <div className="header__actions">
          <ConnectButton>
            {({ connect, connected, disconnect }) => (
              <motion.button
                onClick={connected ? disconnect : connect}
                className="header__btn header__btn--sm"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                {connected ? 'logout' : 'login'}
              </motion.button>
            )}
          </ConnectButton>
        </div>
      </header>

      {/* Centered hero */}
      <section className="dashboard-hero container">
        <motion.h2
          className="dashboard-hero__greeting"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          welcome, {address.slice(0, 6)}…{address.slice(-4)}
        </motion.h2>
        <motion.p
          className="dashboard-hero__subtitle"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
        >
          choose a tool from the nav above to get started
        </motion.p>
      </section>
    </div>
  );
}
