// 与 Rust 侧序列化结构保持一致

export type Route = "CAPE" | "RED SEA";

export interface QuoteRow {
  carrier: string;
  pol: string[];
  pod: string[];
  price20: number | null;
  price40: number | null;
  validity: string | null;
  ft: string | null;
  ows: string | null;
  remark: string | null;
  route: Route;
}

export interface PricingData {
  rows: QuoteRow[];
  source_name: string;
  /** 解析提示（船司未识别航线 / 配置回退等）；空 = 一切正常 */
  warnings?: string[];
}

export type Size = "20GP" | "40HQ";

export interface QuoteRequest {
  pol: string;
  pod: string;
  sizes: Size[];
  weight: number | null;
  route: Route | null;
}
