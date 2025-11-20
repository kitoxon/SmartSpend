import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Category, CATEGORY_COLORS } from '../../constants';

type CategoryDatum = { name: Category; value: number };

interface Props {
  data: CategoryDatum[];
  formatJPY: (v: number) => string;
}

const CategoryChart: React.FC<Props> = ({ data, formatJPY }) => (
  <div className="h-64 w-full min-w-0 min-h-0">
    {data.length > 0 ? (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={4}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name as Category]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [formatJPY(value), 'Amount']}
            contentStyle={{
              backgroundColor: '#18181b',
              borderRadius: '6px',
              border: '1px solid #27272a',
              color: '#fff',
              fontFamily: 'Manrope',
              fontSize: '11px',
            }}
            itemStyle={{ color: '#fff' }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: '10px', fontFamily: 'Manrope', color: '#71717a', paddingTop: '24px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    ) : (
      <div className="h-full flex items-center justify-center text-zinc-700 text-xs">No activity</div>
    )}
  </div>
);

export default CategoryChart;
