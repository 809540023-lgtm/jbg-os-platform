/**
 * @jbg/eval —— Loop/Agent 輸出品質評分（§0.4 layer10，docs/12 §12.7）。
 * golden set + grader + 門檻；EvalRun 落庫。實作在 Beta 品質基建（B-C）。
 * 此處為 grader 介面骨架，讓 Agent 開發時可掛 golden case。
 */
export interface GradeResult {
  score: number; // 0..1
  passed: boolean;
  detail?: string;
}

export interface Grader<O = unknown> {
  id: string;
  grade: (output: O, expected: O) => GradeResult;
}

export interface GoldenCase<I = unknown, O = unknown> {
  id: string;
  input: I;
  expected: O;
}
