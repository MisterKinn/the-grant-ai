import { forwardRef, useImperativeHandle, useRef } from 'react';
import { 
  MarketGrowthChart, 
  BusinessModelDiagram, 
  TamSamSomChart,
  MarketGrowthData,
  BusinessModelData,
  TamSamSomData
} from '@/components/charts/BusinessCharts';

// ==========================================
// ⚠️ WARNING: NO HARDCODED DATA IN THIS FILE
// All data must come through props only.
// ==========================================

export interface ChartData {
  marketGrowth?: MarketGrowthData[];
  businessModel?: BusinessModelData;
  tamSamSom?: TamSamSomData;
}

export interface ChartPreviewHandle {
  getRefs: () => (HTMLDivElement | null)[];
}

interface ChartPreviewProps {
  data?: ChartData;
}

export const ChartPreview = forwardRef<ChartPreviewHandle, ChartPreviewProps>(
  ({ data }, ref) => {
    const marketGrowthRef = useRef<HTMLDivElement>(null);
    const businessModelRef = useRef<HTMLDivElement>(null);
    const tamSamSomRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      getRefs: () => [marketGrowthRef.current, businessModelRef.current, tamSamSomRef.current]
    }));

    // If no data provided, show placeholder message
    const hasAnyData = data && (data.marketGrowth || data.businessModel || data.tamSamSom);
    
    if (!hasAnyData) {
      return (
        <div className="flex flex-col gap-8 mt-10">
          <div className="border border-dashed border-slate-300 rounded-xl p-8 bg-slate-50 text-center">
            <p className="text-slate-500 mb-2">📊 시각화 차트 영역</p>
            <p className="text-sm text-slate-400">
              AI가 사업계획서를 생성하면 자동으로 차트가 표시됩니다.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-8 mt-10">
        {/* 1. Market Growth Chart - only render if data exists */}
        {data.marketGrowth && data.marketGrowth.length > 0 && (
          <MarketGrowthChart ref={marketGrowthRef} data={data.marketGrowth} />
        )}

        {/* 2. Business Model Diagram - only render if data exists */}
        {data.businessModel && (
          <BusinessModelDiagram ref={businessModelRef} data={data.businessModel} />
        )}

        {/* 3. TAM/SAM/SOM Chart - only render if data exists */}
        {data.tamSamSom && (
          <TamSamSomChart ref={tamSamSomRef} data={data.tamSamSom} />
        )}
      </div>
    );
  }
);

ChartPreview.displayName = "ChartPreview";
