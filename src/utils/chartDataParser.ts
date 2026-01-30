/**
 * Utility to parse chart data from AI-generated content
 * Extracts [CHART_DATA] blocks and converts them to structured data
 */

import { 
  MarketGrowthData, 
  BusinessModelData, 
  TamSamSomData 
} from '@/components/charts/BusinessCharts';

export interface ParsedChartData {
  marketGrowth?: MarketGrowthData[];
  businessModel?: BusinessModelData;
  tamSamSom?: TamSamSomData;
}

/**
 * Extract chart data JSON from text content
 * Looks for [CHART_DATA] ... [/CHART_DATA] blocks
 */
export function extractChartDataFromText(text: string): ParsedChartData | null {
  const startTag = '[CHART_DATA]';
  const endTag = '[/CHART_DATA]';
  
  const startIdx = text.indexOf(startTag);
  if (startIdx === -1) return null;
  
  const contentStart = startIdx + startTag.length;
  const endIdx = text.indexOf(endTag, contentStart);
  
  if (endIdx === -1) return null;
  
  const jsonStr = text.slice(contentStart, endIdx).trim();
  
  try {
    const data = JSON.parse(jsonStr);
    return normalizeChartData(data);
  } catch (e) {
    console.error('Failed to parse chart data JSON:', e);
    return null;
  }
}

/**
 * Normalize and validate chart data structure
 */
function normalizeChartData(data: any): ParsedChartData {
  const result: ParsedChartData = {};
  
  // Market Growth data
  if (data.marketGrowth && Array.isArray(data.marketGrowth)) {
    result.marketGrowth = data.marketGrowth.map((item: any) => ({
      year: String(item.year || item.연도 || ''),
      value: Number(item.value || item.규모 || 0),
    }));
  }
  
  // Business Model data
  if (data.businessModel) {
    result.businessModel = {
      partner: data.businessModel.partner || data.businessModel.파트너 || '파트너',
      partner_value: data.businessModel.partner_value || data.businessModel.파트너가치 || '가치 제공',
      platform: data.businessModel.platform || data.businessModel.플랫폼 || '플랫폼',
      customer: data.businessModel.customer || data.businessModel.고객 || '고객',
      customer_value: data.businessModel.customer_value || data.businessModel.고객가치 || '이용료',
    };
  }
  
  // TAM/SAM/SOM data
  if (data.tamSamSom) {
    result.tamSamSom = {
      tam: {
        value: data.tamSamSom.tam?.value || data.tamSamSom.tam?.규모 || '0원',
        desc: data.tamSamSom.tam?.desc || data.tamSamSom.tam?.설명 || '전체 시장',
      },
      sam: {
        value: data.tamSamSom.sam?.value || data.tamSamSom.sam?.규모 || '0원',
        desc: data.tamSamSom.sam?.desc || data.tamSamSom.sam?.설명 || '유효 시장',
      },
      som: {
        value: data.tamSamSom.som?.value || data.tamSamSom.som?.규모 || '0원',
        desc: data.tamSamSom.som?.desc || data.tamSamSom.som?.설명 || '수익 시장',
      },
    };
  }
  
  return result;
}

/**
 * Remove chart data blocks from text content
 * Used to clean the document text after extracting chart data
 */
export function removeChartDataFromText(text: string): string {
  const regex = /\[CHART_DATA\][\s\S]*?\[\/CHART_DATA\]/g;
  return text.replace(regex, '').trim();
}

/**
 * Check if text contains chart data block
 */
export function hasChartData(text: string): boolean {
  return text.includes('[CHART_DATA]') && text.includes('[/CHART_DATA]');
}
