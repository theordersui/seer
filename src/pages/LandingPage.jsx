// src/components/LandingPage.js
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectButton, useCurrentWallet, useWallets } from '@mysten/dapp-kit';
import { FiMap, FiShield, FiImage, FiMessageCircle, FiBell } from 'react-icons/fi';
import { FiSearch, FiClock, FiBarChart, FiLock } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Logo from '../assets/seer.png';
import OuroborusVideo from '../assets/ouroborus_video.mp4';
import OrderVideo from '../assets/order_video.mp4';
import OrderBanner from '../assets/order_banner.png';
import './LandingPage.css';

const ANIM_DUR = 0.4;
const ANIM_STAGGER = 0.15;

function SectionBox({ title, media, children, index, ctaText, ctaLink }) {
  return (
    <motion.div
      className="section-box"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIM_DUR, delay: index * ANIM_STAGGER }}
      viewport={{ once: true }}
    >
      <div className="section-media">{media}</div>
      <div className="section-content">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      <div className="section-actions">
        <a href={ctaLink} className="btn">{ctaText}</a>
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { isConnected } = useCurrentWallet();
  const wallets = useWallets();
  const address = wallets.flatMap(w => w.accounts.map(a => a.address)).shift()?.toLowerCase() || null;

  useEffect(() => {
    if (isConnected && address) {
      localStorage.setItem('sui_address', address);
      navigate('/dashboard');
    }
  }, [isConnected, address, navigate]);

  const features = [
    { icon: <FiMap />, title: 'bubble maps', desc: 'network visualizations of wallets.', comingSoon: false },
    { icon: <FiShield />, title: 'trenches', desc: 'memecoin safety check and fraudex', comingSoon: false },
    { icon: <FiImage />, title: 'collections', desc: 'deep dive into key metrics', comingSoon: true },
    { icon: <FiMessageCircle />, title: 'minerva', desc: 'your guide through the webs', comingSoon: true },
    { icon: <FiBell />, title: 'alerts', desc: 'track anything you want, real-time', comingSoon: true },
  ];

  // Updated to include title & desc
 const challenges = [
   { icon: <FiSearch />, title: 'high barriers',      desc: 'historical data is not easily available' },
   { icon: <FiClock />,  title: 'untapped potential',    desc: 'data gives better decision making' },
   { icon: <FiBarChart />, title: 'low visibility', desc: 'data is often not a part of the user experience' },
   { icon: <FiLock />,    title: 'lack of depth',    desc: 'smart contracts is one thing, data is another' },
 ];

  return (
    <div className="landing-page">
      {/* header */}
      <header className="header">
        <img src={Logo} alt="seer logo" className="header__logo" />
        <ConnectButton>
          {({ connect, connected, disconnect }) => (
            <motion.button
              onClick={connected ? disconnect : connect}
              className="header__btn"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
            >
              {connected ? 'logout' : 'login'}
            </motion.button>
          )}
        </ConnectButton>
      </header>

      {/* hero */}
      <section className="hero">
        <motion.div
          className="hero__logo"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: ANIM_DUR }}
        >
          <img src={Logo} alt="seer" />
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: ANIM_DUR, delay: ANIM_STAGGER }}
        >
          seer
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: ANIM_DUR, delay: ANIM_STAGGER * 2 }}
        >
          your gateway to knowledge in the sui ecosystem
        </motion.p>
        <motion.div
          className="hero__cta"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: ANIM_DUR, delay: ANIM_STAGGER * 3 }}
        >
          <ConnectButton>
            {({ connect, connected, disconnect }) => (
              <button onClick={connected ? disconnect : connect}>
                {connected ? 'logout' : 'enter the network'}
              </button>
            )}
          </ConnectButton>
        </motion.div>
      </section>

      {/* features */}
      <section className="features container">
        <h2 className="section-title">features</h2>
        <div className="features__grid">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: ANIM_DUR, delay: i * ANIM_STAGGER }}
              viewport={{ once: true }}
            >
              {f.comingSoon && <div className="feature-badge">coming soon</div>}
              <div className="feature-card__icon">{f.icon}</div>
              <h3 className="feature-card__title">{f.title}</h3>
              <p className="feature-card__desc">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* who are we */}
      <section className="about container">
        <h2 className="section-title">presenting your guide</h2>
        <div className="about__grid">
          <SectionBox
            title="the order"
            media={
              <video
                src={OuroborusVideo}
                poster={OrderBanner}
                autoPlay muted loop playsInline
              />
            }
            index={0}
            ctaText="read more"
            ctaLink="https://x.com/theordersui/status/1938595386387542132"
          >
            we are a community-led research and intelligence collective operating on the sui 
            blockchain. Our mission is to expose threats, elevate transparency, and build powerful 
            tools that empower users and protocols alike.
          </SectionBox>

          <SectionBox
            title="the enlightenment"
            media={
              <video
                src={OrderVideo}
                poster={OrderBanner}
                autoPlay muted loop playsInline
              />
            }
            index={1}
            ctaText="read more"
            ctaLink="https://www.theorder.site/docs/rituals-mechanics/enlightenment"
          >
            enlightenment is the third major phase of the order. a culmination of insight earned through dedication, 
            ritual, and the passage of time. it represents a transformation from the veiled to the revealed, 
            from pixelated identity to detailed understanding.
          </SectionBox>
        </div>
      </section>

      {/* challenges */}
      <section className="challenges container">
        <h2 className="section-title">the current landscape</h2>
        <div className="challenges__grid">
          {challenges.map((c, i) => (
            <motion.div
              key={i}
              className="challenge-item"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: ANIM_DUR, delay: i * ANIM_STAGGER }}
              viewport={{ once: true }}
            >
              <div className="challenge-icon">{c.icon}</div>
              <h3 className="challenge-title">{c.title}</h3>
              <p className="challenge-desc">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* info panels */}
      <section className="info-panels container">
        <div className="info-box">
          <h3>why seer?</h3>
          <ul>
            <li> • user-friendly and easy-to-use tools</li>
            <li> • improved decision making</li>
            <li> • allow data to be your guide</li>
          </ul>
        </div>
        <div className="info-box">
          <h3>what now?</h3>
          <ul>
            <li>• make sure you have an nft from either of our collections </li>
            <li>• click the 'connect wallet' button </li>
            <li>• dive in, do not be afraid</li>
          </ul>
        </div>
      </section>

      {/* footer */}
      <footer className="footer">
        © {new Date().getFullYear()} seer. all rights reserved.
      </footer>
    </div>
  );
}
