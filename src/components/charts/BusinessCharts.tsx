import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowRight, Building2, Users, Store } from 'lucide-react';
import { forwardRef } from 'react';

// ==========================================
// ⚠️ WARNING: NO HARDCODED DATA ALLOWED HERE
// All data must come through props only.
// ==========================================

// Types for chart data
export interface MarketGrowthData {
  year: string;
  value: number;
}

export interface BusinessModelData {
  partner: string;
  partner_value: string;
  platform: string;
  customer: string;
  customer_value: string;
}

export interface TamSamSomData {
  tam: { value: string; desc: string };
  sam: { value: string; desc: string };
  som: { value: string; desc: string };
}

// 1. 시장 성장성 그래프 (1-1)
interface MarketGrowthChartProps {
  data: MarketGrowthData[];
}

export const MarketGrowthChart = forwardRef<HTMLDivElement, MarketGrowthChartProps>(
  ({ data }, ref) => {
    // 데이터가 없으면 placeholder 표시
    if (!data || data.length === 0) {
      return (
        <div ref={ref} className="bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4 text-center text-slate-700">📈 목표 시장 성장 추이</h3>
          <div className="h-[280px] flex items-center justify-center text-slate-400">
            데이터가 입력되면 차트가 표시됩니다.
          </div>
        </div>
      );
    }

    return (
      <div className="border rounded-xl p-6 bg-white shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-center text-slate-700">📈 목표 시장 성장 추이</h3>
        <div ref={ref} className="bg-white p-4 h-[280px] flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="marketGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <Tooltip formatter={(value) => [`${value}억 원`, '규모']} />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#marketGrowthGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
);

MarketGrowthChart.displayName = 'MarketGrowthChart';

// 2. 비즈니스 모델 도식 (3-1-1)
interface BusinessModelDiagramProps {
  data: BusinessModelData;
}

export const BusinessModelDiagram = forwardRef<HTMLDivElement, BusinessModelDiagramProps>(
  ({ data }, ref) => {
    // 데이터가 불완전하면 placeholder 표시
    if (!data || !data.platform) {
      return (
        <div ref={ref} className="bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4 text-center text-slate-700">🔄 비즈니스 모델(BM) 구조</h3>
          <div className="h-[280px] flex items-center justify-center text-slate-400">
            데이터가 입력되면 구조도가 표시됩니다.
          </div>
        </div>
      );
    }

    const { partner, partner_value, customer, customer_value, platform } = data;

    return (
      <div className="border rounded-xl p-6 bg-white shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-center text-slate-700">🔄 비즈니스 모델(BM) 구조</h3>
        <div ref={ref} className="bg-white p-8 h-[280px] flex items-center justify-center">
          <div className="flex items-center justify-between w-full max-w-2xl gap-3">
            {/* 파트너 */}
            <div className="flex flex-col items-center gap-2 p-4 border-2 border-slate-200 rounded-xl bg-slate-50 w-36 min-h-[120px]">
              <Store className="w-8 h-8 text-slate-500" />
              <span className="font-bold text-sm text-center text-slate-700">{partner}</span>
            </div>

            {/* 화살표 L */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-blue-600 text-center">{partner_value}</span>
              <ArrowRight className="w-6 h-6 text-slate-300" />
            </div>

            {/* 플랫폼 (중앙) */}
            <div className="flex flex-col items-center gap-2 p-5 border-2 border-blue-500 rounded-xl bg-blue-50 w-44 shadow-md z-10 min-h-[140px]">
              <Building2 className="w-10 h-10 text-blue-600" />
              <span className="font-bold text-blue-700 text-center">{platform}</span>
            </div>

            {/* 화살표 R */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-blue-600 text-center">서비스 제공</span>
              <ArrowRight className="w-6 h-6 text-slate-300" />
              <span className="text-[10px] font-semibold text-slate-500 text-center">{customer_value}</span>
            </div>

            {/* 고객 */}
            <div className="flex flex-col items-center gap-2 p-4 border-2 border-slate-200 rounded-xl bg-slate-50 w-36 min-h-[120px]">
              <Users className="w-8 h-8 text-slate-500" />
              <span className="font-bold text-sm text-center text-slate-700">{customer}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

BusinessModelDiagram.displayName = 'BusinessModelDiagram';

// 3. TAM/SAM/SOM (3-1-2)
interface TamSamSomChartProps {
  data: TamSamSomData;
}

export const TamSamSomChart = forwardRef<HTMLDivElement, TamSamSomChartProps>(
  ({ data }, ref) => {
    // 데이터가 불완전하면 placeholder 표시
    if (!data || !data.tam) {
      return (
        <div ref={ref} className="bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4 text-center text-slate-700">🎯 시장 규모 추정 (TAM/SAM/SOM)</h3>
          <div className="h-[350px] flex items-center justify-center text-slate-400">
            데이터가 입력되면 시장 규모가 표시됩니다.
          </div>
        </div>
      );
    }

    const { tam, sam, som } = data;

    return (
      <div className="border rounded-xl p-6 bg-white shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-center text-slate-700">🎯 시장 규모 추정 (TAM/SAM/SOM)</h3>
        <div ref={ref} className="bg-white p-4 h-[350px] flex items-end justify-center pb-6">
          <div className="relative w-[300px] h-[300px] flex justify-center items-end">
            {/* TAM */}
            <div className="absolute w-full h-full rounded-full border-2 border-slate-300 bg-slate-50 flex flex-col items-center pt-4 shadow-sm">
              <span className="font-bold text-slate-600">TAM (전체 시장)</span>
              <span className="text-xs text-slate-400 mb-1">{tam.desc}</span>
              <span className="font-bold text-lg text-slate-700">{tam.value}</span>
            </div>

            {/* SAM */}
            <div className="absolute w-[210px] h-[210px] rounded-full border-2 border-slate-400 bg-slate-200 flex flex-col items-center pt-4 shadow-sm z-10 bottom-1">
              <span className="font-bold text-slate-700">SAM (유효 시장)</span>
              <span className="text-xs text-slate-500 mb-1">{sam.desc}</span>
              <span className="font-bold text-lg text-slate-800">{sam.value}</span>
            </div>

            {/* SOM */}
            <div className="absolute w-[110px] h-[110px] rounded-full border-4 border-blue-500 bg-white flex flex-col items-center justify-center shadow-md z-20 bottom-3">
              <span className="font-bold text-blue-600">SOM</span>
              <span className="text-[9px] text-blue-400">{som.desc}</span>
              <span className="font-extrabold text-lg text-blue-700">{som.value}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

TamSamSomChart.displayName = 'TamSamSomChart';
