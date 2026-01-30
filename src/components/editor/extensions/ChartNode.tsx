import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { 
  MarketGrowthChart, 
  BusinessModelDiagram, 
  TamSamSomChart,
  MarketGrowthData,
  BusinessModelData,
  TamSamSomData
} from '@/components/charts/BusinessCharts';

// Chart node types
export type ChartType = 'market-growth' | 'bm-diagram' | 'tam-sam-som';

export interface ChartNodeAttributes {
  type: ChartType;
  chartDataStr: string;
}

// React component for rendering the chart in the editor
const ChartNodeView = ({ node }: { node: { attrs: ChartNodeAttributes } }) => {
  const { type, chartDataStr } = node.attrs;

  // Parse JSON string to object
  let chartData: MarketGrowthData[] | BusinessModelData | TamSamSomData | null = null;
  try {
    if (chartDataStr && chartDataStr !== '{}' && chartDataStr !== '[]') {
      chartData = JSON.parse(chartDataStr);
    }
  } catch (e) {
    console.error('Failed to parse chart data JSON:', e);
  }

  const renderChart = () => {
    if (!chartData) {
      return (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 text-center text-slate-400">
          차트 데이터를 로딩 중...
        </div>
      );
    }

    switch (type) {
      case 'market-growth':
        return <MarketGrowthChart data={chartData as MarketGrowthData[]} />;
      case 'bm-diagram':
        return <BusinessModelDiagram data={chartData as BusinessModelData} />;
      case 'tam-sam-som':
        return <TamSamSomChart data={chartData as TamSamSomData} />;
      default:
        return null;
    }
  };

  return (
    <NodeViewWrapper className="react-chart-node my-6">
      {renderChart()}
    </NodeViewWrapper>
  );
};

// Tiptap Node Extension
export const ChartNode = Node.create({
  name: 'chartBlock',
  group: 'block',
  atom: true, // Non-editable single object

  addAttributes() {
    return {
      type: { 
        default: 'market-growth' as ChartType,
        parseHTML: element => element.getAttribute('data-type') || 'market-growth',
        renderHTML: attributes => ({ 'data-type': attributes.type }),
      },
      chartDataStr: { 
        default: '{}',
        parseHTML: element => element.getAttribute('data-chart-data') || '{}',
        renderHTML: attributes => ({ 'data-chart-data': attributes.chartDataStr }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'chart-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['chart-block', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView as any);
  },
});

export default ChartNode;
