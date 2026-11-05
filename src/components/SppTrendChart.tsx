import React, { useEffect, useRef } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { formatRupiah, Transaction } from '../types';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface SppTrendChartProps {
  transactions: Transaction[];
  darkMode: boolean;
  accentTheme?: string;
}

const CHART_PALETTE: Record<string, { bar: string; hover: string; darkBar: string; darkHover: string }> = {
  navy: { bar: '#0284c7', hover: '#0369a1', darkBar: '#38bdf8', darkHover: '#7dd3fc' },
  emerald: { bar: '#047857', hover: '#065f46', darkBar: '#10b981', darkHover: '#34d399' },
  amber: { bar: '#d97706', hover: '#b45309', darkBar: '#f59e0b', darkHover: '#fbbf24' },
  teal: { bar: '#dc2626', hover: '#b91c1c', darkBar: '#ef4444', darkHover: '#f87171' },
  indigo: { bar: '#4338ca', hover: '#3730a3', darkBar: '#6366f1', darkHover: '#818cf8' },
};

export const SppTrendChart: React.FC<SppTrendChartProps> = ({
  transactions,
  darkMode,
  accentTheme = 'emerald',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Hitung 7 hari terakhir (YYYY-MM-DD)
    const days: { dateStr: string; label: string; totalSpp: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const label = d.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      });

      const daySpp = transactions
        .filter((tx) => tx.txDate === dateStr && tx.sppAmount > 0)
        .reduce((sum, tx) => sum + tx.sppAmount, 0);

      days.push({ dateStr, label, totalSpp: daySpp });
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const textColor = darkMode ? '#94a3b8' : '#475569';
    const gridColor = darkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)';
    const palette = CHART_PALETTE[accentTheme] || CHART_PALETTE.emerald;

    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: days.map((d) => d.label),
        datasets: [
          {
            label: 'Penerimaan Pos SPP (Rp)',
            data: days.map((d) => d.totalSpp),
            backgroundColor: darkMode ? palette.darkBar : palette.bar,
            hoverBackgroundColor: darkMode ? palette.darkHover : palette.hover,
            borderRadius: 6,
            maxBarThickness: 44,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `SPP Masuk: ${formatRupiah(Number(ctx.raw || 0))}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: textColor,
              font: { family: "'Inter', sans-serif", size: 12 },
            },
            grid: {
              display: false,
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 12 },
              callback: (value) => {
                const num = Number(value);
                if (num >= 1000000) return `Rp ${(num / 1000000).toFixed(1)} Jt`;
                if (num >= 1000) return `Rp ${(num / 1000).toFixed(0)} Rb`;
                return `Rp ${num}`;
              },
            },
            grid: {
              color: gridColor,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [transactions, darkMode, accentTheme]);

  return (
    <div className="relative h-64 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
};
