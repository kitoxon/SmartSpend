import React, { useLayoutEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

type TrendDatum = { name: string; income: number; expense: number };

interface Props {
  data: TrendDatum[];
  formatJPY: (v: number) => string;
}

const BAR_COLORS = {
  income: '#ffffff',
  expense: '#71717a',
};

const CHART_HEIGHT = 160;

const CashFlowChart: React.FC<Props> = ({ data, formatJPY }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateWidth = () => setWidth(Math.max(0, Math.floor(host.getBoundingClientRect().width)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className="w-full min-w-0"
      style={{ width: '100%', minWidth: 0, height: CHART_HEIGHT, minHeight: CHART_HEIGHT }}
    >
      {width > 0 && (
        <BarChart width={width} height={CHART_HEIGHT} data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#71717a', fontFamily: 'Manrope' }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#71717a', fontFamily: 'Manrope' }} />
          <Tooltip
            cursor={{ fill: '#27272a', opacity: 0.4 }}
            contentStyle={{
              backgroundColor: '#18181b',
              borderRadius: '6px',
              border: '1px solid #27272a',
              color: '#e4e4e7',
              fontFamily: 'Manrope',
              fontSize: '11px',
            }}
            itemStyle={{ color: '#e4e4e7' }}
            formatter={(value: number) => [formatJPY(value)]}
          />
          <Bar dataKey="income" name="Income" fill={BAR_COLORS.income} radius={[2, 2, 0, 0]} barSize={8} />
          <Bar dataKey="expense" name="Expense" fill={BAR_COLORS.expense} radius={[2, 2, 0, 0]} barSize={8} />
        </BarChart>
      )}
    </div>
  );
};

export default CashFlowChart;
