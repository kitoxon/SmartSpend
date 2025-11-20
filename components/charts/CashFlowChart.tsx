import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

type TrendDatum = { name: string; income: number; expense: number };

interface Props {
  data: TrendDatum[];
  formatJPY: (v: number) => string;
}

const BAR_COLORS = {
  income: '#ffffff',
  expense: '#71717a',
};

const CashFlowChart: React.FC<Props> = ({ data, formatJPY }) => (
  <div className="h-40 w-full min-w-0 min-h-0">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 9, fill: '#71717a', fontFamily: 'Manrope' }}
          dy={10}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 9, fill: '#71717a', fontFamily: 'Manrope' }}
        />
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
    </ResponsiveContainer>
  </div>
);

export default CashFlowChart;
