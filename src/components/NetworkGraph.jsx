import React, { useEffect, useState, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import axios from 'axios';
import './NetworkGraph.css';

// Copy text to clipboard, with fallback for insecure contexts
async function handleCopyAddress(addr) {
  const text = String(addr);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    console.log('Copied address:', text);
    alert(`Copied address: ${text}`);
  } catch (err) {
    console.error('Failed to copy address:', err);
    alert('🤷‍♂️ Unable to copy address.');
  }
}

const NetworkGraph = ({ wallet }) => {
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cyRef = useRef(null);

  // Utility to shorten wallet addresses
  const shortenAddress = (address, chars) => {
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
  };

  // Format number with commas and 6 decimal places after dividing by 1,000,000,000
  const formatAmount = (amount) => {
    const adjustedAmount = amount / 1000000000;
    const [integerPart, decimalPart = ''] = adjustedAmount.toFixed(6).split('.');
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  };

  useEffect(() => {
    if (!wallet) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const API_KEY = 'insidex_api.ztpSNkFmkDbnT2L7HZORoHYC';
      const headers = { 'x-api-key': API_KEY };

      try {
        const [sentResponse, receivedResponse] = await Promise.all([
          axios.get(`https://api-ex.insidex.trade/coins-transfer/addresses-sent-to/${wallet}`, { headers }),
          axios.get(`https://api-ex.insidex.trade/coins-transfer/addresses-received-from/${wallet}`, { headers }),
        ]);

        if (!Array.isArray(sentResponse.data) || !Array.isArray(receivedResponse.data)) {
          throw new Error('API returned invalid data format');
        }

        const nodeSet = new Set([wallet]);
        const nodes = [];
        const edges = [];

        nodes.push({
          data: {
            id: wallet,
            label: shortenAddress(wallet, 3),
            color: '#FFD700',
          },
          position: { x: 0, y: 0 },
          locked: true, // Lock central node at origin
        });

        const edgeMap = new Map();

        receivedResponse.data.forEach((tx, index) => {
          if (!tx.from || !tx.to || !tx.amount || !tx.coin) {
            console.warn(`Invalid received transaction at index ${index}:`, tx);
            return;
          }
          nodeSet.add(tx.from);
          const coin = tx.coin.split('::').pop();
          const key = `${tx.from}-${tx.to}-received`;
          if (!edgeMap.has(key)) {
            edgeMap.set(key, { count: 0, amounts: {}, direction: 'received', source: tx.from, target: tx.to });
          }
          const edgeData = edgeMap.get(key);
          edgeData.count += 1;
          edgeData.amounts[coin] = (edgeData.amounts[coin] || 0) + parseFloat(tx.amount);
        });

        sentResponse.data.forEach((tx, index) => {
          if (!tx.from || !tx.to || !tx.amount || !tx.coin) {
            console.warn(`Invalid sent transaction at index ${index}:`, tx);
            return;
          }
          nodeSet.add(tx.to);
          const coin = tx.coin.split('::').pop();
          const key = `${tx.from}-${tx.to}-sent`;
          if (!edgeMap.has(key)) {
            edgeMap.set(key, { count: 0, amounts: {}, direction: 'sent', source: tx.from, target: tx.to });
          }
          const edgeData = edgeMap.get(key);
          edgeData.count += 1;
          edgeData.amounts[coin] = (edgeData.amounts[coin] || 0) + parseFloat(tx.amount);
        });

        // Distribute other nodes in a larger circle around the central node
        const radius = 300; // Increased radius for larger circle
        const otherNodes = Array.from(nodeSet).filter((address) => address !== wallet);
        otherNodes.forEach((address, index) => {
          if (!nodes.find((node) => node.data.id === address)) {
            const angle = (index / otherNodes.length) * 2 * Math.PI;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            nodes.push({
              data: {
                id: address,
                label: shortenAddress(address, 3),
                color: '#E0E0E0',
              },
              position: { x, y },
            });
          }
        });

        edgeMap.forEach((data, key) => {
          const { count, amounts, direction, source, target } = data;
          const coinSummaries = Object.entries(amounts)
            .map(([coin, amount]) => `${count} tx ${formatAmount(amount)} ${coin}`)
            .join('\n');
          const label = coinSummaries || `${direction === 'received' ? 'Rcv' : 'Sent'} 0 tx`;
          edges.push({
            data: {
              id: key,
              source,
              target,
              color: '#FF4D4D',
              label,
            },
          });
        });

        setElements([...nodes, ...edges]);
        setLoading(false);
      } catch (err) {
        console.error('API Error:', err);
        setError('Failed to fetch transaction data');
        setLoading(false);
      }
    };

    fetchData();
  }, [wallet]);

  useEffect(() => {
    if (cyRef.current && elements.length > 0) {
      const cy = cyRef.current;
      cy.off('click', 'node');
      cy.on('click', 'node', (event) => {
        const addr = event.target.data('id');
        console.log('Left-click on node, copying:', addr);
        handleCopyAddress(addr);
      });
    }
  }, [elements]);

  return (
    <div className="network-graph-container">
      {loading && <div className="loading-message">Loading graph…</div>}
      {error && <div className="error-message">{error}</div>}
      <CytoscapeComponent
        elements={elements}
        style={{ width: '100%', height: '100%' }}
        stylesheet={[
          {
            selector: 'node',
            style: {
              'background-color': 'data(color)',
              label: 'data(label)',
              'font-family': 'OptimusPrinceps, sans-serif',
              'font-size': '10px',
              color: '#000',
              'text-valign': 'center',
              'text-halign': 'center',
              width: 55,
              height: 55,
              shape: 'ellipse',
              'border-width': 1,
              'border-color': '#000',
            },
          },
          {
            selector: 'edge',
            style: {
              'line-color': 'data(color)',
              'target-arrow-color': 'data(color)',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              width: 1,
              label: 'data(label)',
              'font-family': 'OptimusPrinceps, sans-serif',
              'font-size': '15px',
              color: '#fff',
              'text-background-color': '#000',
              'text-background-opacity': 0.7,
              'text-margin-y': -6,
              'text-wrap': 'wrap',
            },
          },
        ]}
        layout={{
          name: 'cose',
          idealEdgeLength: 200, // Increased for more spacing
          nodeRepulsion: 1000000, // Increased for more spread
          gravity: 0.2, // Reduced to allow wider spread
          numIter: 2500,
          fit: true,
          padding: 50, // Increased padding for larger viewport
          animate: false,
        }}
        cy={(cy) => {
          cyRef.current = cy;
          if (cy.elements().length > 0) {
            cy.fit({ padding: 50 });
            cy.center();
          }
        }}
      />
      <div className="network-legend">
        <span className="legend-color named" /> named
        <span className="legend-color unnamed" /> unnamed
        <span className="arrow-swatch" /> transfer
      </div>
    </div>
  );
};

export default NetworkGraph;